/**
 * euphoria-paperclip — desktop plugin (merged final)
 * 16 ROUTES pages · 18 SIDEBAR rows · statusbar · shared helpers
 * Overview = v2 KPI/charts body. Robust rest (pluginContext.rest → host.rest).
 * 30s polling + manual Refresh. Confirm checkbox on ALL writes. Keyed lists. Zero-data safe.
 * Theme Law: Hermes dark, --ui-* vars only. No hex, no iframes.
 */
import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, STATUSBAR_AREAS } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback } from 'react'

let pluginContext = null
let paperclipBaseUrl = 'http://127.0.0.1:3102'

// --- shared helpers ---

function timeAgo(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (isNaN(t)) return '—'
  const diff = Date.now() - t
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function statusIcon(status) {
  if (status === 'done') return '✓'
  if (status === 'cancelled') return '✗'
  return '◆'
}

function fmtCents(cents) {
  if (cents == null) return '—'
  return '$' + (cents / 100).toFixed(2)
}

// Robust REST client: prefer pluginContext.rest, fall back to host.rest.
function restClient() {
  if (pluginContext && typeof pluginContext.rest === 'function') return pluginContext.rest.bind(pluginContext)
  if (typeof host?.rest === 'function') return host.rest.bind(host)
  return null
}

function api(path, opts) {
  const client = restClient()
  if (!client) return Promise.reject(new Error('No REST client'))
  return client(path, opts)
}

function usePolling(fn, interval = 30000) {
  useEffect(() => { fn(); const id = setInterval(fn, interval); return () => clearInterval(id) }, [fn])
}

function usePollingData(paths, interval = 30000) {
  const [state, setState] = useState({ loading: true, data: {}, error: '' })
  const key = paths.join(',')
  const load = useCallback(() => {
    const client = restClient()
    if (!client) { setState({ loading: false, data: {}, error: 'No REST client' }); return }
    setState(s => ({ ...s, loading: true, error: '' }))
    Promise.allSettled(paths.map(p => client(p))).then(results => {
      const data = {}
      const errors = []
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') data[paths[i]] = r.value
        else errors.push(`${paths[i]}: ${r.reason?.message || r.reason}`)
      })
      setState({ loading: false, data, error: errors.join('; ') })
    }).catch(error => {
      setState({ loading: false, data: {}, error: String(error?.message || error) })
    })
  }, [key])
  useEffect(() => { load(); const id = setInterval(load, interval); return () => clearInterval(id) }, [load, interval])
  return { ...state, load }
}

function metricCard(label, value, subtext) {
  return jsxs('div', { className: 'rounded border border-(--ui-border) p-3', children: [
    jsx('div', { className: 'text-[10px] uppercase tracking-wide text-(--ui-text-tertiary)', children: label }),
    jsx('div', { className: 'mt-1 text-xl font-semibold', children: String(value) }),
    subtext ? jsx('div', { className: 'text-[10px] text-(--ui-text-tertiary)', children: subtext }) : null
  ] })
}

function section(title, children) {
  return jsxs('section', { className: 'rounded border border-(--ui-border) p-3', children: [
    jsx('h2', { className: 'mb-2 text-sm font-medium', children: title }),
    ...children
  ] })
}

function pageHeader(title, subtitle, loading, onRefresh) {
  return jsxs('div', { className: 'flex items-center justify-between', children: [
    jsxs('div', { children: [
      jsx('h1', { className: 'text-lg font-semibold', children: title }),
      jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: subtitle })
    ] }),
    jsx('button', { type: 'button', className: 'rounded border border-(--ui-border) px-3 py-1.5 text-xs', onClick: onRefresh, children: loading ? 'Refreshing…' : 'Refresh' })
  ] })
}

function agentName(agents, id) {
  if (!id) return '—'
  const a = (agents || []).find(x => x.id === id)
  return a ? (a.name || '—') : '—'
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function assigneeLabel(issue, agents) {
  if (issue?.assignee) return String(issue.assignee)
  if (issue?.assigneeUserId) return String(issue.assigneeUserId)
  if (issue?.assigneeAgentId) {
    const name = agentName(agents, issue.assigneeAgentId)
    return name !== '—' ? name : String(issue.assigneeAgentId).slice(0, 8)
  }
  return '—'
}

// === CHART: Run Activity (14-day grouped vertical bars) ===
function chartRunActivity(runActivity) {
  const series = ['succeeded', 'failed', 'recovered', 'other']
  const seriesOpacity = { succeeded: 1.0, failed: 0.55, recovered: 0.3, other: 0.35 }

  if (!runActivity.length) {
    return section('Run Activity (14d)', [jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'No data yet' })])
  }

  const maxCount = Math.max(...runActivity.map(d =>
    Math.max(d.succeeded || 0, d.failed || 0, d.recovered || 0, d.other || 0)
  ), 1)

  const n = runActivity.length
  const isLabeled = (i) => i === 0 || i === n - 1 || i === Math.floor(n / 2)

  return section('Run Activity (14d)', [
    jsxs('div', {
      className: 'flex items-end justify-between gap-px h-32',
      children: runActivity.map((day, i) => jsxs('div', {
        key: day.date || i,
        className: 'flex flex-col items-center flex-1 min-w-[20px]',
        children: [
          jsxs('div', {
            className: 'flex items-end justify-center gap-[1px] w-full h-24',
            children: series.map(s => {
              const val = day[s] || 0
              const h = (val / maxCount) * 100
              return jsx('div', {
                key: s,
                className: 'flex-1 min-w-[2px]',
                children: jsx('div', {
                  className: 'w-full rounded-t-sm',
                  style: {
                    backgroundColor: 'var(--ui-accent)',
                    opacity: s === 'other' ? 0.35 : seriesOpacity[s],
                    height: `${h}%`,
                    minHeight: val > 0 ? '2px' : 0
                  },
                  title: `${s}: ${val}`
                })
              })
            })
          }),
          jsx('div', {
            className: 'mt-1 text-[9px] text-(--ui-text-tertiary) text-center truncate',
            children: isLabeled(i) ? (day.date || '—') : ''
          })
        ]
      }))
    })
  ])
}

// === CHART: Tasks by Status (horizontal bars from issue_counts) ===
function chartTasksByStatus(counts) {
  const entries = Object.entries(counts || {})

  if (!entries.length) {
    return section('Tasks by Status', [jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'No data yet' })])
  }

  const maxCount = Math.max(...entries.map(([, v]) => v || 0), 1)

  return section('Tasks by Status', entries.map(([status, count]) => {
    const pct = ((count || 0) / maxCount) * 100
    return jsxs('div', {
      key: status,
      className: 'flex items-center gap-2 text-sm',
      children: [
        jsx('span', { className: 'w-24 text-(--ui-text-tertiary) truncate', children: status }),
        jsxs('div', {
          className: 'flex-1 relative h-5 bg-(--ui-border) rounded-sm overflow-hidden',
          children: [
            jsx('div', {
              className: 'h-full rounded-sm',
              style: { width: `${pct}%`, backgroundColor: 'var(--ui-accent)', opacity: 0.6 }
            }),
            jsx('span', {
              className: 'absolute inset-0 flex items-center text-[9px] px-1 overflow-hidden',
              children: String(count || 0)
            })
          ]
        })
      ]
    })
  }))
}

// === CHART: Success Rate (overall % + 14-day mini bar row) ===
function chartSuccessRate(runActivity) {
  if (!runActivity.length) {
    return section('Success Rate', [jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'No data yet' })])
  }

  const totalAll = runActivity.reduce((s, d) => s + (d.total || 0), 0)
  const successAll = runActivity.reduce((s, d) => s + (d.succeeded || 0) + (d.recovered || 0), 0)
  const overallPct = totalAll > 0 ? (successAll / totalAll) * 100 : 0

  const dailyPct = runActivity.map(d => {
    const t = d.total || 0
    return t > 0 ? ((d.succeeded || 0) + (d.recovered || 0)) / t * 100 : 0
  })

  const maxDaily = Math.max(...dailyPct, 1)
  const n = runActivity.length
  const firstDate = runActivity[0]?.date || '—'
  const midDate = runActivity[Math.floor(n / 2)]?.date || '—'
  const lastDate = runActivity[n - 1]?.date || '—'

  return section('Success Rate', [
    jsxs('span', {
      className: 'text-2xl font-semibold text-(--ui-accent)',
      children: [
        overallPct.toFixed(1),
        jsx('span', { className: 'text-sm font-normal text-(--ui-text-tertiary)', children: '%' })
      ]
    }),
    jsx('div', {
      className: 'flex items-end gap-[1px] h-12 mt-2',
      children: dailyPct.map((pct, i) => {
        const h = pct > 0 ? (pct / maxDaily) * 100 : 0
        return jsx('div', {
          key: i,
          className: 'flex-1 min-w-[2px] flex items-end',
          children: jsx('div', {
            className: 'w-full rounded-sm',
            style: { height: `${h}%`, backgroundColor: 'var(--ui-accent)', opacity: pct > 0 ? 0.55 : 0.1 }
          })
        })
      })
    }),
    jsxs('div', {
      className: 'mt-1 flex justify-between text-[9px] text-(--ui-text-tertiary)',
      children: [
        jsx('span', { key: 'first', children: firstDate }),
        jsx('span', { key: 'mid', children: midDate }),
        jsx('span', { key: 'last', children: lastDate })
      ]
    })
  ])
}

