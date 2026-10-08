"""Authenticated Dashboard routes for the Paperclip bridge."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

_PLUGIN_ROOT = Path(__file__).resolve().parents[1]
if str(_PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_ROOT))

from euphoria_paperclip.audit import recent  # noqa: E402
from euphoria_paperclip.client import PaperclipAPIError, PaperclipClient  # noqa: E402

router = APIRouter()

_PAPERCLIP_BASE = "http://127.0.0.1:3102"

# Paths the Paperclip SPA needs proxied (HTML shell, JS/CSS assets, fonts, images)
_STATIC_EXTENSIONS = frozenset({
    ".js", ".mjs", ".css", ".png", ".ico", ".svg", ".gif", ".jpg", ".jpeg",
    ".webp", ".woff", ".woff2", ".ttf", ".eot", ".map", ".xml", ".json", ".webmanifest",
})

# API routes that the SPA calls against the Paperclip server — proxied as-is
_API_PREFIXES = ("/api/", "/adapters/", "/announcements/", "/assets/", "/attachments/", "/auth/", "/board/", "/issues/", "/invites/", "/tools/")


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _client() -> PaperclipClient:
    return PaperclipClient(
        base_url=os.environ.get("PAPERCLIP_BASE_URL", "http://127.0.0.1:3102"),
        company_id=os.environ.get("PAPERCLIP_COMPANY_ID", ""),
        timeout_seconds=int(os.environ.get("PAPERCLIP_TIMEOUT_SECONDS", "10")),
        allow_remote=_bool_env("PAPERCLIP_ALLOW_REMOTE", False),
    )


def _call(fn):
    try:
        return fn()
    except (PaperclipAPIError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _is_static_path(path: str) -> bool:
    return Path(path).suffix.lower() in _STATIC_EXTENSIONS


def _is_api_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _API_PREFIXES)


def _rewrite_html(html: str, prefix: str) -> str:
    """Rewrite absolute Paperclip asset paths so they resolve under the proxy prefix."""
    def _rewrite_attr(match: re.Match) -> str:
        path = match.group(3)
        if _is_static_path(path) or path.startswith("/assets/"):
            return match.group(0).replace(path, prefix + path, 1)
        return match.group(0)

    html = re.sub(r'(href|src)=(["\'])(/[^"\'>]+)', _rewrite_attr, html)
    return html


async def _proxy_to_paperclip(path: str) -> Response:
    """Forward a request to the Paperclip server and return the response."""
    if httpx is None:
        raise HTTPException(status_code=503, detail="httpx unavailable — cannot proxy Paperclip UI")

    url = f"{_PAPERCLIP_BASE}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, follow_redirects=True)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Paperclip proxy error: {exc}") from exc

    content_type = resp.headers.get("content-type", "")
    is_html = "text/html" in content_type or "application/xhtml" in content_type

    body = resp.content
    if is_html and body:
        html = body.decode("utf-8", errors="replace")
        html = _rewrite_html(html, "/api/plugins/euphoria-paperclip/app")
        body = html.encode("utf-8")

    headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in ("content-length", "transfer-encoding", "connection", "server")
    }
    return Response(content=body, status_code=resp.status_code, headers=dict(headers))


@router.get("/health")
def health():
    return _call(lambda: {"ok": True, "paperclip": _client().health()})


@router.get("/overview")
def overview():
    def run():
        data = _client().overview()
        data["bridge_activity"] = recent(25)
        return data
    return _call(run)


@router.get("/issues")
def issues(status: str = Query(""), limit: int = Query(50, ge=1, le=200)):
    return _call(lambda: {"issues": _client().list_issues(status=status, limit=limit)})


@router.get("/issues/{issue_id}")
def issue(issue_id: str):
    return _call(lambda: {
        "issue": _client().get_issue(issue_id),
        "comments": _client().issue_comments(issue_id),
    })


@router.get("/agents")
def agents():
    return _call(lambda: {"agents": _client().agents()})


@router.get("/live-runs")
def live_runs():
    return _call(lambda: {"live_runs": _client().live_runs()})


# ---------------------------------------------------------------------------
# Proxied Paperclip SPA: /api/plugins/euphoria-paperclip/app/*
# ---------------------------------------------------------------------------

@router.get("/app")
async def app_index() -> HTMLResponse:
    """Serve the Paperclip SPA root under the proxy prefix."""
    return await _proxy_to_paperclip("/")


@router.get("/app/{full_path:path}")
async def app_proxy(full_path: str, request: Request) -> Response:
    """Proxy Paperclip static assets, API calls, and the SPA shell."""
    path = "/" + full_path

    if _is_static_path(path):
        return await _proxy_to_paperclip(path)

    if _is_api_path(path):
        return await _proxy_to_paperclip(path)

    return await _proxy_to_paperclip("/")
