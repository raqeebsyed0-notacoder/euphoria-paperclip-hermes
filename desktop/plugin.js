import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, STATUSBAR_AREAS } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback } from 'react'

let pluginContext = null

function useOverview() {
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const load = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: '' }))
    pluginContext.rest('/overview')
      .then(data => setState({ loading: false, data, error: '' }))
      .catch(error => setState(s => ({ ...s, loading: false, error: String(error?.message || error) })))
  }, [])
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])
  return { ...state, load }
}

function PaperclipPage() {
  const { loading, data, error } = useOverview()
  return jsxs('div', { className: 'flex h-full flex-col overflow-hidden', children: [
    jsx('div', { className: 'flex items-center justify-between border-b border-(--ui-border) px-4 py-2', children: [
      jsxs('div', { children: [jsx('h1', { className: 'text-lg font-semibold', children: 'Paperclip' }), jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Governance overview — dashboard-native' })] }),
      jsx('a', { href: 'https://euphoria-vision.com/paperclip', target: '_blank', rel: 'noopener noreferrer', className: 'text-xs text-(--ui-accent) underline', children: 'Open in new tab' })
    ] }),
    loading && !error ? jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading Paperclip…' }) : null,
    error ? jsx('div', { className: 'p-4 text-sm text-red-400', children: error }) : null,
    !loading && !error && data ? jsxs('div', { className: 'flex-1 min-h-0 overflow-auto p-4', children: [
      jsxs('div', { className: 'grid grid-cols-4 gap-3 mb-4', children: [
        jsx('div', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('div', { className: 'text-[10px] uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Health' }), jsx('div', { className: 'mt-1 text-xl font-semibold text-(--ui-accent)', children: data.health?.status ?? '—' })] }),
        jsx('div', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('div', { className: 'text-[10px] uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Issues' }), jsx('div', { className: 'mt-1 text-xl font-semibold', children: String(data.issue_total ?? 0) })] }),
        jsx('div', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('div', { className: 'text-[10px] uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Agents' }), jsx('div', { className: 'mt-1 text-xl font-semibold', children: String(data.agent_count ?? 0) })] }),
        jsx('div', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('div', { className: 'text-[10px] uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Live runs' }), jsx('div', { className: 'mt-1 text-xl font-semibold', children: String(data.live_run_count ?? 0) })] }),
      ] }),
      jsxs('div', { className: 'grid grid-cols-2 gap-3', children: [
        section('Issue counts', Object.entries(data.issue_counts ?? {}).map(([k, v]) =>
          jsx('div', { className: 'flex justify-between text-sm', children: [jsx('span', { className: 'text-(--ui-text-tertiary)', children: k }), jsx('span', { children: String(v) })] }))),
        section('Recent issues', (data.recent_issues ?? []).slice(0, 10).map(i =>
          jsx('div', { className: 'flex justify-between text-sm', children: [jsx('span', { children: (i.identifier || i.id?.slice(0, 8)) ?? '—' }), jsx('span', { className: 'text-(--ui-text-tertiary)', children: i.status ?? '—' })] }))),
        section('Agents', (data.agents ?? []).map(a =>
          jsx('div', { className: 'flex justify-between text-sm', children: [jsx('span', { children: a.name || '—' }), jsx('span', { className: 'text-(--ui-text-tertiary)', children: a.role ?? '' })] }))),
        section('Bridge activity', (data.bridge_activity ?? []).slice(0, 10).map(b =>
          jsx('div', { className: 'flex justify-between text-sm', children: [jsx('span', { className: 'text-(--ui-text-tertiary)', children: b.tool || '' }), jsx('span', { children: b.ok ? '✓' : '✗' })] }))),
      ] }),
      jsx('div', { className: 'mt-4 text-[10px] text-(--ui-text-tertiary)', children: `Company: ${data.company_id || '—'} · Paperclip ${data.health?.version || '—'} · deployment ${data.health?.deploymentMode || '—'}` })
    ] }) : null
  ] })
}

function metric(label, value) { return jsxs('div', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('div', { className: 'text-[10px] uppercase tracking-wide text-(--ui-text-tertiary)', children: label }), jsx('div', { className: 'mt-1 text-xl font-semibold', children: String(value) })] }) }
function section(title, children) { return jsxs('section', { className: 'rounded border border-(--ui-border) p-3', children: [jsx('h2', { className: 'mb-2 text-sm font-medium', children: title }), ...children] }) }

function PaperclipStatus() {
  const [live, setLive] = useState(null)
  useEffect(() => { let active = true; const tick = () => pluginContext.rest('/health').then(() => active && setLive(true)).catch(() => active && setLive(false)); tick(); const id = setInterval(tick, 30000); return () => { active = false; clearInterval(id) } }, [])
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
