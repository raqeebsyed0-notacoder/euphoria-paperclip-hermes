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
  const { loading, error } = useOverview()
  const iframeSrc = '/api/plugins/euphoria-paperclip/app'
  return jsxs('div', { className: 'flex h-full flex-col overflow-hidden', children: [
    jsx('div', { className: 'flex items-center justify-between border-b border-(--ui-border) px-4 py-2', children: [
      jsxs('div', { children: [jsx('h1', { className: 'text-lg font-semibold', children: 'Paperclip' }), jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Full governance UI — proxied from Paperclip server' })] }),
      jsx('a', { href: iframeSrc, target: '_blank', rel: 'noopener noreferrer', className: 'text-xs text-(--ui-accent) underline', children: 'Open in new tab' })
    ] }),
    loading && !error ? jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading Paperclip…' }) : null,
    error ? jsx('div', { className: 'p-4 text-sm text-red-400', children: error }) : null,
    jsx('div', { className: 'flex-1 min-h-0', children: jsx('iframe', { src: iframeSrc, className: 'w-full h-full border-0', title: 'Paperclip UI', sandbox: 'allow-scripts allow-same-origin allow-forms', style: { border: 'none', width: '100%', height: '100%' } }) })
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
