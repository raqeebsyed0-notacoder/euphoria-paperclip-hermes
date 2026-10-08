# Euphoria Paperclip Plugin

Unified Hermes plugin for Paperclip visibility and governed issue operations.

## Surfaces

- Agent tools: `paperclip_overview`, `paperclip_issues`, `paperclip_agents`
- Official web Dashboard tab and authenticated backend routes
- Official native Desktop page, sidebar entry, and health indicator
- Durable, payload-free bridge activity log under Hermes plugin data

## Security

- Paperclip REST API only; no database access
- Loopback endpoint by default
- No delete operation
- Writes disabled by default and require `confirm=true`
- No shell, Docker, or systemd access
- Dashboard routes inherit the normal Hermes Dashboard authentication gate

## Verification

Run from this directory with the installed Hermes environment:

```bash
python -m unittest discover -s tests -v
hermes plugins doctor . --ci
node --check dashboard/dist/index.js
node --check desktop/plugin.js
```