function useOverviewData() {
  const [state, setState] = useState({ loading: true, overview: null, dashboard: null, error: '' })
  const load = useCallback(() => {
    const client = restClient()
    if (!client) { setState({ loading: false, overview: null, dashboard: null, error: 'No REST client' }); return }
    setState(s => ({ ...s, loading: true, error: '' }))
    Promise.allSettled([client('/overview'), client('/dashboard')]).then(([ovResult, dbResult]) => {
      const overview = ovResult.status === 'fulfilled' ? ovResult.value : null
      const dashboard = dbResult.status === 'fulfilled' ? dbResult.value : null
      const errors = [ovResult, dbResult].filter(r => r.status === 'rejected').map(r => r.reason?.message || r.reason).join('; ')
      setState({ loading: false, overview, dashboard, error: errors })
    }).catch(error => {
      setState({ loading: false, overview: null, dashboard: null, error: String(error?.message || error) })
    })
  }, [])
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])
  return { ...state, load }
}

function PageOverview() {
  const { loading, overview: data, dashboard: dash, error, load } = useOverviewData()

  const openNative = () => {
    try {
      const api = pluginContext?.os?.openExternal
      if (typeof api === 'function') api(paperclipBaseUrl)
      else if (host?.notify) host.notify({ kind: 'info', message: `Paperclip native: ${paperclipBaseUrl}` })
    } catch (e) {
      if (host?.notify) host.notify({ kind: 'error', message: String(e?.message || e) })
    }
  }

  // KPI data — prefer /dashboard, fallback /overview
  const dashAgents = dash?.dashboard?.agents
  const dashTasks = dash?.dashboard?.tasks
  const dashCosts = dash?.dashboard?.costs
  const dashPending = dash?.dashboard?.pendingApprovals

  const runActivity = dash?.dashboard?.runActivity || []
  const counts = data?.issue_counts || {}

  const agentsEnabled = (dashAgents?.active ?? data?.agent_count) ?? 0
  const agentRunning = dashAgents?.running ?? 0
  const agentPaused = dashAgents?.paused ?? 0
  const agentError = dashAgents?.error ?? 0

  const dashTaskTotal = (dashTasks?.open ?? 0) + (dashTasks?.inProgress ?? 0) + (dashTasks?.blocked ?? 0) + (dashTasks?.done ?? 0)
  const tasksValue = (dashTaskTotal || data?.issue_total) ?? 0
  const tasksOpen = dashTasks?.open ?? 0
  const tasksBlocked = (dashTasks?.blocked ?? data?.issue_counts?.blocked) ?? 0

  const monthBudgetCents = dashCosts?.monthBudgetCents ?? 0
  const monthSpend = dashCosts?.monthSpendCents != null ? `$${(dashCosts.monthSpendCents / 100).toFixed(2)}` : '$0.00'
  const monthSpendSubtext = monthBudgetCents > 0
    ? `${dashCosts?.monthUtilizationPercent ?? 0}% of budget`
    : 'Unlimited budget'

  const pendingApprovals = dashPending ?? 0

  const recentIssues = data?.recent_issues ?? []
  const agentsList = data?.agents ?? []

  const hasAnyData = data != null || dash != null

  return jsxs('div', { className: 'flex h-full flex-col overflow-hidden', children: [
    jsxs('div', { className: 'flex items-center justify-between border-b border-(--ui-border) px-4 py-2', children: [
      jsxs('div', { children: [
        jsx('h1', { className: 'text-lg font-semibold', children: 'Paperclip' }),
        jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Governance overview — dashboard-native' })
      ] }),
      jsxs('div', { className: 'flex items-center gap-2', children: [
        jsx('button', { type: 'button', onClick: load, className: 'rounded border border-(--ui-border) px-2 py-1 text-xs text-(--ui-text-tertiary)', children: loading ? 'Refreshing…' : 'Refresh' }),
        jsx('button', { type: 'button', onClick: openNative, className: 'text-xs text-(--ui-accent) underline', children: 'Open in new tab' })
      ] })
    ] }),

    loading && !hasAnyData ? jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading Paperclip…' }) : null,
    !loading && !hasAnyData ? jsx('div', { className: 'p-4 text-sm text-(--ui-danger)', children: error || 'Failed to load data' }) : null,

    hasAnyData ? jsxs('div', { className: 'flex-1 min-h-0 overflow-auto p-4', children: [
      error ? jsx('div', { className: 'mb-3 text-xs text-(--ui-danger)', children: error }) : null,

      jsxs('div', { className: 'grid grid-cols-4 gap-3 mb-4', children: [
        metricCard('Agents Enabled', agentsEnabled, `${agentRunning} running, ${agentPaused} paused, ${agentError} errors`),
        metricCard('Tasks', tasksValue, `${tasksOpen} open, ${tasksBlocked} blocked`),
        metricCard('Month Spend', monthSpend, monthSpendSubtext),
        metricCard('Pending Approvals', pendingApprovals, 'Awaiting board review')
      ] }),

      jsxs('div', { className: 'grid grid-cols-4 gap-3 mb-4', children: recentIssues.slice(0, 4).map((issue, idx) => {
        const key = issue.id || issue.identifier || `recent-${idx}`
        const name = agentName(agentsList, issue.assigneeAgentId)
        const title = issue.title || '—'
        const truncated = title.length > 40 ? title.slice(0, 40) + '…' : title
        return jsxs('div', { key, className: 'rounded border border-(--ui-border) p-3', children: [
          jsx('div', { className: 'text-sm font-medium', children: name }),
          jsx('div', { className: 'text-xs text-(--ui-text-tertiary) truncate', children: truncated }),
          jsxs('div', { className: 'text-xs mt-1', children: [
            jsx('span', { children: issue.identifier || '—' }),
            ' ',
            jsx('span', { children: statusIcon(issue.status) }),
            ' ',
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: timeAgo(issue.updatedAt) })
          ] })
        ] })
      }) }),

      jsxs('div', { className: 'grid grid-cols-2 gap-3', children: [
        section('Issue counts', Object.entries(data?.issue_counts ?? {}).map(([k, v]) =>
          jsx('div', { key: k, className: 'flex justify-between text-sm', children: [jsx('span', { className: 'text-(--ui-text-tertiary)', children: k }), jsx('span', { children: String(v) })] })
        )),
        section('Recent issues', (data?.recent_issues ?? []).slice(0, 10).map((i, idx) => {
          const key = i.id || i.identifier || `issue-${idx}`
          const label = i.identifier || (i.id ? String(i.id).slice(0, 8) : '—')
          return jsx('div', { key, className: 'flex justify-between text-sm', children: [jsx('span', { children: label }), jsx('span', { className: 'text-(--ui-text-tertiary)', children: i.status || '—' })] })
        })),
        section('Agents', (data?.agents ?? []).map((a, idx) => {
          const key = a.id || a.name || `agent-${idx}`
          return jsx('div', { key, className: 'flex justify-between text-sm', children: [jsx('span', { children: a.name || '—' }), jsx('span', { className: 'text-(--ui-text-tertiary)', children: a.role || '' })] })
        })),
        section('Bridge activity', (data?.bridge_activity ?? []).slice(0, 10).map((b, n) =>
          jsx('div', { key: `${b.at || n}-${n}`, className: 'flex justify-between text-sm', children: [jsx('span', { className: 'text-(--ui-text-tertiary)', children: b.tool || '' }), jsx('span', { children: b.ok ? '✓' : '✗' })] })
        ))
      ] }),

      jsxs('div', { className: 'grid grid-cols-2 gap-3 mb-4', children: [
        chartRunActivity(runActivity),
        chartTasksByStatus(counts)
      ] }),

      jsx('div', { className: 'mb-4', children: chartSuccessRate(runActivity) }),

      jsx('div', { className: 'mt-4 text-[10px] text-(--ui-text-tertiary)', children: `Company: ${data?.company_id || '—'} · Paperclip ${data?.health?.version || data?.health?.serverVersion || '—'} · deployment ${data?.health?.deploymentMode || '—'}` })
    ] }) : null
  ] })
}

