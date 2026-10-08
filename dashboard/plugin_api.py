"""Authenticated Dashboard routes for the Paperclip bridge."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

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
