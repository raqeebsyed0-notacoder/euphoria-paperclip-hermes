import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, STATUSBAR_AREAS } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import React from 'react'

let pluginContext = null

function useOverview() {
  const [state, setState] = React.useState({ loading: true, data: null, error: '' })
  const load = React.useCallback(() => {
    setState(s => ({ ...s, loading: true, error: '' }))
    pluginContext.rest('/overview')
      .then(data => setState({ loading: false, data, error: '' }))
      .catch(error => setState(s => ({ ...s, loading: false, error: String(error?.message || error) })))
  }, [])
  React.useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])
  return { ...state, load }
}

function PaperclipPage() {
  const { loading, data, error, load } = useOverview()
  if (loading && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading Paperclip…' })
  if (error && !data) return jsx('div', { className: 'p-4 text-sm text-red-400', children: error })
  const issues = data?.recent_issues || []
  const activity = data?.bridge_activity || []
  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    jsxs('div', { className: 'flex items-center justify-between', children: [
      jsxs('div', { children: [jsx('h1', { className: 'text-lg font-semibold', children: 'Paperclip' }), jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Governance and actual Hermes use' })] }),
      jsx('button', { type: 'button', className: 'rounded border border-(--ui-border) px-3 py-1.5 text-xs', onClick: load, children: loading ? 'Refreshing…' : 'Refresh' })
    ] }),
    error ? jsx('div', { className: 'text-xs text-red-400', children: error }) : null,
    jsxs('div', { className: 'grid grid-cols-2 gap-2 md:grid-cols-5', children: [
      metric('Connection', data?.connected ? 'Live' : 'Down'), metric('Issues', data?.issue_total || 0), metric('Assigned', data?.assigned_issue_count || 0), metric('Live runs', data?.live_run_count || 0), metric('Hermes calls', activity.length)
    ] }),
    section('Recent issues', issues.length ? issues.map(i => jsxs('div', { className: 'grid grid-cols-[80px_1fr_auto] gap-2 border-b border-(--ui-border) py-2 text-xs', children: [jsx('span', { className: 'font-mono text-(--ui-text-tertiary)', children: i.identifier || String(i.id || '').slice(0, 8) }), jsx('span', { children: i.title || 'Untitled' }), jsx('span', { className: 'text-(--ui-text-tertiary)', children: i.status || 'unknown' })] }, i.id)) : [jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No issues found' })]),
    section('Hermes bridge activity', activity.length ? activity.slice().reverse().map((a, n) => jsxs('div', { className: 'grid grid-cols-[50px_1fr_auto] gap-2 border-b border-(--ui-border) py-2 text-xs', children: [jsx('span', { children: a.ok ? 'OK' : 'FAIL' }), jsx('span', { children: `${a.tool} · ${a.action}` }), jsx('span', { className: 'text-(--ui-text-tertiary)', children: new Date(a.at).toLocaleString() })] }, a.at + n)) : [jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No plugin activity recorded yet' })])
  ] })
}

function metric(label, value) { return jsxs('div', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('div', { className: 'text-[10px] uppercase tracking-wide text-(--ui-text-tertiary)', children: label }), jsx('div', { className: 'mt-1 text-xl font-semibold', children: String(value) })] }) }
function section(title, children) { return jsxs('section', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('h2', { className: 'mb-2 text-sm font-medium', children: title }), ...children] }) }

function PaperclipStatus() {
  const [live, setLive] = React.useState(null)
  React.useEffect(() => { let active = true; const tick = () => pluginContext.rest('/health').then(() => active && setLive(true)).catch(() => active && setLive(false)); tick(); const id = setInterval(tick, 30000); return () => { active = false; clearInterval(id) } }, [])
  return jsx('button', { type: 'button', className: 'px-1.5 text-[0.6875rem] text-(--ui-text-tertiary)', onClick: () => host.navigate('/paperclip'), children: `Paperclip ${live === null ? '…' : live ? '●' : '○'}` })
}

export default {
  id: 'euphoria-paperclip',
  name: 'Paperclip',
  defaultEnabled: true,
  register(ctx) {
    pluginContext = ctx
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/paperclip' }, render: () => jsx(PaperclipPage, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: '/paperclip', label: 'Paperclip', codicon: 'project' } },
      { id: 'status', area: STATUSBAR_AREAS.right, order: 125, render: () => jsx(PaperclipStatus, {}) }
    ])
  }
}