// === Tasks: API helpers (robust rest) ===
const STATUSES = ['all', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled']
const PRIORITIES = ['critical', 'high', 'medium', 'low']

async function fetchIssues(status) {
  const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100'
  const data = await api(`/issues${q}`)
  return Array.isArray(data) ? data : (data?.issues || data?.data || [])
}

async function fetchIssue(id) {
  const [detail, commentsRaw] = await Promise.all([
    api(`/issues/${encodeURIComponent(id)}`),
    api(`/issues/${encodeURIComponent(id)}/comments`).catch(() => [])
  ])
  const issue = detail?.issue || detail || null
  const comments = Array.isArray(commentsRaw)
    ? commentsRaw
    : (commentsRaw?.comments || commentsRaw?.items || commentsRaw?.data || detail?.comments || [])
  return { issue, comments: Array.isArray(comments) ? comments : [] }
}

async function fetchAgents() {
  const data = await api('/agents').catch(() => [])
  return Array.isArray(data) ? data : (data?.agents || data?.items || data?.data || [])
}

async function fetchAttachments(id) {
  const data = await api(`/issues/${encodeURIComponent(id)}/attachments`)
  return Array.isArray(data) ? data : (data?.attachments || data?.data || [])
}

async function createIssue(body) {
  return api('/issues?confirm=true', { method: 'POST', body: JSON.stringify(body) })
}

async function updateIssue(id, body) {
  return api(`/issues/${encodeURIComponent(id)}?confirm=true`, { method: 'PATCH', body: JSON.stringify(body) })
}

async function addComment(id, body) {
  return api(`/issues/${encodeURIComponent(id)}/comments?confirm=true`, { method: 'POST', body: JSON.stringify(body) })
}

// === CreateIssueForm ===
function CreateIssueForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assignee, setAssignee] = useState('')
  const [labels, setLabels] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!confirm) { setError('Please confirm to create issue'); return }
    setSubmitting(true)
    setError('')
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        priority,
        assignee: assignee.trim() || undefined,
        labels: labels.trim() ? labels.split(',').map(l => l.trim()).filter(Boolean) : undefined,
        dueDate: dueDate || undefined
      }
      await createIssue(body)
      onCreated?.()
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setSubmitting(false)
    }
  }, [title, description, priority, assignee, labels, dueDate, confirm, onCreated])

  return jsxs('div', { className: 'p-4', children: [
    jsxs('div', { className: 'flex items-center justify-between mb-4', children: [
      jsx('h2', { className: 'text-lg font-semibold', children: 'New Issue' }),
      jsx('button', { type: 'button', onClick: onCancel, className: 'text-xs text-(--ui-text-tertiary) underline', children: 'Cancel' })
    ] }),
    error ? jsx('div', { className: 'mb-3 text-xs text-(--ui-danger)', children: error }) : null,
    jsxs('form', { onSubmit: handleSubmit, className: 'space-y-3', children: [
      jsxs('div', { children: [
        jsx('label', { className: 'block text-xs text-(--ui-text-tertiary) mb-1', children: 'Title *' }),
        jsx('input', { type: 'text', value: title, onChange: e => setTitle(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-sm', placeholder: 'Issue title' })
      ] }),
      jsxs('div', { children: [
        jsx('label', { className: 'block text-xs text-(--ui-text-tertiary) mb-1', children: 'Description' }),
        jsx('textarea', { value: description, onChange: e => setDescription(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-sm', rows: 4, placeholder: 'Describe the issue…' })
      ] }),
      jsxs('div', { className: 'grid grid-cols-2 gap-3', children: [
        jsxs('div', { children: [
          jsx('label', { className: 'block text-xs text-(--ui-text-tertiary) mb-1', children: 'Priority' }),
          jsx('select', { value: priority, onChange: e => setPriority(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-sm', children: PRIORITIES.map(p => jsx('option', { key: p, value: p, children: p })) })
        ] }),
        jsxs('div', { children: [
          jsx('label', { className: 'block text-xs text-(--ui-text-tertiary) mb-1', children: 'Assignee' }),
          jsx('input', { type: 'text', value: assignee, onChange: e => setAssignee(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-sm', placeholder: 'Agent or user' })
        ] })
      ] }),
      jsxs('div', { className: 'grid grid-cols-2 gap-3', children: [
        jsxs('div', { children: [
          jsx('label', { className: 'block text-xs text-(--ui-text-tertiary) mb-1', children: 'Labels' }),
          jsx('input', { type: 'text', value: labels, onChange: e => setLabels(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-sm', placeholder: 'comma, separated' })
        ] }),
        jsxs('div', { children: [
          jsx('label', { className: 'block text-xs text-(--ui-text-tertiary) mb-1', children: 'Due date' }),
          jsx('input', { type: 'date', value: dueDate, onChange: e => setDueDate(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-sm' })
        ] })
      ] }),
      jsxs('div', { className: 'flex items-center gap-2', children: [
        jsx('input', { type: 'checkbox', id: 'confirm-create', checked: confirm, onChange: e => setConfirm(e.target.checked) }),
        jsx('label', { htmlFor: 'confirm-create', className: 'text-xs text-(--ui-text-tertiary)', children: 'Confirm creation' })
      ] }),
      jsx('button', { type: 'submit', disabled: submitting || !confirm, className: 'rounded border border-(--ui-border) px-3 py-1.5 text-sm disabled:opacity-50', children: submitting ? 'Creating…' : 'Create Issue' })
    ] })
  ] })
}

// === IssueDetail ===
function IssueDetail({ issueId, onBack, onUpdated }) {
  const [issue, setIssue] = useState(null)
  const [comments, setComments] = useState([])
  const [attachments, setAttachments] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [posting, setPosting] = useState(false)
  const [activeTab, setActiveTab] = useState('properties')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [detail, atts, agts] = await Promise.all([
        fetchIssue(issueId),
        fetchAttachments(issueId).catch(() => []),
        fetchAgents().catch(() => [])
      ])
      setIssue(detail.issue)
      setComments(detail.comments)
      setAttachments(atts)
      setAgents(agts)
      if (detail.issue) {
        setStatus(detail.issue.status || '')
        setPriority(detail.issue.priority || '')
      }
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }, [issueId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => { load() }, 30000)
    return () => clearInterval(id)
  }, [load])

  const handleUpdate = useCallback(async () => {
    if (!confirm) return
    setUpdating(true)
    setError('')
    try {
      await updateIssue(issueId, { status, priority })
      await load()
      onUpdated?.()
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setUpdating(false)
    }
  }, [confirm, status, priority, issueId, load, onUpdated])

  const handleComment = useCallback(async () => {
    if (!confirm || !commentBody.trim()) return
    setPosting(true)
    setError('')
    try {
      await addComment(issueId, { body: commentBody.trim() })
      setCommentBody('')
      await load()
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setPosting(false)
    }
  }, [confirm, commentBody, issueId, load])

  if (loading) return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading issue…' })
  if (error && !issue) return jsxs('div', { className: 'p-4', children: [
    jsx('div', { className: 'text-sm text-(--ui-danger)', children: error }),
    jsx('button', { type: 'button', onClick: onBack, className: 'mt-2 text-xs text-(--ui-text-tertiary) underline', children: '← Back to list' })
  ] })
  if (!issue) return jsxs('div', { className: 'p-4', children: [
    jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Issue not found' }),
    jsx('button', { type: 'button', onClick: onBack, className: 'mt-2 text-xs text-(--ui-text-tertiary) underline', children: '← Back to list' })
  ] })

  const assignee = assigneeLabel(issue, agents)
  const labels = Array.isArray(issue.labels) ? issue.labels : []
  const tabBtn = (id, label) => jsx('button', {
    key: id,
    type: 'button',
    onClick: () => setActiveTab(id),
    className: `rounded px-2 py-0.5 text-xs ${activeTab === id ? 'bg-(--ui-accent) text-white' : 'border border-(--ui-border) text-(--ui-text-tertiary)'}`,
    children: label
  })

  return jsxs('div', { className: 'p-4 space-y-4', children: [
    jsxs('div', { className: 'flex items-center justify-between text-xs text-(--ui-text-tertiary)', children: [
      jsxs('div', { className: 'flex items-center gap-1', children: [
        jsx('button', { type: 'button', onClick: onBack, className: 'underline', children: 'Tasks' }),
        jsx('span', { children: '/' }),
        jsx('span', { children: issue.identifier || String(issue.id || '').slice(0, 8) })
      ] }),
      jsx('button', { type: 'button', onClick: load, className: 'rounded border border-(--ui-border) px-2 py-0.5', children: loading ? 'Refreshing…' : 'Refresh' })
    ] }),

    jsx('h2', { className: 'text-lg font-semibold', children: issue.title || '—' }),

    jsxs('div', { className: 'flex flex-wrap gap-2', children: [
      jsxs('span', { className: 'rounded border border-(--ui-border) px-2 py-0.5 text-xs', children: [statusIcon(issue.status), ' ', issue.status || '—'] }),
      jsx('span', { className: 'rounded border border-(--ui-border) px-2 py-0.5 text-xs text-(--ui-text-tertiary)', children: `Assignee: ${assignee}` })
    ] }),

    jsxs('div', { className: 'flex gap-1', children: [tabBtn('properties', 'Properties'), tabBtn('comments', `Comments (${comments.length})`)] }),

    activeTab === 'properties' ? jsxs('div', { className: 'space-y-3', children: [
      jsxs('div', { className: 'rounded border border-(--ui-border) p-3', children: [
        jsx('h3', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary) mb-2', children: 'Properties' }),
        jsxs('dl', { className: 'grid grid-cols-2 gap-x-3 gap-y-2 text-xs', children: [
          jsxs('div', { children: [jsx('dt', { className: 'text-(--ui-text-tertiary)', children: 'Status' }), jsx('dd', { children: issue.status || '—' })] }),
          jsxs('div', { children: [jsx('dt', { className: 'text-(--ui-text-tertiary)', children: 'Priority' }), jsx('dd', { children: issue.priority || '—' })] }),
          jsxs('div', { children: [jsx('dt', { className: 'text-(--ui-text-tertiary)', children: 'Assignee' }), jsx('dd', { children: assignee })] }),
          jsxs('div', { children: [jsx('dt', { className: 'text-(--ui-text-tertiary)', children: 'Labels' }), jsx('dd', { children: labels.length ? labels.map(String).join(', ') : '—' })] }),
          jsxs('div', { children: [jsx('dt', { className: 'text-(--ui-text-tertiary)', children: 'Created' }), jsx('dd', { children: formatDate(issue.createdAt) })] }),
          jsxs('div', { children: [jsx('dt', { className: 'text-(--ui-text-tertiary)', children: 'Updated' }), jsx('dd', { children: `${formatDate(issue.updatedAt)} (${timeAgo(issue.updatedAt)})` })] })
        ] }),
        labels.length ? jsx('div', { className: 'mt-2 flex flex-wrap gap-1', children: labels.map((l, i) => jsx('span', { key: `${l}-${i}`, className: 'rounded border border-(--ui-border) px-1.5 py-0.5 text-[10px] text-(--ui-text-tertiary)', children: String(l) })) }) : null
      ] }),
      issue.description ? jsxs('div', { className: 'rounded border border-(--ui-border) p-3', children: [
        jsx('h3', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary) mb-1', children: 'Description' }),
        jsx('div', { className: 'text-sm whitespace-pre-wrap', children: issue.description })
      ] }) : null,
      jsxs('div', { className: 'rounded border border-(--ui-border) p-3 space-y-2', children: [
        jsx('h3', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: 'Update status' }),
        jsxs('div', { className: 'grid grid-cols-2 gap-2', children: [
          jsxs('div', { children: [
            jsx('label', { className: 'block text-[10px] text-(--ui-text-tertiary) mb-0.5', children: 'Status' }),
            jsx('select', { value: status, onChange: e => setStatus(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-xs', children: STATUSES.filter(s => s !== 'all').map(s => jsx('option', { key: s, value: s, children: s })) })
          ] }),
          jsxs('div', { children: [
            jsx('label', { className: 'block text-[10px] text-(--ui-text-tertiary) mb-0.5', children: 'Priority' }),
            jsx('select', { value: priority, onChange: e => setPriority(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-xs', children: PRIORITIES.map(p => jsx('option', { key: p, value: p, children: p })) })
          ] })
        ] }),
        jsxs('div', { className: 'flex items-center gap-2', children: [
          jsx('input', { type: 'checkbox', id: 'confirm-update', checked: confirm, onChange: e => setConfirm(e.target.checked) }),
          jsx('label', { htmlFor: 'confirm-update', className: 'text-[10px] text-(--ui-text-tertiary)', children: 'Confirm writes' })
        ] }),
        jsx('button', { type: 'button', onClick: handleUpdate, disabled: !confirm || updating, className: 'rounded border border-(--ui-border) px-2 py-1 text-xs disabled:opacity-50', children: updating ? 'Updating…' : 'Update' })
      ] })
    ] }) : null,

    activeTab === 'comments' ? jsxs('div', { className: 'rounded border border-(--ui-border) p-3 space-y-2', children: [
      jsx('h3', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: `Comments (${comments.length})` }),
      comments.length === 0 ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No comments yet' }) : null,
      comments.map((c, i) => jsxs('div', { key: c.id || i, className: 'border-b border-(--ui-border) pb-2 last:border-0', children: [
        jsxs('div', { className: 'flex justify-between text-[10px] text-(--ui-text-tertiary)', children: [
          jsx('span', { children: c.author || c.authorName || c.authorAgentName || '—' }),
          jsx('span', { children: `${formatDate(c.createdAt)} (${timeAgo(c.createdAt)})` })
        ] }),
        jsx('div', { className: 'text-sm mt-0.5 whitespace-pre-wrap', children: c.body || '' })
      ] })),
      jsxs('div', { className: 'space-y-1', children: [
        jsx('textarea', { value: commentBody, onChange: e => setCommentBody(e.target.value), className: 'w-full rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-xs', rows: 2, placeholder: 'Add a comment…' }),
        jsx('button', { type: 'button', onClick: handleComment, disabled: !confirm || posting || !commentBody.trim(), className: 'rounded border border-(--ui-border) px-2 py-1 text-xs disabled:opacity-50', children: posting ? 'Posting…' : 'Post comment' })
      ] })
    ] }) : null,

    jsxs('div', { className: 'rounded border border-(--ui-border) p-3 space-y-2', children: [
      jsx('h3', { className: 'text-xs uppercase tracking-wide text-(--ui-text-tertiary)', children: `Attachments (${attachments.length})` }),
      attachments.length === 0 ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No attachments' }) : null,
      attachments.map((a, i) => jsxs('div', { key: a.id || a.name || i, className: 'flex items-center justify-between text-xs', children: [
        jsx('span', { children: a.name || a.filename || '—' }),
        jsx('span', { className: 'text-(--ui-text-tertiary)', children: a.size ? `${Math.round(a.size / 1024)}KB` : '' })
      ] }))
    ] }),

    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null
  ] })
}

// === PageTasks ===
function PageTasks() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [view, setView] = useState('list')
  const [layout, setLayout] = useState('list')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await fetchIssues(statusFilter)
      setIssues(list)
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const openIssue = useCallback((id) => { setSelectedId(id); setView('detail') }, [])
  const openCreate = useCallback(() => setView('create'), [])
  const backToList = useCallback(() => { setView('list'); setSelectedId(null) }, [])
  const handleCreated = useCallback(() => { setView('list'); load() }, [load])
  const handleUpdated = useCallback(() => { load() }, [load])

  if (view === 'create') {
    return jsx(CreateIssueForm, { onCreated: handleCreated, onCancel: backToList })
  }

  if (view === 'detail' && selectedId) {
    return jsx(IssueDetail, { key: selectedId, issueId: selectedId, onBack: backToList, onUpdated: handleUpdated })
  }

  const q = query.trim().toLowerCase()
  const filtered = q ? issues.filter(issue => [issue.title, issue.identifier, issue.description, issue.assignee, issue.executionAgentNameKey, issue.assigneeAgentId, issue.status, issue.priority].filter(Boolean).some(v => String(v).toLowerCase().includes(q))) : issues
  const boardStatuses = STATUSES.filter(s => s !== 'all')
  const visibleBoardStatuses = statusFilter === 'all' ? boardStatuses : [statusFilter]
  const grouped = {}
  visibleBoardStatuses.forEach(s => { grouped[s] = [] })
  filtered.forEach(issue => {
    const st = issue.status || 'todo'
    if (grouped[st]) grouped[st].push(issue)
    else if (statusFilter === 'all') { grouped[st] = grouped[st] || []; grouped[st].push(issue) }
  })

  const renderRow = (issue, idx) => {
    const key = issue.id || issue.identifier || `issue-${idx}`
    return jsxs('button', {
      key,
      type: 'button',
      onClick: () => openIssue(issue.id || issue.identifier),
      className: 'w-full text-left rounded border border-(--ui-border) px-3 py-2 hover:bg-(--ui-bg-secondary) transition-colors',
      children: [
        jsxs('div', { className: 'flex items-center justify-between', children: [
          jsx('span', { className: 'text-sm font-medium truncate', children: issue.title || '—' }),
          jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: issue.identifier || '' })
        ] }),
        jsxs('div', { className: 'flex items-center gap-2 mt-0.5 text-xs text-(--ui-text-tertiary)', children: [
          jsxs('span', { children: [statusIcon(issue.status), ' ', issue.status || '—'] }),
          jsx('span', { children: `· ${issue.priority || '—'}` }),
          jsx('span', { children: `· ${issue.assignee || issue.executionAgentNameKey || 'unassigned'}` }),
          jsx('span', { children: `· ${timeAgo(issue.updatedAt)}` })
        ] })
      ]
    })
  }

  return jsxs('div', { className: 'flex h-full flex-col overflow-hidden', children: [
    jsxs('div', { className: 'flex items-center justify-between border-b border-(--ui-border) px-4 py-2', children: [
      jsx('h1', { className: 'text-lg font-semibold', children: 'Tasks' }),
      jsxs('div', { className: 'flex items-center gap-2', children: [
        jsxs('div', { className: 'flex rounded border border-(--ui-border) overflow-hidden', children: [
          jsx('button', { type: 'button', onClick: () => setLayout('list'), className: `px-2 py-1 text-xs ${layout === 'list' ? 'bg-(--ui-accent) text-white' : 'text-(--ui-text-tertiary)'}`, children: 'List' }),
          jsx('button', { type: 'button', onClick: () => setLayout('board'), className: `px-2 py-1 text-xs ${layout === 'board' ? 'bg-(--ui-accent) text-white' : 'text-(--ui-text-tertiary)'}`, children: 'Board' })
        ] }),
        jsx('button', { type: 'button', onClick: load, className: 'rounded border border-(--ui-border) px-2 py-1 text-xs text-(--ui-text-tertiary)', children: loading ? 'Refreshing…' : 'Refresh' }),
        jsx('button', { type: 'button', onClick: openCreate, className: 'rounded border border-(--ui-border) px-2 py-1 text-xs', children: '+ New Issue' })
      ] })
    ] }),

    jsxs('div', { className: 'flex items-center gap-2 border-b border-(--ui-border) px-4 py-2', children: [
      jsx('input', { type: 'text', value: query, onChange: e => setQuery(e.target.value), placeholder: 'Search tasks…', className: 'w-full max-w-xs rounded border border-(--ui-border) bg-(--ui-bg) px-2 py-1 text-xs' }),
      query ? jsx('button', { type: 'button', onClick: () => setQuery(''), className: 'text-xs text-(--ui-text-tertiary) underline', children: 'Clear' }) : null,
      jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: `${filtered.length} of ${issues.length}` })
    ] }),

    jsx('div', { className: 'flex flex-wrap gap-1 border-b border-(--ui-border) px-4 py-2', children: STATUSES.map(s => jsx('button', {
      key: s,
      type: 'button',
      onClick: () => setStatusFilter(s),
      className: `rounded px-2 py-0.5 text-xs ${s === statusFilter ? 'bg-(--ui-accent) text-white' : 'border border-(--ui-border) text-(--ui-text-tertiary)'}`,
      children: s
    })) }),

    error ? jsx('div', { className: 'px-4 py-2 text-xs text-(--ui-danger)', children: error }) : null,

    layout === 'board'
      ? jsx('div', { className: 'flex-1 min-h-0 overflow-auto p-4', children:
        loading && issues.length === 0
          ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading issues…' })
          : jsxs('div', { className: 'grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4', children:
            visibleBoardStatuses.map(st => jsxs('div', { key: st, className: 'rounded border border-(--ui-border) p-2', children: [
              jsxs('div', { className: 'flex items-center justify-between px-1 pb-2 text-xs text-(--ui-text-tertiary)', children: [
                jsxs('span', { children: [statusIcon(st), ' ', st] }),
                jsx('span', { children: String((grouped[st] || []).length) })
              ] }),
              jsx('div', { className: 'space-y-1', children: (grouped[st] || []).map((issue, idx) => renderRow(issue, `${st}-${idx}`)) }),
              (grouped[st] || []).length === 0 ? jsx('div', { className: 'px-1 py-2 text-[11px] text-(--ui-text-tertiary)', children: 'No issues' }) : null
            ] }))
          })
      })
      : jsxs('div', { className: 'flex-1 min-h-0 overflow-auto p-4', children: [
        loading && issues.length === 0 ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading issues…' }) : null,
        !loading && filtered.length === 0 && !error ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: q ? `No issues match "${query}"` : 'No issues found' }) : null,
        filtered.length > 0 ? jsx('div', { className: 'space-y-1', children: filtered.map((issue, idx) => renderRow(issue, idx)) }) : null
      ] })
  ] })
}

// === PageAgents ===
function AgentCard({ agent, selected, onClick }) {
  const name = agent.name || '—'
  const role = agent.role || '—'
  const status = agent.status || 'unknown'
  const issueCount = agent.assignedIssues?.length || agent.issues?.length || agent.issueCount || agent.assignedCount || 0
  const statusClass = status === 'active' ? 'text-(--ui-accent)' : status === 'paused' ? 'text-(--ui-text-tertiary)' : 'text-(--ui-danger)'
  return jsxs('div', {
    className: `rounded border p-3 cursor-pointer transition-colors ${selected ? 'border-(--ui-accent)' : 'border-(--ui-border)'}`,
    onClick,
    children: [
      jsx('div', { className: 'text-sm font-medium truncate', children: name }),
      jsx('div', { className: 'text-xs text-(--ui-text-tertiary) truncate', children: role }),
      jsxs('div', { className: 'mt-1 flex items-center justify-between', children: [
        jsx('span', { className: `text-xs font-medium ${statusClass}`, children: status }),
        jsxs('span', { className: 'text-xs text-(--ui-text-tertiary)', children: [issueCount, ' issues'] })
      ] })
    ]
  })
}

function AgentDetail({ agent }) {
  if (!agent) return null
  const issues = Array.isArray(agent.assignedIssues) ? agent.assignedIssues
    : Array.isArray(agent.issues) ? agent.issues
    : Array.isArray(agent.assigned) ? agent.assigned
    : []
  const name = agent.name || '—'
  const role = agent.role || '—'
  const status = agent.status || 'unknown'
  return jsxs('section', { className: 'rounded border border-(--ui-border) p-3', children: [
    jsxs('div', { className: 'flex items-center justify-between mb-2', children: [
      jsx('h2', { className: 'text-sm font-medium', children: name }),
      jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: `${role} · ${status}` })
    ] }),
    issues.length === 0
      ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'No assigned issues' })
      : jsx('div', { className: 'space-y-1', children: issues.map((issue, i) => {
          const key = issue.id || issue.identifier || i
          const title = issue.title || issue.identifier || '—'
          const id = issue.identifier || (issue.id ? String(issue.id).slice(0, 8) : '—')
          const st = issue.status || '—'
          const updated = timeAgo(issue.updatedAt || issue.updated_at)
          return jsxs('div', { key, className: 'flex items-center justify-between text-sm', children: [
            jsx('span', { className: 'truncate flex-1', children: title }),
            jsxs('span', { className: 'text-xs text-(--ui-text-tertiary) ml-2 shrink-0', children: [id, ' ', statusIcon(st), ' ', updated] })
          ] })
        })
      })
  ] })
}

function PageAgents() {
  const { loading, data, error, load } = usePollingData(['/agents', '/dashboard'])
  const [selectedId, setSelectedId] = useState(null)
  const agentsRaw = data['/agents']
  const agents = Array.isArray(agentsRaw) ? agentsRaw : (agentsRaw?.agents || [])
  const dashRaw = data['/dashboard']
  const dashboard = dashRaw?.dashboard || dashRaw
  const dashAgents = dashboard?.agents
  const selected = agents.find(a => a.id === selectedId)
  const hasData = agents.length > 0 || dashboard != null
  return jsxs('div', { className: 'flex h-full flex-col overflow-hidden', children: [
    jsxs('div', { className: 'flex items-center justify-between border-b border-(--ui-border) px-4 py-2', children: [
      jsxs('div', { children: [
        jsx('h1', { className: 'text-lg font-semibold', children: 'Agents' }),
        jsx('p', { className: 'text-xs text-(--ui-text-tertiary)', children: `${agents.length} agents · ${dashAgents?.active ?? 0} active · ${dashAgents?.paused ?? 0} paused · ${dashAgents?.error ?? 0} errors` })
      ] }),
      jsx('button', { type: 'button', onClick: load, className: 'rounded border border-(--ui-border) px-2 py-1 text-xs text-(--ui-text-tertiary)', children: loading ? 'Refreshing…' : 'Refresh' })
    ] }),
    loading && !hasData ? jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading agents…' }) : null,
    !loading && !hasData ? jsx('div', { className: 'p-4 text-sm text-(--ui-danger)', children: error || 'Failed to load data' }) : null,
    hasData ? jsxs('div', { className: 'flex-1 min-h-0 overflow-auto p-4', children: [
      error ? jsx('div', { className: 'mb-3 text-xs text-(--ui-danger)', children: error }) : null,
      jsx('div', { className: 'grid grid-cols-3 gap-3 mb-4', children: agents.map((agent, idx) => {
        const key = agent.id || agent.name || `agent-${idx}`
        return jsx(AgentCard, { key, agent, selected: agent.id === selectedId, onClick: () => setSelectedId(agent.id === selectedId ? null : agent.id) })
      }) }),
      selected ? jsx(AgentDetail, { agent: selected }) : jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Select an agent to view assigned issues' })
    ] }) : null
  ] })
}

// === RunActivitySection (used by Bridge page) ===
function RunActivityBars({ runActivity }) {
  const series = ['succeeded', 'failed', 'recovered', 'other']
  const seriesOpacity = { succeeded: 1.0, failed: 0.55, recovered: 0.3, other: 0.35 }
  if (!runActivity.length) {
    return jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'No run activity yet' })
  }
  const maxCount = Math.max(...runActivity.map(d =>
    Math.max(d.succeeded || 0, d.failed || 0, d.recovered || 0, d.other || 0)
  ), 1)
  const n = runActivity.length
  const isLabeled = (i) => i === 0 || i === n - 1 || i === Math.floor(n / 2)
  return jsxs('div', {
    className: 'flex items-end justify-between gap-px h-32',
    children: runActivity.map((day, i) => jsxs('div', {
      key: day.date || i,
      className: 'flex flex-col items-center flex-1 min-w-[20px]',
      children: [
        jsxs('div', {
          className: 'flex items-end justify-center gap-[1px] w-full h-24',
          children: series.map(s => {
            const val = day[s] || 0
            const h = (val / maxCount) * 100
            return jsx('div', {
              key: s,
              className: 'flex-1 min-w-[2px]',
              children: jsx('div', {
                className: 'w-full rounded-t-sm',
                style: {
                  backgroundColor: 'var(--ui-accent)',
                  opacity: s === 'other' ? 0.35 : seriesOpacity[s],
                  height: `${h}%`,
                  minHeight: val > 0 ? '2px' : 0
                },
                title: `${s}: ${val}`
              })
            })
          })
        }),
        jsx('div', {
          className: 'mt-1 text-[9px] text-(--ui-text-tertiary) text-center truncate',
          children: isLabeled(i) ? (day.date || '—') : ''
        })
      ]
    }))
  })
}

function RunActivitySection() {
  const { loading, data, error, load } = usePollingData(['/live-runs', '/dashboard'])
  const liveRaw = data['/live-runs']
  const liveRuns = Array.isArray(liveRaw) ? liveRaw : (liveRaw?.runs || liveRaw?.liveRuns || [])
  const dashRaw = data['/dashboard']
  const dashboard = dashRaw?.dashboard || dashRaw
  const runActivity = dashboard?.runActivity || []
  const hasData = liveRuns.length > 0 || runActivity.length > 0 || dashboard != null
  return jsxs('section', { className: 'rounded border border-(--ui-border) p-3', children: [
    jsxs('div', { className: 'flex items-center justify-between mb-2', children: [
      jsx('h2', { className: 'text-sm font-medium', children: 'Run Activity' }),
      jsx('button', { type: 'button', onClick: load, className: 'rounded border border-(--ui-border) px-2 py-0.5 text-xs text-(--ui-text-tertiary)', children: loading ? 'Refreshing…' : 'Refresh' })
    ] }),
    error ? jsx('div', { className: 'mb-2 text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading…' }) : null,
    !loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'No data available' }) : null,
    hasData ? jsxs('div', { children: [
      jsxs('div', { className: 'mb-3', children: [
        jsx('h3', { className: 'text-xs font-medium text-(--ui-text-tertiary) mb-1', children: `Live Runs (${liveRuns.length})` }),
        liveRuns.length === 0
          ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'No active runs' })
          : jsx('div', { className: 'space-y-1', children: liveRuns.slice(0, 10).map((run, i) => {
              const key = run.id || run.runId || `run-${i}`
              const agentId = run.agentId || run.agent_id || '—'
              const status = run.status || '—'
              const started = timeAgo(run.startedAt || run.started_at || run.createdAt)
              return jsxs('div', { key, className: 'flex items-center justify-between text-sm', children: [
                jsx('span', { className: 'truncate flex-1', children: run.id || run.runId || `Run ${i + 1}` }),
                jsxs('span', { className: 'text-xs text-(--ui-text-tertiary) ml-2 shrink-0', children: [agentId, ' · ', status, ' · ', started] })
              ] })
            })
          })
      ] }),
      jsxs('div', { children: [
        jsx('h3', { className: 'text-xs font-medium text-(--ui-text-tertiary) mb-1', children: '14-Day Activity' }),
        jsx(RunActivityBars, { runActivity })
      ] })
    ] }) : null
  ] })
}

// === Page: Costs ===
function PageCosts() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api('/costs')
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e?.message || e)); setLoading(false) })
  }, [])

  usePolling(load, 30000)

  if (loading && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading costs…' })
  if (error && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-danger)', children: error })

  const costs = data?.costs || data || {}
  const spend = costs.monthSpendCents ?? 0
  const budget = costs.monthBudgetCents ?? 0
  const isUnlimited = !budget || budget <= 0
  const utilization = isUnlimited ? 0 : Math.round((spend / budget) * 100)

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    pageHeader('Costs', 'Monthly spend vs budget', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    jsxs('div', { className: 'grid grid-cols-2 gap-2 md:grid-cols-3', children: [
      metricCard('Month spend', fmtCents(spend)),
      metricCard('Budget', isUnlimited ? 'Unlimited' : fmtCents(budget)),
      metricCard('Utilization', isUnlimited ? '—' : `${utilization}%`)
    ] }),
    section('Cost details', [
      jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: isUnlimited ? 'No budget set — spend is unlimited.' : `Spent ${fmtCents(spend)} of ${fmtCents(budget)} (${utilization}%)` })
    ])
  ] })
}

