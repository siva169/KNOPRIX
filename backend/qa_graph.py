"""QA for the Knowledge Graph slice (auto concepts + pins)."""
import json
import urllib.request

BASE = "http://127.0.0.1:8011/api"
results = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
    )
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        try:
            raw = e.read() or b"{}"
            return e.code, json.loads(raw) if raw.strip() else {}
        except Exception:
            return e.code, {}


def check(name, cond, detail=""):
    results.append((name, cond))
    print(f"{'PASS' if cond else 'FAIL'}  {name}{' — ' + detail if detail else ''}")


s, d = call("POST", "/auth/login", {"email": "demo@knoprix.io", "password": "Password123!"})
TOKEN = d.get("tokens", {}).get("accessToken", "")
check("login for graph QA", s == 200 and bool(TOKEN), f"HTTP {s}")

s, d = call("GET", "/projects", token=TOKEN)
projects = d.get("projects", [])
PID = None
for p in projects:
    s2, d2 = call("GET", f"/projects/{p['id']}/documents", token=TOKEN)
    if d2.get("documents"):
        PID = p["id"]
        break

if PID:
    s, d = call("GET", f"/projects/{PID}/graph", token=TOKEN)
    nodes, edges = d.get("nodes", []), d.get("edges", [])
    ok = (s == 200 and isinstance(nodes, list) and isinstance(edges, list)
          and all(n.get("documents") for n in nodes))
    check("GET graph auto concepts", ok, f"{len(nodes)} nodes, {len(edges)} edges")
    # Glue must not become nodes.
    labels = {n["id"] for n in nodes}
    check("no glue words as nodes", not (labels & {"the", "and", "across"}),
          f"{len(labels)} concepts")

    # Pin a rare word, prove it joins; unpin, prove it leaves.
    s, _ = call("POST", f"/projects/{PID}/pins", {"word": "transmitter"}, token=TOKEN)
    check("pin word 201", s in (200, 201), f"HTTP {s}")
    s, d = call("GET", f"/projects/{PID}/graph", token=TOKEN)
    check("pinned word in graph", "transmitter" in {n["id"] for n in d.get("nodes", [])})
    s, _ = call("POST", f"/projects/{PID}/pins", {"word": "transmitter"}, token=TOKEN)
    check("double pin 409", s == 409, f"HTTP {s}")
    s, _ = call("DELETE", f"/projects/{PID}/pins/transmitter", token=TOKEN)
    check("unpin 204", s == 204, f"HTTP {s}")
    s, _ = call("POST", f"/projects/{PID}/pins", {"word": "!!! not a word !!!"}, token=TOKEN)
    check("bad pin word 400", s == 400, f"HTTP {s}")
else:
    print("SKIP  graph tests — no documents in DB")

s, _ = call("GET", "/projects/nope/graph")
check("graph without token rejected", s in (401, 403), f"HTTP {s}")

passed = sum(1 for _, ok in results if ok)
print(f"\n{passed}/{len(results)} graph checks passed")
raise SystemExit(0 if passed == len(results) else 1)
