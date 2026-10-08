"""Hermes tool handlers for Paperclip."""
from __future__ import annotations

import json
from typing import Any

from .client import PaperclipAPIError, PaperclipClient

_STATUS = {"backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"}
_PRIORITY = {"critical", "high", "medium", "low"}
_REVIEW = {"anyone", "not_creator", "human_only"}


def _result(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _error(message: str) -> str:
    return _result({"ok": False, "error": message})


def _write_gate(args: dict[str, Any], allow_writes: bool) -> str | None:
    if not allow_writes:
        return "Paperclip writes are disabled in plugin settings"
    if args.get("confirm") is not True:
        return "confirm=true is required for Paperclip writes"
    return None


def overview(client: PaperclipClient, args: dict[str, Any], **kwargs: Any) -> str:
    try:
        return _result({"ok": True, "overview": client.overview()})
    except (PaperclipAPIError, ValueError) as exc:
        return _error(str(exc))


def issues(client: PaperclipClient, allow_writes: bool, args: dict[str, Any], **kwargs: Any) -> str:
    action = str(args.get("action") or "list").strip().lower()
    issue_id = str(args.get("issue_id") or "").strip()
    try:
        if action == "list":
            return _result({
                "ok": True,
                "issues": client.list_issues(
                    status=str(args.get("status") or "").strip(),
                    limit=int(args.get("limit") or 50),
                ),
            })
        if action == "get":
            if not issue_id:
                return _error("issue_id is required for action=get")
            return _result({
                "ok": True,
                "issue": client.get_issue(issue_id),
                "comments": client.issue_comments(issue_id),
            })
        if action not in {"create", "update", "comment"}:
            return _error(f"unsupported action: {action}")
        if gate := _write_gate(args, allow_writes):
            return _error(gate)
        if action == "comment":
            body = str(args.get("comment") or "").strip()
            if not issue_id or not body:
                return _error("issue_id and comment are required")
            return _result({"ok": True, "comment": client.add_comment(issue_id, body)})

        payload: dict[str, Any] = {}
        field_map = {
            "title": "title", "description": "description", "status": "status",
            "priority": "priority", "project_id": "projectId", "goal_id": "goalId",
            "assignee_agent_id": "assigneeAgentId", "assignee_user_id": "assigneeUserId",
            "review_policy": "reviewPolicy",
        }
        for source, target in field_map.items():
            if source in args and args[source] is not None and args[source] != "":
                payload[target] = args[source]
        if payload.get("status") not in _STATUS and "status" in payload:
            return _error("invalid status")
        if payload.get("priority") not in _PRIORITY and "priority" in payload:
            return _error("invalid priority")
        if payload.get("reviewPolicy") not in _REVIEW and "reviewPolicy" in payload:
            return _error("invalid review_policy")
        if action == "create":
            if not str(payload.get("title") or "").strip():
                return _error("title is required for action=create")
            payload.setdefault("status", "todo")
            payload.setdefault("priority", "medium")
            return _result({"ok": True, "issue": client.create_issue(payload)})
        if not issue_id:
            return _error("issue_id is required for action=update")
        if not payload:
            return _error("no allowlisted update fields were supplied")
        return _result({"ok": True, "issue": client.update_issue(issue_id, payload)})
    except (PaperclipAPIError, ValueError, TypeError) as exc:
        return _error(str(exc))


def agents(client: PaperclipClient, args: dict[str, Any], **kwargs: Any) -> str:
    action = str(args.get("action") or "list").strip().lower()
    try:
        if action == "list":
            return _result({"ok": True, "agents": client.agents()})
        if action == "live_runs":
            return _result({"ok": True, "live_runs": client.live_runs()})
        if action == "dashboard":
            return _result({"ok": True, "dashboard": client.dashboard()})
        return _error(f"unsupported action: {action}")
    except (PaperclipAPIError, ValueError) as exc:
        return _error(str(exc))
