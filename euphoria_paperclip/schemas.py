"""Tool schemas shown to the model."""

PAPERCLIP_OVERVIEW = {
    "name": "paperclip_overview",
    "description": (
        "Show whether Paperclip is reachable and whether it is actually being used: "
        "issue counts by workflow state, assigned issues, registered agents, live runs, "
        "and recent issues. Use this before claiming Paperclip is active or idle."
    ),
    "parameters": {"type": "object", "properties": {}},
}

PAPERCLIP_ISSUES = {
    "name": "paperclip_issues",
    "description": (
        "List or inspect Paperclip issues, or create/update/comment on an issue. "
        "Writes are allowlisted, require plugin allow_writes=true, and require confirm=true. "
        "Deletion is intentionally unavailable."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["list", "get", "create", "update", "comment"]},
            "issue_id": {"type": "string", "description": "Issue UUID for get/update/comment."},
            "status": {"type": "string", "enum": ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]},
            "priority": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
            "title": {"type": "string"},
            "description": {"type": "string"},
            "comment": {"type": "string"},
            "project_id": {"type": "string"},
            "goal_id": {"type": "string"},
            "assignee_agent_id": {"type": "string"},
            "assignee_user_id": {"type": "string"},
            "review_policy": {"type": "string", "enum": ["anyone", "not_creator", "human_only"]},
            "limit": {"type": "integer", "minimum": 1, "maximum": 200},
            "confirm": {"type": "boolean", "description": "Must be true for create/update/comment."},
        },
        "required": ["action"],
    },
}

PAPERCLIP_AGENTS = {
    "name": "paperclip_agents",
    "description": (
        "Inspect Paperclip's registered agents, current live runs, or company dashboard data. "
        "This tool is read-only and distinguishes configured agents from evidenced activity."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["list", "live_runs", "dashboard"]},
        },
        "required": ["action"],
    },
}
