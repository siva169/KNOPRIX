"""Smoke tests for the core backend routes (foundation-shell slice QA)."""
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
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(name, cond, detail=""):
    results.append((name, cond))
    print(f"{'PASS' if cond else 'FAIL'}  {name}{' — ' + detail if detail else ''}")


# 1. Health
s, d = call("GET", "/health")
check("GET /health", s == 200 and d.get("status") == "ok", str(d))

# 2. Demo login
s, d = call("POST", "/auth/login", {"email": "demo@knoprix.io", "password": "Password123!"})
token = d.get("tokens", {}).get("accessToken", "")
check("POST /auth/login (demo)", s == 200 and bool(token), f"HTTP {s}")

# 3. /auth/me
s, d = call("GET", "/auth/me", token=token)
check("GET /auth/me", s == 200 and "email" in json.dumps(d).lower(), f"HTTP {s}")

# 4. Projects list
s, d = call("GET", "/projects", token=token)
projects = d.get("projects", [])
check("GET /projects", s == 200 and isinstance(projects, list), f"{len(projects)} projects")

# 5. Documents of the first project
if projects:
    pid = projects[0]["id"]
    s, d = call("GET", f"/projects/{pid}/documents", token=token)
    docs = d.get("documents", [])
    check("GET /projects/{id}/documents", s == 200 and isinstance(docs, list), f"{len(docs)} docs")

    # 6. Autocomplete (Trie) — only meaningful with documents
    if docs:
        s, d = call(
            "GET", f"/autocomplete?projectId={pid}&prefix=the&limit=5", token=token
        )
        check("GET /autocomplete (Trie)", s == 200 and "suggestions" in d, f"HTTP {s}")

        # 7. Full-text search (inverted index)
        s, d = call("GET", f"/search?projectId={pid}&q=signal&limit=5", token=token)
        check("GET /search (inverted index)", s == 200 and "results" in d, f"HTTP {s}")

        # 8. Bookmarks collection
        s, d = call("GET", f"/projects/{pid}/bookmarks", token=token)
        check("GET /projects/{id}/bookmarks", s == 200 and "bookmarks" in d, f"HTTP {s}")
else:
    print("SKIP  document-level routes — no projects in DB")

# 9. Auth guard: protected route without token must be rejected
try:
    s, d = call("GET", "/projects")
except Exception:
    s = 401
check("GET /projects without token rejected", s in (401, 403), f"HTTP {s}")

passed = sum(1 for _, ok in results if ok)
print(f"\n{passed}/{len(results)} smoke checks passed")
raise SystemExit(0 if passed == len(results) else 1)