// === Page: Approvals (no /approvals/{id}/issues — load issue via GET /issues/{id}) ===
function PageApprovals() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [approving, setApproving] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api('/approvals')
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e?.message || e)); setLoading(false) })
  }, [])

  usePolling(load, 30000)

  const approve = useCallback(async (approval) => {
    if (!confirm) { setError('Please tick confirm before approving'); return }
    const issueId = approval.issueId || approval.issue_id || approval.entityId || approval.entity_id || null
    if (!issueId) { setError('Approval has no linked issue'); return }
    setApproving(approval.id)
    setError('')
    try {
      // Verify the issue exists via GET /issues/{id}, then mark it done.
      await api(`/issues/${encodeURIComponent(issueId)}`)
      await api(`/issues/${encodeURIComponent(issueId)}?confirm=true`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' })
      })
      load()
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setApproving(null)
    }
  }, [confirm, load])

  if (loading && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading approvals…' })
  if (error && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-danger)', children: error })

  const approvals = Array.isArray(data) ? data : (data?.items || data?.approvals || [])
  const pending = approvals.filter(a => a.status === 'pending')

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    pageHeader('Approvals', 'Pending approvals', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    section('Pending approvals', [
      pending.length === 0
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No pending approvals' })
        : jsx('div', { className: 'space-y-2', children: pending.map((a, idx) => jsxs('div', { className: 'flex items-center justify-between border-b border-(--ui-border) py-2 text-xs', children: [
            jsxs('div', { children: [
              jsx('span', { className: 'font-medium', children: a.type || 'Approval' }),
              jsx('span', { className: 'ml-2 text-(--ui-text-tertiary)', children: a.id ? String(a.id).slice(0, 8) : `#${idx}` })
            ] }),
            jsx('button', {
              type: 'button',
              className: 'rounded border border-(--ui-border) px-2 py-1 text-[10px] disabled:opacity-50',
              onClick: () => approve(a),
              disabled: approving === a.id || !confirm,
              children: approving === a.id ? 'Approving…' : 'Approve'
            })
          ] }, a.id || `approval-${idx}`)) }),
      jsxs('div', { className: 'mt-2 flex items-center gap-2', children: [
        jsx('input', { type: 'checkbox', id: 'confirm-approve', checked: confirm, onChange: e => setConfirm(e.target.checked) }),
        jsx('label', { htmlFor: 'confirm-approve', className: 'text-[10px] text-(--ui-text-tertiary)', children: 'Confirm approvals' })
      ] })
    ])
  ] })
}

