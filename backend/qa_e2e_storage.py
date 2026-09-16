"""QA: full end-to-end upload/stream/delete through the REAL FastAPI app.

Boots uvicorn in a thread against a fake Supabase Storage server, then over
real HTTP: register -> obtain project -> upload PDF -> require s3:// path ->
stream the file back byte-identical -> delete. Covers the router<->storage
seam that module-level tests cannot see.
"""
import json
import os
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

FAKE = {}  # full request path -> bytes
API = {}  # set in main(): base url + bearer token


class StorageHandler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _authed(self):
        return self.headers.get("Authorization", "") == "Bearer test-key"

    def do_POST(self):
        if not self._authed():
            self.send_response(401); self.end_headers(); return
        length = int(self.headers.get("Content-Length") or 0)
        FAKE[self.path] = self.rfile.read(length)
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"Key":"ok"}')

    def do_GET(self):
        if not self._authed():
            self.send_response(401); self.end_headers(); return
        if self.path not in FAKE:
            self.send_response(404); self.end_headers()
            self.wfile.write(b'{"error":"The resource was not found"}'); return
        self.send_response(200); self.end_headers(); self.wfile.write(FAKE[self.path])

    def do_DELETE(self):
        if not self._authed():
            self.send_response(401); self.end_headers(); return
        FAKE.pop(self.path, None)
        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")


def api(method, path, token=None, body=None, raw=None, content_type=None):
    url = API["base"] + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", content_type or "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            payload = r.read()
            return r.status, payload
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), StorageHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    os.environ["OBJECT_STORAGE_ENDPOINT"] = f"http://127.0.0.1:{port}/storage/v1/s3"
    os.environ["OBJECT_STORAGE_BUCKET"] = "knoprix-documents"
    os.environ["OBJECT_STORAGE_API_KEY"] = "test-key"

    results = []

    def check(name, cond, detail=""):
        results.append(bool(cond))
        print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))

    # Boot the real app on a specific free port.
    import socket
    import uvicorn
    from app.main import app

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        free_port = s.getsockname()[1]
    API["base"] = f"http://127.0.0.1:{free_port}"
    config = uvicorn.Config(app, host="127.0.0.1", port=free_port, log_level="error")
    server_uv = uvicorn.Server(config)
    threading.Thread(target=server_uv.run, daemon=True).start()
    for _ in range(80):
        try:
            with urllib.request.urlopen(API["base"] + "/api/health", timeout=1) as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(0.25)
    else:
        check("app booted", False, "health never returned 200")
        return 1

    # Register a fresh user (register returns tokens directly).
    email = f"qa-{uuid.uuid4().hex[:8]}@example.com"
    status, payload = api("POST", "/api/auth/register",
                          body={"email": email, "password": "Password123!", "fullName": "QA Bot"})
    token = json.loads(payload).get("tokens", {}).get("accessToken", "") if status == 201 else ""
    check("register returns access token", bool(token), f"HTTP {status}: {payload[:120]}")

    # Project: create one; fall back to the first existing (seeded) project.
    status, payload = api("POST", "/api/projects", token=token, body={"name": "QA Storage E2E"})
    project_id = ""
    if status in (200, 201):
        body = json.loads(payload)
        project_id = (body.get("project") or body).get("id", "")
    if not project_id:
        status2, payload2 = api("GET", "/api/projects", token=token)
        rows = json.loads(payload2)
        rows = rows.get("projects", rows if isinstance(rows, list) else [])
        if rows:
            project_id = rows[0]["id"]
    check("project available", bool(project_id), f"HTTP {status}: {payload[:120]}")

    # Valid single-page PDF (correct startxref) — parser must accept it.
    obj1 = b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    obj2 = b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    obj3 = b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n"
    body_bytes = b"%PDF-1.4\n" + obj1 + obj2 + obj3
    xref_pos = len(body_bytes)
    xref = b"xref\n0 4\n0000000000 65535 f \n"
    for off in (9, 9 + len(obj1), 9 + len(obj1) + len(obj2)):
        xref += b"%010d 00000 n \n" % off
    pdf = body_bytes + xref + b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n" + \
        str(xref_pos).encode() + b"\n%%EOF"

    boundary = "----knoprixqa"
    part = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"qa-e2e-test.pdf\"\r\nContent-Type: application/pdf\r\n\r\n"
    ).encode() + pdf + f"\r\n--{boundary}--\r\n".encode()
    status, payload = api(
        "POST", f"/api/projects/{project_id}/documents/upload", token=token,
        raw=part, content_type=f"multipart/form-data; boundary={boundary}",
    )
    doc = json.loads(payload).get("document", {}) if status == 201 else {}
    doc_id = doc.get("id", "")
    file_path = doc.get("file_path", "")
    check("upload returns 201", status == 201, f"HTTP {status}: {payload[:150]}")
    check("file_path is s3:// key", file_path.startswith("s3://documents/"), file_path[:80])

    quoted_key = "/storage/v1/object/knoprix-documents/" + file_path[5:].replace(" ", "%20")
    check("object reached fake Storage", FAKE.get(quoted_key) == pdf,
          f"stored {len(FAKE.get(quoted_key, b''))} vs {len(pdf)}")

    status, payload = api("GET", f"/api/documents/{doc_id}/stream", token=token)
    check("stream returns 200", status == 200, f"HTTP {status}: {payload[:120]}")
    check("stream bytes identical to upload", payload == pdf,
          f"streamed {len(payload)} vs {len(pdf)}")

    status, _ = api("DELETE", f"/api/documents/{doc_id}", token=token)
    check("delete returns 204", status == 204, f"HTTP {status}")
    check("object removed from Storage", quoted_key not in FAKE)

    server.shutdown()
    server_uv.should_exit = True

    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
