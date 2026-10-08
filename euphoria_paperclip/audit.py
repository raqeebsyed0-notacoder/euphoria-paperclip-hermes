"""Minimal plugin-use audit log. Payloads and credentials are never stored."""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()
_MAX_BYTES = 1_000_000
_KEEP_LINES = 500


def _data_dir() -> Path:
    try:
        from plugins.plugin_storage import plugin_data_dir
        return plugin_data_dir("euphoria-paperclip")
    except Exception:
        home = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
        path = home / "plugin-data" / "euphoria-paperclip"
        path.mkdir(parents=True, exist_ok=True)
        return path


def record(tool: str, action: str, ok: bool, *, issue_ref: str = "") -> None:
    row = {
        "at": datetime.now(timezone.utc).isoformat(),
        "tool": str(tool)[:80],
        "action": str(action)[:80],
        "ok": bool(ok),
        "issue_ref": str(issue_ref)[:120],
    }
    path = _data_dir() / "activity.jsonl"
    with _LOCK:
        if path.exists() and path.stat().st_size > _MAX_BYTES:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-_KEEP_LINES:]
            path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")


def recent(limit: int = 25) -> list[dict[str, Any]]:
    path = _data_dir() / "activity.jsonl"
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[-max(1, min(limit, 100)):]:
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                rows.append(value)
        except json.JSONDecodeError:
            continue
    return rows