// === Page: Bridge ===
function PageBridge() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api('/activity')
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e?.message || e)); setLoading(false) })
  }, [])

  usePolling(load, 30000)

  if (loading && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading activity…' })
  if (error && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-danger)', children: error })

  const items = data?.items || data?.activity || (Array.isArray(data) ? data : [])

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    pageHeader('Bridge', 'Activity timeline & run activity', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    jsx(RunActivitySection, {}),
    section('Activity', [
      items.length === 0
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No activity recorded' })
        : jsx('div', { children: items.slice(0, 50).map((a, i) => jsxs('div', { className: 'grid grid-cols-[80px_1fr_auto] gap-2 border-b border-(--ui-border) py-2 text-xs', children: [
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: a.actorType || 'system' }),
            jsx('span', { children: a.action || 'unknown' }),
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: timeAgo(a.createdAt || a.at) })
          ] }, a.id || `activity-${i}`)) })
    ])
  ] })
}

// === Page: Health ===
function PageHealth() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api('/health')
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e?.message || e)); setLoading(false) })
  }, [])

  usePolling(load, 30000)

  if (loading && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-text-tertiary)', children: 'Loading health…' })
  if (error && !data) return jsx('div', { className: 'p-4 text-sm text-(--ui-danger)', children: error })

  const health = data || {}

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    pageHeader('Health', 'System health', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    jsxs('div', { className: 'grid grid-cols-2 gap-2 md:grid-cols-4', children: [
      metricCard('Status', health.status || '—'),
      metricCard('Version', health.version || health.serverVersion || '—'),
      metricCard('Deployment', health.deploymentMode || '—'),
      metricCard('Commit', health.commit ? String(health.commit).slice(0, 8) : '—')
    ] }),
    section('Details', [
      jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: `Deployment exposure: ${health.deploymentExposure || '—'}` }),
      jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: `Bootstrap: ${health.bootstrapStatus || '—'}` })
    ])
  ] })
}

