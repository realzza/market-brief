"""Truth Social fetch sidecar.

Truth Social sits behind Cloudflare, which blocks requests by their TLS
fingerprint (JA3) before any auth header is even read. A plain Node/`fetch`
request — no matter how perfect its headers or bearer token — gets a 403
"Just a moment…" challenge page. The only reliable bypass is to impersonate a
real browser's TLS handshake, which `curl_cffi` does. That's the same engine
Stanford's `truthbrush` is built on; we use it directly so we don't need a
Truth Social login (Trump's posts are a public, "prominent account" feed).

This service mirrors the role the `rsshub` container plays for X: it lives on
the internal Compose network and exposes Trump's posts as JSON over HTTP, so
the Next.js app can fetch them with an ordinary `fetch()` and never has to
care about Cloudflare.

  GET /healthz            → 200 "ok"
  GET /statuses?acct=X    → {"posts": [ …normalized Mastodon statuses… ]}

The endpoint shape is Mastodon's (Truth Social is a Mastodon fork): each post
has an HTML `content`, ISO `created_at`, engagement counts, and a
`media_attachments` array where videos carry both a playable `url` and a
`preview_url` poster. lib/truthsocial.ts on the Node side maps this into the
app's RawTweet shape.
"""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from curl_cffi import requests

API_BASE = "https://truthsocial.com/api/v1"
HOME = "https://truthsocial.com/"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
)
# Cloudflare keys on the TLS fingerprint of a *current* browser, so the
# impersonation target has to be recent. We try newest-first and fall back to
# whatever the installed curl_cffi build actually supports (older builds 404 on
# unknown targets). The first target that clears Cloudflare wins and is reused.
IMPERSONATE_CANDIDATES = [
    t.strip()
    for t in os.environ.get(
        "TS_IMPERSONATE", "chrome146,chrome136,chrome131,chrome124,chrome120"
    ).split(",")
    if t.strip()
]
PORT = int(os.environ.get("TS_PORT", "8000"))
# Short in-process cache so rapid re-fetches (or the app + a manual click) don't
# hammer Truth Social. 5 min mirrors RSSHub's CACHE_EXPIRE.
CACHE_TTL = int(os.environ.get("TS_CACHE_TTL", "300"))

_lock = threading.Lock()
_session = None
_impersonate = None  # the target that last worked
_id_cache: dict[str, str] = {}            # acct -> numeric account id
_post_cache: dict[str, tuple[float, list]] = {}  # acct -> (fetched_at, posts)


def _new_session():
    """A fresh curl_cffi session, warmed up against the homepage so Cloudflare
    hands us a `cf_clearance` cookie before we touch the API."""
    global _impersonate
    last_err = None
    for target in IMPERSONATE_CANDIDATES:
        try:
            s = requests.Session()
            r = s.get(HOME, headers={"User-Agent": UA}, impersonate=target, timeout=25)
            if r.status_code == 200:
                _impersonate = target
                print(f"[truthsocial] warmed up via impersonate={target}", flush=True)
                return s
            last_err = f"{target}: warmup {r.status_code}"
        except Exception as e:  # unknown impersonate target, network, etc.
            last_err = f"{target}: {e}"
    raise RuntimeError(f"could not establish a Cloudflare-cleared session ({last_err})")


def _get_session(force_new=False):
    global _session
    with _lock:
        if force_new or _session is None:
            _session = _new_session()
        return _session


def _api_get(path, params=None):
    """GET an API path, transparently re-warming once if Cloudflare bounces us
    (the cf_clearance cookie expires periodically)."""
    headers = {"User-Agent": UA, "Accept": "application/json"}
    for attempt in (1, 2):
        s = _get_session(force_new=(attempt == 2))
        r = s.get(
            API_BASE + path, params=params, headers=headers,
            impersonate=_impersonate, timeout=25,
        )
        if r.status_code == 200:
            return r.json()
        # 403/503 → likely a stale clearance cookie; drop the session and retry.
        if attempt == 1 and r.status_code in (403, 503):
            continue
        raise RuntimeError(f"GET {path} -> {r.status_code}: {r.text[:120]}")
    raise RuntimeError(f"GET {path} failed after re-warm")


def _account_id(acct: str) -> str:
    acct = acct.lstrip("@")
    if acct in _id_cache:
        return _id_cache[acct]
    data = _api_get("/accounts/lookup", params={"acct": acct})
    aid = data.get("id")
    if not aid:
        raise RuntimeError(f"no account id for @{acct}")
    _id_cache[acct] = aid
    return aid


def _normalize(post: dict) -> dict:
    media = []
    for m in post.get("media_attachments") or []:
        media.append({
            "type": m.get("type"),                 # image | video | gifv
            "url": m.get("url"),
            "preview_url": m.get("preview_url"),    # poster frame for videos
        })
    return {
        "id": str(post.get("id")),
        "content": post.get("content") or "",
        "created_at": post.get("created_at"),
        "replies_count": post.get("replies_count") or 0,
        "reblogs_count": post.get("reblogs_count") or 0,
        "favourites_count": post.get("favourites_count") or 0,
        "media": media,
    }


def fetch_statuses(acct: str, limit: int) -> list:
    now = time.time()
    cached = _post_cache.get(acct)
    if cached and now - cached[0] < CACHE_TTL:
        return cached[1][:limit]

    aid = _account_id(acct)
    # exclude_replies keeps the feed to Trump's own posts; we drop reblogs
    # (ReTruths of other accounts) below to match the X path, which excludes RTs.
    raw = _api_get(
        f"/accounts/{aid}/statuses",
        params={"limit": min(max(limit, 1), 40), "exclude_replies": "true"},
    )
    posts = [_normalize(p) for p in raw if not p.get("reblog")]
    _post_cache[acct] = (now, posts)
    return posts[:limit]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/healthz":
            self._send(200, {"status": "ok", "impersonate": _impersonate})
            return
        if u.path == "/statuses":
            q = parse_qs(u.query)
            acct = (q.get("acct") or [""])[0].strip()
            limit = int((q.get("limit") or ["40"])[0])
            if not acct:
                self._send(400, {"error": "acct query param required"})
                return
            try:
                posts = fetch_statuses(acct, limit)
                self._send(200, {"posts": posts})
            except Exception as e:
                self._send(502, {"error": str(e)})
            return
        self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # quieter, single-line logs
        print(f"[truthsocial] {self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"[truthsocial] listening on :{PORT} (targets={IMPERSONATE_CANDIDATES})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
