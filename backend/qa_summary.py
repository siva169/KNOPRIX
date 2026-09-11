"""QA for the summary slice (extractive, key-free)."""
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
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def check(name, cond, detail=""):
    results.append((name, cond))
    print(f"{'PASS' if cond else 'FAIL'}  {name}{' — ' + detail if detail else ''}")


s, d = call("POST", "/auth/login", {"email": "demo@knoprix.io", "password": "Password123!"})
TOKEN = d.get("tokens", {}).get("accessToken", "")
check("login for summary QA", s == 200 and bool(TOKEN), f"HTTP {s}")

s, d = call("GET", "/projects", token=TOKEN)
projects = d.get("projects", [])
DOC = None
for p in projects:
    s2, d2 = call("GET", f"/projects/{p['id']}/documents", token=TOKEN)
    docs = d2.get("documents", [])
    if docs:
        DOC = docs[0]["id"]
        break

if DOC:
    s, d = call("POST", f"/documents/{DOC}/summary", {"maxSentences": 3}, token=TOKEN)
    ok = (s == 200 and d.get("method") == "extractive"
          and 1 <= len(d.get("summary", [])) <= 3
          and all(isinstance(x, str) and x for x in d["summary"]))
    check("POST summary extractive <=3", ok, f"HTTP {s}, {len(d.get('summary', []))} sents")
    # Every summary sentence must be a real quote from the document.
    s2, d2 = call("GET", f"/documents/{DOC}", token=TOKEN)
    full = (d2.get("document", {}).get("extracted_text") or "")
    check("summary quotes document text", all(x in full for x in d.get("summary", [])))
    s, _ = call("POST", f"/documents/{DOC}/summary", {"maxSentences": 99}, token=TOKEN)
    check("maxSentences>10 rejected", s == 400, f"HTTP {s}")
    s, _ = call("POST", "/documents/nope/summary", {"maxSentences": 3}, token=TOKEN)
    check("unknown document 404", s == 404, f"HTTP {s}")
else:
    print("SKIP  summary tests — no documents in DB")

s, _ = call("POST", "/documents/nope/summary", {"maxSentences": 3})
check("summary without token rejected", s in (401, 403), f"HTTP {s}")

passed = sum(1 for _, ok in results if ok)
print(f"\n{passed}/{len(results)} summary checks passed")
raise SystemExit(0 if passed == len(results) else 1)
