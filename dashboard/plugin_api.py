"""Hermes-native Dashboard routes for the Paperclip bridge.

Hermes UI Theme Law: this plugin renders ONLY Hermes-native UI via
desktop/plugin.js (Hermes dark theme + --ui-* variables). No proxied
Paperclip SPA, no iframes, no foreign pages — the backend serves JSON
and the renderer draws the governance overview (see screenshot spec).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException, Query, Request, Response
from urllib.request import Request as URLRequest, urlopen
from urllib.error import HTTPError, URLError

_PLUGIN_ROOT = Path(__file__).resolve().parents[1]
if str(_PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_ROOT))

from euphoria_paperclip.audit import recent  # noqa: E402
from euphoria_paperclip.client import PaperclipAPIError, PaperclipClient  # noqa: E402

router = APIRouter()


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


@router.get("/dashboard")
def dashboard():
    def run():
        return {"dashboard": _client().dashboard(), "bridge_activity": recent(25)}
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


@router.get("/projects")
def projects():
    return _call(lambda: {"projects": _client().projects()})


@router.get("/goals")
def goals():
    return _call(lambda: {"goals": _client().goals()})


@router.get("/activity")
def activity():
    return _call(lambda: {"activity": _client().activity()})


@router.get("/approvals")
def approvals():
    return _call(lambda: {"approvals": _client().approvals()})


@router.get("/costs")
def costs():
    return _call(lambda: {"costs": _client().costs()})


@router.get("/routines")
def routines():
    return _call(lambda: {"routines": _client().routines()})


@router.get("/artifacts")
def artifacts():
    return _call(lambda: {"artifacts": _client().artifacts()})


@router.get("/skills")
def skills():
    return _call(lambda: {"skills": _client().skills()})


@router.get("/connectors")
def connectors():
    return _call(lambda: {"connectors": _client().skill_sources()})


@router.post("/issues")
def issues_create(confirm: bool = Query(False), body: dict = Body(default_factory=dict)):
    allow = _bool_env("PAPERCLIP_ALLOW_WRITES", False)
    if not allow:
        raise HTTPException(status_code=403, detail="writes not allowed — set PAPERCLIP_ALLOW_WRITES=true")
    if not confirm:
        raise HTTPException(status_code=400, detail="confirm=true required for write operations")
    payload = body or {}
    return _call(lambda: {"issue": _client().create_issue(payload)})


@router.patch("/issues/{issue_id}")
def issues_update(issue_id: str, confirm: bool = Query(False), body: dict = Body(default_factory=dict)):
    allow = _bool_env("PAPERCLIP_ALLOW_WRITES", False)
    if not allow:
        raise HTTPException(status_code=403, detail="writes not allowed — set PAPERCLIP_ALLOW_WRITES=true")
    if not confirm:
        raise HTTPException(status_code=400, detail="confirm=true required for write operations")
    payload = body or {}
    return _call(lambda: {"issue": _client().update_issue(issue_id, payload)})


@router.get("/issues/{issue_id}/comments")
def issue_comments(issue_id: str):
    return _call(lambda: {"comments": _client().issue_comments(issue_id)})


@router.post("/issues/{issue_id}/comments")
def issues_comment(issue_id: str, confirm: bool = Query(False), body: dict = Body(default_factory=dict)):
    allow = _bool_env("PAPERCLIP_ALLOW_WRITES", False)
    if not allow:
        raise HTTPException(status_code=403, detail="writes not allowed — set PAPERCLIP_ALLOW_WRITES=true")
    if not confirm:
        raise HTTPException(status_code=400, detail="confirm=true required for write operations")
    text = (body or {}).get("body", "")
    return _call(lambda: {"comment": _client().add_comment(issue_id, text)})


@router.get("/issues/{issue_id}/attachments")
def issue_attachments(issue_id: str):
    return _call(lambda: {"attachments": _client().issue_attachments(issue_id)})


@router.get("/app")
async def app_proxy(request: Request):
    """Proxy Paperclip SPA with auth cookie passthrough.

    Forwards incoming cookies to Paperclip so the SPA session is shared.
    Iframe credentials are N/A — this plugin renders native React, not iframes.
    """
    base_url = os.environ.get("PAPERCLIP_BASE_URL", "http://127.0.0.1:3102")
    target_url = f"{base_url}/app"
    cookies = request.headers.get("cookie", "")
    headers = {"Accept": "text/html"}
    if cookies:
        headers["Cookie"] = cookies
    req = URLRequest(target_url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=10) as resp:
            body = resp.read()
            content_type = resp.headers.get("Content-Type", "text/html")
            return Response(content=body, media_type=content_type)
    except HTTPError as exc:
        raw = exc.read(2048).decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=raw[:500]) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
