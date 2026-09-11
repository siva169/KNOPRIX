"""QA for the document-chat slice (BYOK contract gates, mocked providers)."""
import json
import subprocess
import urllib.request

BASE = "http://127.0.0.1:8011/api"
results = []
TOKEN = ""
PID = PID_DOCS = None


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


# Login (demo seed user, same as qa_smoke.py)
s, d = call("POST", "/auth/login", {"email": "demo@knoprix.io", "password": "Password123!"})
TOKEN = d.get("tokens", {}).get("accessToken", "")
check("login for chat QA", s == 200 and bool(TOKEN), f"HTTP {s}")

# 1. Allowlist shape
s, d = call("GET", "/providers/allowlist", token=TOKEN)
provs = d.get("providers", [])
ok = s == 200 and len(provs) == 4 and all(p.get("models") for p in provs)
check("GET /providers/allowlist (4 free providers)", ok, f"{len(provs)} providers")

# 2. Allowlist needs auth
s, _ = call("GET", "/providers/allowlist")
check("allowlist without token rejected", s in (401, 403), f"HTTP {s}")

# Project + docs for ask tests
s, d = call("GET", "/projects", token=TOKEN)
projects = d.get("projects", [])
PID = projects[0]["id"] if projects else None
DOCS = []
if PID:
    s, d = call("GET", f"/projects/{PID}/documents", token=TOKEN)
    DOCS = [x["id"] for x in d.get("documents", [])][:2]

prov = provs[0] if provs else {}
ASK = {
    "providerId": prov.get("id", "gemini-free"),
    "model": (prov.get("models", [{}])[0] or {}).get("id", "gemini-2.0-flash"),
    "documentIds": DOCS,
    "question": "signal",
}

if DOCS:
    # 3. Mocked ask
    s, d = call("POST", "/chat/ask", ASK, token=TOKEN)
    ok = (s == 200 and d.get("mocked") is True
          and isinstance(d.get("citations"), list)
          and d.get("selectedDocuments") == len(DOCS)
          and "MOCKED" in d.get("answer", ""))
    check("POST /chat/ask mocked + citations", ok,
          f"HTTP {s}, {len(d.get('citations', []))} cites")

    # 4. Key rejection (contract gate) — value must never appear in logs
    bad = dict(ASK, apiKey="SK-TESTKEY-NEVERLOG-999")
    s, d = call("POST", "/chat/ask", bad, token=TOKEN)
    check("key-like field rejected 400", s == 400, f"HTTP {s}")

    # 5-7. Bad provider / model / empty question
    s, _ = call("POST", "/chat/ask", dict(ASK, providerId="evil-ai"), token=TOKEN)
    check("non-allowlisted provider rejected", s == 400, f"HTTP {s}")
    s, _ = call("POST", "/chat/ask", dict(ASK, model="gpt-99"), token=TOKEN)
    check("non-allowlisted model rejected", s == 400, f"HTTP {s}")
    s, _ = call("POST", "/chat/ask", dict(ASK, question="  "), token=TOKEN)
    check("empty question rejected", s == 400, f"HTTP {s}")

    # 8. Fake doc id
    s, _ = call("POST", "/chat/ask", dict(ASK, documentIds=["nope"]), token=TOKEN)
    check("unowned document rejected", s == 404, f"HTTP {s}")
else:
    print("SKIP  ask tests — no documents in DB")

# 9. No token
s, _ = call("POST", "/chat/ask", ASK)
check("ask without token rejected", s in (401, 403), f"HTTP {s}")

# 10. Log scan — the rejected test key must be nowhere in the server log
import os
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server-8011.log")
out = subprocess.run(
    ["grep", "-c", "SK-TESTKEY-NEVERLOG-999", LOG],
    capture_output=True, text=True,
).stdout.strip()
check("test key absent from server log", out == "0", f"grep count={out}")

passed = sum(1 for _, ok in results if ok)
print(f"\n{passed}/{len(results)} chat checks passed")
raise SystemExit(0 if passed == len(results) else 1)
