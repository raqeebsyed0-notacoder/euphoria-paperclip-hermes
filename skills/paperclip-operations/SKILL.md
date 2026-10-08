---
name: paperclip-operations
description: Use when Hermes must inspect or update Euphoria Paperclip governance records.
---

# Paperclip Operations

- Call `paperclip_overview` before claiming Paperclip is active, idle, assigned, or running.
- Distinguish registered agents from live runs and assigned issues.
- Use `paperclip_issues` reads freely; writes require an explicit task-bound reason and `confirm=true`.
- Never delete issues through this plugin. Never use Paperclip's datastore directly.
- Do not place credentials, environment values, connection strings, or private session content in issues or comments.
- A successful API write is not completion evidence: read back the issue or comments before reporting success.