// === Page: Goals ===
function PageGoals() {
  const { loading, data, error, load } = usePollingData(['/projects', '/goals'])
  const projectsRaw = data['/projects']
  const goalsRaw = data['/goals']
  const projects = Array.isArray(projectsRaw) ? projectsRaw : (projectsRaw?.items || projectsRaw?.projects || [])
  const goals = Array.isArray(goalsRaw) ? goalsRaw : (goalsRaw?.items || goalsRaw?.goals || [])
  const hasData = projects.length > 0 || goals.length > 0 || projectsRaw != null || goalsRaw != null

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    pageHeader('Goals', 'Projects and goals', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading goals…' }) : null,
    section('Projects', [
      projects.length === 0
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No projects' })
        : jsx('div', { children: projects.map((p, i) => jsx('div', { className: 'border-b border-(--ui-border) py-2 text-xs', children: p.name || p.title || 'Untitled' }, p.id || `project-${i}`)) })
    ]),
    section('Goals', [
      goals.length === 0
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No goals' })
        : jsx('div', { children: goals.map((g, i) => jsxs('div', { className: 'border-b border-(--ui-border) py-2 text-xs', children: [
            jsx('span', { children: g.title || g.name || 'Untitled' }),
            g.status ? jsx('span', { className: 'ml-2 text-(--ui-text-tertiary)', children: g.status }) : null
          ] }, g.id || `goal-${i}`)) })
    ])
  ] })
}

// === A4: missing sidebar sections (original order: Dashboard, Inbox, WORK[Tasks, Projects, Routines, Artifacts, Goals], ORG[Agents, Skills, Connectors, Audit]) ===

function groupEyebrow(label) {
  return jsx('div', { className: 'text-[10px] uppercase tracking-widest text-(--ui-text-tertiary)', children: label })
}

