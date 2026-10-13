# Euphoria Paperclip Plugin

Unified Hermes plugin for Paperclip visibility and governed issue operations.

## UI REQUIREMENT (Founder standing order — read before touching any UI)

The Desktop UI must be the ORIGINAL Paperclip UI, restyled to maintain the
Hermes Desktop theme. A dashboard-native restyle that replaces the original
UI FAILS this requirement, no matter how well it renders.

Acceptance before any UI work is accepted:
1. Screenshot-vs-original comparison, side by side.
2. Founder eye = final gate (taste is a Founder call).

Pinned 2026-10-13 after repeated sessions built to the wrong target.

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
PYTHONPATH=. python -m unittest discover -s tests -v
hermes plugins doctor . --ci
node --check desktop/plugin.js
```

Dashboard is API-only (Hermes-native rendering via `desktop/plugin.js`); no `dashboard/dist` bundle is shipped. The `dashboard/manifest.json` intentionally contains only `api` and omits `tab`/`entry`/`css`.

## Desktop half notes

- Disk plugins are NOT scanned by Tailwind. Only classes the Desktop's own
  build already emits have CSS, so `desktop/plugin.js` may use core's
  vocabulary only: `--ui-stroke-primary|secondary|tertiary|quaternary`,
  `--ui-bg-chrome|sidebar|editor|elevated|card|...`, `--ui-text-*`,
  `--ui-red`, and `--ui-danger` **with** the inline `,#f87171` fallback
  (the Desktop never defines `--ui-danger`). `--ui-border`, `--ui-bg` and a
  bare `--ui-danger` are not Desktop tokens.
- Every `ctx.rest('/path')` the renderer calls must be mounted under
  `/api/plugins/euphoria-paperclip` by `dashboard/plugin_api.py`.
  `DesktopSurfaceTests` asserts this, so a path drift fails the suite
  instead of 404-ing at runtime.
- The company holds more issues than the old `limit=100` window; the list
  route accepts up to `limit=200`.

