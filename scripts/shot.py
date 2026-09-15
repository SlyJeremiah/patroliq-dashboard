"""Screenshot dashboard pages from the Vite dev server with headless Edge (development only).

  python scripts/shot.py <path> [<path> ...] [--user manager|admin|platform] [--size 1440x900]

Requires: the local Django API on http://127.0.0.1:8765 (seeded demo data) and `npm run dev` on http://localhost:5173.
Signs in through the API (TOTP computed from the seed secret printed in backend/.dev_totp.json if present) and passes the
token with ?devtoken= so the app is authenticated. PNGs go to dashboard/shots/<name>.png.
"""
import base64
import hashlib
import hmac
import json
import os
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "shots")
API = os.environ.get("PATROLIQ_API", "http://127.0.0.1:8765/api/v1/")
APP = os.environ.get("PATROLIQ_APP", "http://localhost:5173")
USERS = {
    "manager": ("grace.mutasa@grtts.co.zw", "manager123"),
    "admin": ("tafadzwa.shumba@grtts.co.zw", "admin123"),
    "platform": ("admin@zrgissolutions.com", "platform123"),
}


def totp(secret: str, step: int = 30) -> str:
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    counter = struct.pack(">Q", int(time.time()) // step)
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    o = digest[-1] & 0x0F
    return f"{(struct.unpack('>I', digest[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def token_for(user: str) -> str:
    cache = os.path.join(tempfile.gettempdir(), f"piq-dash-token-{user}.txt")
    if os.path.exists(cache) and time.time() - os.path.getmtime(cache) < 6 * 3600:
        return open(cache).read().strip()
    email, password = USERS[user]
    status, data = post("auth/login/", {"email": email, "password": password})
    if status == 401 and data.get("error", {}).get("code") == "totp_required":
        secrets_file = os.path.join(ROOT, "..", "backend", ".dev_totp.json")
        secrets = json.load(open(secrets_file)) if os.path.exists(secrets_file) else {}
        secret = secrets.get(email) or os.environ.get("PATROLIQ_TOTP_SECRET")
        if not secret:
            sys.exit(f"TOTP secret for {email} not found in backend/.dev_totp.json or PATROLIQ_TOTP_SECRET")
        status, data = post("auth/login/", {"email": email, "password": password, "totp": totp(secret)})
    if status != 200:
        sys.exit(f"login failed for {user}: {status} {data}")
    open(cache, "w").write(data["token"])
    return data["token"]


def main():
    args = sys.argv[1:]
    user = "manager"
    size = "1440,900"
    paths = []
    i = 0
    while i < len(args):
        if args[i] == "--user":
            user = args[i + 1]; i += 2; continue
        if args[i] == "--size":
            size = args[i + 1].replace("x", ","); i += 2; continue
        paths.append(args[i]); i += 1
    tok = token_for(user)
    os.makedirs(SHOTS, exist_ok=True)
    for p in paths:
        if p in ('home', ''):
            p = '/'
        name = (p.strip("/").replace("/", "_").split("?")[0] or "home") + ("" if user == "manager" else f"__{user}")
        dst = os.path.join(SHOTS, f"{name}.png")
        sep = "&" if "?" in p else "?"
        url = f"{APP}{p if p.startswith('/') else '/' + p}{sep}devtoken={tok}"
        started = time.time() - 1
        prof = tempfile.mkdtemp(prefix="piq-dash-edge-")
        subprocess.run([EDGE, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", f"--user-data-dir={prof}",
                        f"--window-size={size}", "--virtual-time-budget=12000", "--run-all-compositor-stages-before-draw",
                        f"--screenshot={dst}", url], timeout=120, capture_output=True)
        for _ in range(80):
            if os.path.exists(dst) and os.path.getmtime(dst) >= started:
                break
            time.sleep(0.5)
        print(dst if os.path.exists(dst) and os.path.getmtime(dst) >= started else f"FAILED {p}")


if __name__ == "__main__":
    main()