// === Page: Dashboard (company KPIs + run activity) ===
function PageDashboard() {
  const { loading, data, error, load } = usePollingData(['/dashboard'])
  const raw = data['/dashboard']
  const dash = raw?.dashboard || raw || {}
  const agents = dash.agents || {}
  const tasks = dash.tasks || {}
  const costs = dash.costs || {}
  const runActivity = dash.runActivity || []
  const hasData = raw != null
  const spend = costs.monthSpendCents ?? 0
  const budget = costs.monthBudgetCents ?? 0
  const unlimited = !budget || budget <= 0
  const byStatus = { open: tasks.open ?? 0, in_progress: tasks.inProgress ?? 0, blocked: tasks.blocked ?? 0, done: tasks.done ?? 0 }

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    pageHeader('Dashboard', 'Company KPIs and run activity', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading dashboard…' }) : null,
    hasData ? jsxs('div', { className: 'grid grid-cols-2 gap-2 md:grid-cols-4', children: [
      metricCard('Agents Active', agents.active ?? 0, `${agents.running ?? 0} running, ${agents.paused ?? 0} paused, ${agents.error ?? 0} errors`),
      metricCard('Tasks Open', tasks.open ?? 0, `${tasks.inProgress ?? 0} in progress, ${tasks.blocked ?? 0} blocked, ${tasks.done ?? 0} done`),
      metricCard('Month Spend', fmtCents(spend), unlimited ? 'Unlimited budget' : `${costs.monthUtilizationPercent ?? 0}% of budget`),
      metricCard('Pending Approvals', dash.pendingApprovals ?? 0, 'Awaiting board review')
    ] }) : null,
    hasData ? jsxs('div', { className: 'grid grid-cols-1 gap-3 md:grid-cols-2', children: [
      chartRunActivity(runActivity),
      chartTasksByStatus(byStatus)
    ] }) : null,
    hasData ? chartSuccessRate(runActivity) : null
  ] })
}

// === Page: Inbox (needs attention: failed runs, pending approvals, recent updates) ===
function PageInbox() {
  const { loading, data, error, load } = usePollingData(['/issues', '/live-runs', '/approvals'])
  const issuesRaw = data['/issues']
  const runsRaw = data['/live-runs']
  const apprRaw = data['/approvals']
  const issues = Array.isArray(issuesRaw) ? issuesRaw : (issuesRaw?.issues || issuesRaw?.items || [])
  const runs = Array.isArray(runsRaw) ? runsRaw : (runsRaw?.live_runs || runsRaw?.runs || [])
  const approvals = Array.isArray(apprRaw) ? apprRaw : (apprRaw?.approvals || apprRaw?.items || [])
  const hasData = issuesRaw != null || runsRaw != null || apprRaw != null
  const failed = runs.filter(r => ['failed', 'error'].includes(String(r.status || '').toLowerCase()))
  const pending = approvals.filter(a => a.status === 'pending')
  const recent = issues
    .filter(i => i.status !== 'done' && i.status !== 'cancelled')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 20)

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    pageHeader('Inbox', 'Needs attention', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading inbox…' }) : null,
    section('Failed runs', [
      failed.length === 0
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No failed runs' })
        : jsx('div', { children: failed.slice(0, 10).map((r, i) => jsxs('div', { className: 'flex items-center justify-between border-b border-(--ui-border) py-2 text-xs', children: [
            jsx('span', { children: r.agentName || r.agentId || r.id || 'Run' }),
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: timeAgo(r.updatedAt || r.createdAt) })
          ] }, r.id || `run-${i}`)) })
    ]),
    section('Pending approvals', [
      pending.length === 0
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No pending approvals' })
        : jsx('div', { children: pending.slice(0, 10).map((a, i) => jsxs('div', { className: 'flex items-center justify-between border-b border-(--ui-border) py-2 text-xs', children: [
            jsx('span', { className: 'font-medium', children: a.type || 'Approval' }),
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: a.id ? String(a.id).slice(0, 8) : `#${i}` })
          ] }, a.id || `approval-${i}`)) })
    ]),
    section('Recently updated', [
      recent.length === 0
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Nothing open' })
        : jsx('div', { children: recent.map((issue, i) => jsxs('div', { className: 'border-b border-(--ui-border) py-2 text-xs', children: [
            jsxs('div', { className: 'flex items-center justify-between', children: [
              jsx('span', { className: 'font-medium truncate', children: issue.title || '—' }),
              jsx('span', { className: 'ml-2 shrink-0 text-(--ui-text-tertiary)', children: issue.identifier || '' })
            ] }),
            jsxs('div', { className: 'mt-0.5 text-(--ui-text-tertiary)', children: [
              jsxs('span', { children: [statusIcon(issue.status), ' ', issue.status || '—'] }),
              jsx('span', { children: ` · ${timeAgo(issue.updatedAt)}` })
            ] })
          ] }, issue.id || `issue-${i}`)) })
    ])
  ] })
}

// === Page: Projects (WORK group) ===
function PageProjects() {
  const { loading, data, error, load } = usePollingData(['/projects', '/goals'])
  const projectsRaw = data['/projects']
  const projects = Array.isArray(projectsRaw) ? projectsRaw : (projectsRaw?.projects || projectsRaw?.items || [])
  const hasData = projectsRaw != null

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    groupEyebrow('Work'),
    pageHeader('Projects', 'Company projects', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading projects…' }) : null,
    section('Projects', [
      projects.length === 0 && hasData
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No projects' })
        : jsx('div', { children: projects.map((p, i) => jsxs('div', { className: 'border-b border-(--ui-border) py-2', children: [
            jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
              jsx('span', { className: 'font-medium', children: p.name || p.title || 'Untitled' }),
              jsx('span', { className: 'ml-2 shrink-0 text-(--ui-text-tertiary)', children: [statusIcon(p.status), ' ', p.status || '—'].join('') })
            ] }),
            p.description ? jsx('div', { className: 'mt-0.5 text-xs text-(--ui-text-tertiary)', children: p.description.length > 160 ? p.description.slice(0, 160) + '…' : p.description }) : null,
            Array.isArray(p.goals) && p.goals.length ? jsx('div', { className: 'mt-0.5 text-[10px] text-(--ui-text-tertiary)', children: `Goals: ${p.goals.map(g => g.title || g.name).filter(Boolean).join(', ')}` }) : null
          ] }, p.id || `project-${i}`)) })
    ])
  ] })
}

// === Page: Routines (WORK group) ===
function PageRoutines() {
  const { loading, data, error, load } = usePollingData(['/routines'])
  const raw = data['/routines']
  const routines = Array.isArray(raw) ? raw : (raw?.routines || raw?.items || [])
  const hasData = raw != null

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    groupEyebrow('Work'),
    pageHeader('Routines', 'Scheduled and recurring work', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading routines…' }) : null,
    section('Routines', [
      routines.length === 0 && hasData
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No routines' })
        : jsx('div', { children: routines.map((r, i) => jsxs('div', { className: 'border-b border-(--ui-border) py-2', children: [
            jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
              jsx('span', { className: 'font-medium truncate', children: r.title || r.name || 'Untitled' }),
              jsx('span', { className: 'ml-2 shrink-0 text-(--ui-text-tertiary)', children: [statusIcon(r.status), ' ', r.status || '—'].join('') })
            ] }),
            jsxs('div', { className: 'mt-0.5 text-[10px] text-(--ui-text-tertiary)', children: [
              jsx('span', { children: `Triggers: ${Array.isArray(r.triggers) ? r.triggers.length : 0}` }),
              jsx('span', { children: ` · Last run: ${r.lastTriggeredAt ? timeAgo(r.lastTriggeredAt) : 'never'}` })
            ] })
          ] }, r.id || `routine-${i}`)) })
    ])
  ] })
}

// === Page: Artifacts (WORK group) ===
function PageArtifacts() {
  const { loading, data, error, load } = usePollingData(['/artifacts'])
  const raw = data['/artifacts']
  const artifacts = Array.isArray(raw) ? raw : (raw?.artifacts || raw?.items || [])
  const hasData = raw != null

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    groupEyebrow('Work'),
    pageHeader('Artifacts', 'Documents and files across issues', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading artifacts…' }) : null,
    section('Artifacts', [
      artifacts.length === 0 && hasData
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No artifacts' })
        : jsx('div', { children: artifacts.slice(0, 50).map((a, i) => jsxs('div', { className: 'border-b border-(--ui-border) py-2', children: [
            jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
              jsx('span', { className: 'font-medium truncate', children: a.title || 'Untitled' }),
              jsx('span', { className: 'ml-2 shrink-0 text-(--ui-text-tertiary)', children: a.mediaKind || a.source || '' })
            ] }),
            a.previewText ? jsx('div', { className: 'mt-0.5 text-xs text-(--ui-text-tertiary)', children: a.previewText.length > 160 ? a.previewText.slice(0, 160) + '…' : a.previewText }) : null,
            jsxs('div', { className: 'mt-0.5 text-[10px] text-(--ui-text-tertiary)', children: [
              jsx('span', { children: a.issue?.identifier || '' }),
              jsx('span', { children: a.updatedAt ? ` · ${timeAgo(a.updatedAt)}` : '' })
            ] })
          ] }, a.id || `artifact-${i}`)) })
    ])
  ] })
}

