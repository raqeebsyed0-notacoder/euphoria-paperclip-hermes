"""Hermes registration for the unified Paperclip plugin."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from . import audit, schemas, tools
from .client import PaperclipClient


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _tracked(tool_name: str, handler: Callable[[dict[str, Any]], str]) -> Callable[..., str]:
    def wrapped(args: dict[str, Any], **kwargs: Any) -> str:
        args = args if isinstance(args, dict) else {}
        result = handler(args, **kwargs)
        try:
            parsed = json.loads(result)
            ok = bool(parsed.get("ok")) if isinstance(parsed, dict) else False
        except Exception:
            ok = False
        audit.record(
            tool_name,
            str(args.get("action") or "read"),
            ok,
            issue_ref=str(args.get("issue_id") or ""),
        )
        return result
    return wrapped


def register(ctx) -> None:
    client = PaperclipClient(
        base_url=ctx.get_config("base_url", default="http://127.0.0.1:3102"),
        company_id=ctx.get_config("company_id", default=""),
        timeout_seconds=ctx.get_config("timeout_seconds", default=10),
        allow_remote=_as_bool(ctx.get_config("allow_remote", default=False)),
    )
    allow_writes = _as_bool(ctx.get_config("allow_writes", default=False))

    ctx.register_tool(
        name="paperclip_overview", toolset="paperclip",
        schema=schemas.PAPERCLIP_OVERVIEW,
        handler=_tracked("paperclip_overview", lambda args, **kw: tools.overview(client, args, **kw)),
    )
    ctx.register_tool(
        name="paperclip_issues", toolset="paperclip",
        schema=schemas.PAPERCLIP_ISSUES,
        handler=_tracked("paperclip_issues", lambda args, **kw: tools.issues(client, allow_writes, args, **kw)),
    )
    ctx.register_tool(
        name="paperclip_agents", toolset="paperclip",
        schema=schemas.PAPERCLIP_AGENTS,
        handler=_tracked("paperclip_agents", lambda args, **kw: tools.agents(client, args, **kw)),
    )

    skill = Path(__file__).resolve().parents[1] / "skills" / "paperclip-operations" / "SKILL.md"
    if skill.exists():
        ctx.register_skill("paperclip-operations", skill)
