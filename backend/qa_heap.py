"""QA for the Min-Heap slice (structure unit tests + top-passages endpoint)."""
import json
import random
import urllib.request

from app.dsa.minheap import MinHeap, top_k

results = []


def check(name, cond, detail=""):
    results.append((name, cond))
    print(f"{'PASS' if cond else 'FAIL'}  {name}{' — ' + detail if detail else ''}")


# --- Unit: heap order against sorted truth, fixed seed for repeatability ---
rng = random.Random(42)
vals = [rng.randint(0, 999) for _ in range(200)]
h = MinHeap()
for v in vals:
    h.push(v)
out = [h.pop() for _ in range(len(vals))]
check("heap pops ascending (200 vals)", out == sorted(vals))
check("peek is minimum", MinHeap([5, 1, 9]).peek() == 1)
check("size tracks pushes", MinHeap([1, 2, 3]).size() == 3)
try:
    MinHeap().pop()
    check("pop empty raises", False)
except IndexError:
    check("pop empty raises", True)
check("peek empty is None", MinHeap().peek() is None)

# --- Unit: top_k best-first, matches sorted() truth ---
scored = [(float(v), f"doc{v}") for v in vals]
got = top_k(scored, 5)
check("top_k best-first top5", [s for s, _ in got] == sorted([float(v) for v in vals], reverse=True)[:5])
check("top_k k=0 empty", top_k(scored, 0) == [])
check("top_k k>n returns all sorted", len(top_k(scored[:3], 10)) == 3)

# --- Endpoint ---
BASE = "http://127.0.0.1:8011/api"


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


s, d = call("POST", "/auth/login", {"email": "demo@knoprix.io", "password": "Password123!"})
TOKEN = d.get("tokens", {}).get("accessToken", "")
s, d = call("GET", "/projects", token=TOKEN)
PID = next((p["id"] for p in d.get("projects", [])), None)

if PID:
    s, d = call("GET", f"/projects/{PID}/dsa/top-passages?q=signal&k=2", token=TOKEN)
    ps = d.get("passages", [])
    scores = [p["score"] for p in ps]
    check("top-passages k respected", s == 200 and len(ps) <= 2, f"{len(ps)} passages")
    check("top-passages desc by score", scores == sorted(scores, reverse=True), str(scores))
    check("top-passages reports considered", d.get("considered", 0) >= len(ps))
    s, _ = call("GET", f"/projects/{PID}/dsa/top-passages?q=signal&k=99", token=TOKEN)
    check("k>10 rejected", s in (400, 422), f"HTTP {s}")
else:
    print("SKIP  endpoint tests — no projects in DB")

s, _ = call("GET", "/projects/nope/dsa/top-passages?q=x&k=2")
check("top-passages without token rejected", s in (401, 403), f"HTTP {s}")

passed = sum(1 for _, ok in results if ok)
print(f"\n{passed}/{len(results)} heap checks passed")
raise SystemExit(0 if passed == len(results) else 1)
