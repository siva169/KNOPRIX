"""QA: native Supabase Storage REST client (stdlib urllib).

Spins up a fake Storage API (http.server) and exercises the full public
surface of app.services.storage through real HTTP:
  upload (streamed POST), download, delete, stream, endpoint normalization
  (/s3 suffix stripping), space-containing keys, and error mapping.
No boto3, no network beyond localhost.
"""
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).parent))

PORT_PLACEHOLDER = None  # bound at runtime in main()
FAKE = {}  # quoted request path -> bytes
CAPTURED = {}  # last request's headers + content-length


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _guard(self):
        CAPTURED["headers"] = {k.lower(): v for k, v in self.headers.items()}
        auth = self.headers.get("Authorization", "")
        if auth != "Bearer test-key" or self.headers.get("apikey") != "test-key":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'"Invalid API key"')
            return False
        return True

    def do_POST(self):
        if not self._guard():
            return
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        CAPTURED["content_length"] = length
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"Key": "ok"}')
        FAKE[self.path] = body

    def do_GET(self):
        if not self._guard():
            return
        if self.path not in FAKE:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error":"The resource was not found"}')
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.end_headers()
        self.wfile.write(FAKE[self.path])

    def do_DELETE(self):
        if not self._guard():
            return
        if self.path not in FAKE:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error":"The resource was not found"}')
            return
        del FAKE[self.path]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"{}")


def run_checks(port):
    from app.services import storage
    from app.services.storage import StorageError

    results = []

    def check(name, cond, detail=""):
        results.append((name, bool(cond)))
        print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))

    base = f"http://127.0.0.1:{port}/storage/v1"
    check("endpoint normalizes (strips /s3 suffix)", storage._base_url() == base, storage._base_url())

    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "Section 2 & Signals.pptx"
        payload = b"%PDF-1.4 fake document bytes " * 1000  # ~26KB, streamed from disk
        src.write_bytes(payload)
        key = "documents/abc-123/Section 2 & Signals.pptx"
        # The fake server keys objects by the FULL request path, exactly as received.
        quoted = "/storage/v1/object/knoprix-documents/" + quote(key, safe="/")

        storage.upload(src, key, "application/pdf")
        check("upload streams exact bytes", FAKE.get(quoted) == payload,
              f"stored {len(FAKE.get(quoted, b''))} vs {len(payload)}")
        check("upload sent exact Content-Length", CAPTURED.get("content_length") == len(payload),
              str(CAPTURED.get("content_length")))
        check("auth sent as Bearer + apikey",
              CAPTURED.get("headers", {}).get("authorization") == "Bearer test-key"
              and CAPTURED.get("headers", {}).get("apikey") == "test-key")

        dest = Path(td) / "out" / "copy.pptx"
        storage.download(key, dest)
        check("download round-trips bytes", dest.read_bytes() == payload)

        got = b"".join(storage.stream(key))
        check("stream reassembles chunks", got == payload)

        storage.delete(key)
        check("delete removes object", quoted not in FAKE)

        try:
            storage.download("documents/ghost/none.pdf", Path(td) / "ghost.bin")
            check("missing object raises StorageError with status", False, "no exception raised")
        except StorageError as exc:
            check("missing object raises StorageError with status",
                  "HTTP 404" in str(exc) and "resource was not found" in str(exc), str(exc))

    # Misconfiguration: empty API key -> StorageError, not silent failure.
    real_key = storage.cfg.OBJECT_STORAGE_API_KEY
    storage.cfg.OBJECT_STORAGE_API_KEY = ""
    try:
        storage._open("GET", "object/x/y")
        check("missing API key raises StorageError", False, "no exception raised")
    except StorageError as exc:
        check("missing API key raises StorageError", "API_KEY" in str(exc), str(exc))
    finally:
        storage.cfg.OBJECT_STORAGE_API_KEY = real_key

    return results


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]

    # Configure via environment BEFORE app.config is imported.
    os.environ["OBJECT_STORAGE_ENDPOINT"] = f"http://127.0.0.1:{port}/storage/v1/s3"
    os.environ["OBJECT_STORAGE_BUCKET"] = "knoprix-documents"
    os.environ["OBJECT_STORAGE_API_KEY"] = "test-key"

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        results = run_checks(port)
    finally:
        server.shutdown()
        server.server_close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