// === Page: Skills (ORG group) ===
function PageSkills() {
  const { loading, data, error, load } = usePollingData(['/skills'])
  const raw = data['/skills']
  const skills = Array.isArray(raw) ? raw : (raw?.skills || raw?.items || [])
  const hasData = raw != null

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    groupEyebrow('Org'),
    pageHeader('Skills', `${skills.length} installed skills`, loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading skills…' }) : null,
    section('Skills', [
      skills.length === 0 && hasData
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No skills installed' })
        : jsx('div', { children: skills.map((s, i) => jsxs('div', { className: 'border-b border-(--ui-border) py-2', children: [
            jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
              jsx('span', { className: 'font-medium truncate', children: s.name || s.key || 'Untitled' }),
              s.trustLevel ? jsx('span', { className: 'ml-2 shrink-0 text-(--ui-text-tertiary)', children: s.trustLevel }) : null
            ] }),
            s.description ? jsx('div', { className: 'mt-0.5 text-xs text-(--ui-text-tertiary)', children: s.description.length > 160 ? s.description.slice(0, 160) + '…' : s.description }) : null,
            Array.isArray(s.categories) && s.categories.length ? jsx('div', { className: 'mt-0.5 text-[10px] text-(--ui-text-tertiary)', children: s.categories.join(', ') }) : null
          ] }, s.id || `skill-${i}`)) })
    ])
  ] })
}

// === Page: Connectors (ORG group) ===
function PageConnectors() {
  const { loading, data, error, load } = usePollingData(['/connectors'])
  const raw = data['/connectors']
  const connectors = Array.isArray(raw) ? raw : (raw?.connectors || raw?.items || [])
  const hasData = raw != null

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    groupEyebrow('Org'),
    pageHeader('Connectors', 'Connected skill sources and apps', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading connectors…' }) : null,
    section('Connections', [
      connectors.length === 0 && hasData
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No connected sources — skill repositories and app connections will appear here' })
        : jsx('div', { children: connectors.map((c, i) => jsxs('div', { className: 'border-b border-(--ui-border) py-2', children: [
            jsxs('div', { className: 'flex items-center justify-between text-xs', children: [
              jsx('span', { className: 'font-medium truncate', children: c.name || c.url || c.repository || (c.id ? String(c.id).slice(0, 8) : 'Connection') }),
              c.status ? jsx('span', { className: 'ml-2 shrink-0 text-(--ui-text-tertiary)', children: c.status }) : null
            ] }),
            c.url ? jsx('div', { className: 'mt-0.5 text-[10px] text-(--ui-text-tertiary)', children: c.url }) : null
          ] }, c.id || `connector-${i}`)) })
    ])
  ] })
}

// === Page: Audit (ORG group; original maps Audit to /activity) ===
function PageAudit() {
  const { loading, data, error, load } = usePollingData(['/activity'])
  const raw = data['/activity']
  const items = Array.isArray(raw) ? raw : (raw?.activity || raw?.items || [])
  const hasData = raw != null

  return jsxs('div', { className: 'flex h-full flex-col gap-3 overflow-auto p-4', children: [
    groupEyebrow('Org'),
    pageHeader('Audit', 'Company activity log', loading, load),
    error ? jsx('div', { className: 'text-xs text-(--ui-danger)', children: error }) : null,
    loading && !hasData ? jsx('div', { className: 'text-sm text-(--ui-text-tertiary)', children: 'Loading audit log…' }) : null,
    section('Activity', [
      items.length === 0 && hasData
        ? jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'No activity recorded' })
        : jsx('div', { children: items.slice(0, 50).map((a, i) => jsxs('div', { className: 'grid grid-cols-[80px_1fr_auto] gap-2 border-b border-(--ui-border) py-2 text-xs', children: [
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: a.actorType || 'system' }),
            jsx('span', { children: a.action || 'unknown' }),
            jsx('span', { className: 'text-(--ui-text-tertiary)', children: timeAgo(a.createdAt || a.at) })
          ] }, a.id || `activity-${i}`)) })
    ])
  ] })
}

// === statusbar widget ===
function StatusWidget() {
  const [live, setLive] = useState(null)
  useEffect(() => {
    let active = true
    const tick = () => {
      const client = restClient()
      if (!client) { active && setLive(null); return }
      client('/health').then(() => active && setLive(true)).catch(() => active && setLive(false))
    }
    tick(); const id = setInterval(tick, 30000)
    return () => { active = false; clearInterval(id) }
  }, [])
  return jsx('button', { type: 'button', className: 'px-1.5 text-[0.6875rem] text-(--ui-text-tertiary)', onClick: () => host.navigate('/paperclip'), children: `Paperclip ${live === null ? '…' : live ? '●' : '○'}` })
}

// === register ===
export default {
  id: 'euphoria-paperclip',
  name: 'Paperclip',
  defaultEnabled: true,
  register(ctx) {
    pluginContext = ctx
    if (ctx?.settings?.base_url) paperclipBaseUrl = ctx.settings.base_url
    ctx.registerMany([
      // 16 ROUTES pages (original Paperclip order: Dashboard, Inbox, WORK[Tasks, Projects, Routines, Artifacts, Goals], ORG[Agents, Skills, Connectors, Audit]; replica extras: Overview first, Costs/Approvals/Bridge/Health last)
      { id: 'page-overview',   area: ROUTES_AREA, data: { path: '/paperclip' },            render: () => jsx(PageOverview, {}) },
      { id: 'page-dashboard',  area: ROUTES_AREA, data: { path: '/paperclip/dashboard' },  render: () => jsx(PageDashboard, {}) },
      { id: 'page-inbox',      area: ROUTES_AREA, data: { path: '/paperclip/inbox' },      render: () => jsx(PageInbox, {}) },
      { id: 'page-tasks',      area: ROUTES_AREA, data: { path: '/paperclip/tasks' },      render: () => jsx(PageTasks, {}) },
      { id: 'page-projects',   area: ROUTES_AREA, data: { path: '/paperclip/projects' },   render: () => jsx(PageProjects, {}) },
      { id: 'page-routines',   area: ROUTES_AREA, data: { path: '/paperclip/routines' },   render: () => jsx(PageRoutines, {}) },
      { id: 'page-artifacts',  area: ROUTES_AREA, data: { path: '/paperclip/artifacts' },  render: () => jsx(PageArtifacts, {}) },
      { id: 'page-goals',      area: ROUTES_AREA, data: { path: '/paperclip/goals' },      render: () => jsx(PageGoals, {}) },
      { id: 'page-agents',     area: ROUTES_AREA, data: { path: '/paperclip/agents' },     render: () => jsx(PageAgents, {}) },
      { id: 'page-skills',     area: ROUTES_AREA, data: { path: '/paperclip/skills' },     render: () => jsx(PageSkills, {}) },
      { id: 'page-connectors', area: ROUTES_AREA, data: { path: '/paperclip/connectors' }, render: () => jsx(PageConnectors, {}) },
      { id: 'page-audit',      area: ROUTES_AREA, data: { path: '/paperclip/audit' },      render: () => jsx(PageAudit, {}) },
      { id: 'page-costs',      area: ROUTES_AREA, data: { path: '/paperclip/costs' },      render: () => jsx(PageCosts, {}) },
      { id: 'page-approvals',  area: ROUTES_AREA, data: { path: '/paperclip/approvals' },  render: () => jsx(PageApprovals, {}) },
      { id: 'page-bridge',     area: ROUTES_AREA, data: { path: '/paperclip/bridge' },     render: () => jsx(PageBridge, {}) },
      { id: 'page-health',     area: ROUTES_AREA, data: { path: '/paperclip/health' },     render: () => jsx(PageHealth, {}) },
      // 18 SIDEBAR rows: original order + WORK/ORG group headers (headers navigate to their group's landing page)
      { id: 'nav-overview',   order: 10,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip',            label: 'Overview',   codicon: 'home' } },
      { id: 'nav-dashboard',  order: 20,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/dashboard',  label: 'Dashboard',  codicon: 'dashboard' } },
      { id: 'nav-inbox',      order: 30,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/inbox',      label: 'Inbox',      codicon: 'inbox' } },
      { id: 'nav-group-work', order: 40,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/tasks',      label: 'WORK',       codicon: 'folder' } },
      { id: 'nav-tasks',      order: 50,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/tasks',      label: 'Tasks',      codicon: 'checklist' } },
      { id: 'nav-projects',   order: 60,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/projects',   label: 'Projects',   codicon: 'project' } },
      { id: 'nav-routines',   order: 70,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/routines',   label: 'Routines',   codicon: 'sync' } },
      { id: 'nav-artifacts',  order: 80,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/artifacts',  label: 'Artifacts',  codicon: 'archive' } },
      { id: 'nav-goals',      order: 90,  area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/goals',      label: 'Goals',      codicon: 'target' } },
      { id: 'nav-group-org',  order: 100, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/agents',     label: 'ORG',        codicon: 'organization' } },
      { id: 'nav-agents',     order: 110, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/agents',     label: 'Agents',     codicon: 'symbol-user' } },
      { id: 'nav-skills',     order: 120, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/skills',      label: 'Skills',     codicon: 'tools' } },
      { id: 'nav-connectors', order: 130, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/connectors', label: 'Connectors', codicon: 'plug' } },
      { id: 'nav-audit',      order: 140, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/audit',      label: 'Audit',      codicon: 'history' } },
      { id: 'nav-costs',      order: 150, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/costs',      label: 'Costs',      codicon: 'currency' } },
      { id: 'nav-approvals',  order: 160, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/approvals',  label: 'Approvals',  codicon: 'shield' } },
      { id: 'nav-bridge',     order: 170, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/bridge',     label: 'Bridge',     codicon: 'link' } },
      { id: 'nav-health',     order: 180, area: SIDEBAR_NAV_AREA, data: { path: '/paperclip/health',     label: 'Health',     codicon: 'heart-pulse' } },
      // statusbar
      { id: 'status', area: STATUSBAR_AREAS.right, order: 125, render: () => jsx(StatusWidget, {}) }
    ])
  }
}
