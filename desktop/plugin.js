import { jsx, jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { SidebarShell, LoadingState } from '@hermes/plugin-sdk';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

function usePoll(path, intervalMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(path, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [path, intervalMs]);
  return { data, error };
}

function timeAgo(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return new Date(iso).toLocaleDateString();
}

// Token-safe status glyph. Draft keeps its codicon structure; colors use only
// live-attested tokens (tertiary, danger with #f87171 fallback).
function statusIcon(status) {
  const normalized = String(status || '').toLowerCase();
  if (['done', 'closed', 'complete', 'completed', 'healthy', 'idle', 'active'].includes(normalized)) {
    return jsx('span', { className: 'codicon codicon-check text-[var(--ui-text-tertiary)]' });
  }
  if (['blocked', 'error', 'failed'].includes(normalized)) {
    return jsx('span', { className: 'codicon codicon-error text-[var(--ui-danger,#f87171)]' });
  }
  return jsx('span', { className: 'codicon codicon-circle-outline text-[var(--ui-text-tertiary)]' });
}

function SidebarItem({ icon, label, active, onSelect }) {
  return jsx(
    'button',
    {
      onClick: onSelect,
      className: cx(
        'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm',
        active
          ? 'bg-[var(--ui-accent)] text-white'
          : 'text-[var(--ui-text-tertiary)] hover:bg-[var(--ui-control-hover-background)]',
      ),
      children: [
        jsx('span', { key: 'icon', className: 'codicon ' + icon }),
        jsx('span', { key: 'label', children: label }),
      ],
    },
  );
}

// Group headers are non-clickable eyebrows (reference WORK / ORG separators).
function SidebarEyebrow({ label }) {
  return jsx('div', {
    className: 'px-2 pb-1 pt-3 text-[10px] uppercase tracking-wide text-[var(--ui-text-tertiary)]',
    children: label,
  });
}

// Reference sidebar order: Dashboard, Inbox, WORK[Tasks, Projects, Routines,
// Artifacts, Goals], ORG[Agents, Skills, Connectors, Audit], Costs, Approvals,
// Bridge, Health. Dashboard is the landing page.
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'codicon-dashboard' },
  { id: 'inbox', label: 'Inbox', icon: 'codicon-inbox' },
  { type: 'group', id: 'work', label: 'WORK' },
  { id: 'tasks', label: 'Tasks', icon: 'codicon-checklist' },
  { id: 'projects', label: 'Projects', icon: 'codicon-project' },
  { id: 'routines', label: 'Routines', icon: 'codicon-sync' },
  { id: 'artifacts', label: 'Artifacts', icon: 'codicon-archive' },
  { id: 'goals', label: 'Goals', icon: 'codicon-target' },
  { type: 'group', id: 'org', label: 'ORG' },
  { id: 'agents', label: 'Agents', icon: 'codicon-account' },
  { id: 'skills', label: 'Skills', icon: 'codicon-tools' },
  { id: 'connectors', label: 'Connectors', icon: 'codicon-plug' },
  { id: 'audit', label: 'Audit', icon: 'codicon-history' },
  { id: 'costs', label: 'Costs', icon: 'codicon-credit-card' },
  { id: 'approvals', label: 'Approvals', icon: 'codicon-shield' },
  { id: 'bridge', label: 'Bridge', icon: 'codicon-link' },
  { id: 'health', label: 'Health', icon: 'codicon-pulse' },
];

// Port of live metricCard (installed plugin lines 82-88). Class syntax adapted
// from live `border-(--x)` to this file's `border-[var(--x)]`; tokens identical.
function metricCard(label, value, subtext) {
  return jsxs('div', {
    className: 'rounded border border-[var(--ui-stroke-tertiary)] p-3',
    children: [
      jsx('div', { key: 'label', className: 'text-[10px] uppercase tracking-wide text-[var(--ui-text-tertiary)]', children: label }),
      jsx('div', { key: 'value', className: 'mt-1 text-xl font-semibold', children: String(value) }),
      subtext
        ? jsx('div', { key: 'sub', className: 'text-[10px] text-[var(--ui-text-tertiary)]', children: subtext })
        : null,
    ],
  });
}

// Port of live section() (installed plugin lines 90-95). Same signature:
// section(title, childrenArray). Class syntax adapted; tokens identical.
function section(title, children) {
  return jsxs('section', {
    className: 'rounded border border-[var(--ui-stroke-tertiary)] p-3',
    children: [
      jsx('h2', { key: 'title', className: 'mb-2 text-sm font-medium', children: title }),
      ...children,
    ],
  });
}

// === CHART: Run Activity — port of live chartRunActivity (installed plugin
// lines 146-197). Logic identical (succeeded/failed/recovered/other series,
// per-series opacity, first/mid/last date labels). Class syntax adapted
// (`text-(--x)` -> `text-[var(--x)]`); tokens identical. Inline
// `backgroundColor: 'var(--ui-accent)'` verbatim.
function chartRunActivity(runActivity) {
  const series = ['succeeded', 'failed', 'recovered', 'other'];
  const seriesOpacity = { succeeded: 1.0, failed: 0.55, recovered: 0.3, other: 0.35 };

  if (!runActivity.length) {
    return section('Run Activity (14d)', [jsx('div', { key: 'empty', className: 'text-sm text-[var(--ui-text-tertiary)]', children: 'No data yet' })]);
  }

  const maxCount = Math.max(...runActivity.map(d =>
    Math.max(d.succeeded || 0, d.failed || 0, d.recovered || 0, d.other || 0)
  ), 1);

  const n = runActivity.length;
  const isLabeled = (i) => i === 0 || i === n - 1 || i === Math.floor(n / 2);

  return section('Run Activity (14d)', [
    jsxs('div', {
      key: 'bars',
      className: 'flex items-end justify-between gap-px h-32',
      children: runActivity.map((day, i) => jsxs('div', {
        key: day.date || i,
        className: 'flex flex-col items-center flex-1 min-w-5',
        children: [
          jsxs('div', {
            key: 'group',
            className: 'flex items-end justify-center gap-px w-full h-24',
            children: series.map(s => {
              const val = day[s] || 0;
              const h = (val / maxCount) * 100;
              return jsx('div', {
                key: s,
                className: 'flex-1 min-w-px',
                children: jsx('div', {
                  className: 'w-full rounded-t-[1px]',
                  style: {
                    backgroundColor: 'var(--ui-accent)',
                    opacity: s === 'other' ? 0.35 : seriesOpacity[s],
                    height: `${h}%`,
                    minHeight: val > 0 ? '2px' : 0,
                  },
                  title: `${s}: ${val}`,
                }),
              });
            }),
          }),
          jsx('div', {
            key: 'label',
            className: 'mt-1 text-[0.5625rem] text-[var(--ui-text-tertiary)] text-center truncate',
            children: isLabeled(i) ? (day.date || '—') : '',
          }),
        ],
      })),
    }),
  ]);
}

// === CHART: Tasks by Status — port of live chartTasksByStatus (installed
// plugin lines 200-232). Logic identical. Class syntax adapted; tokens
// identical. Inline `backgroundColor: 'var(--ui-accent)'` verbatim.
function chartTasksByStatus(counts) {
  const entries = Object.entries(counts || {});

  if (!entries.length) {
    return section('Tasks by Status', [jsx('div', { key: 'empty', className: 'text-sm text-[var(--ui-text-tertiary)]', children: 'No data yet' })]);
  }

  const maxCount = Math.max(...entries.map(([, v]) => v || 0), 1);

  return section('Tasks by Status', entries.map(([status, count]) => {
    const pct = ((count || 0) / maxCount) * 100;
    return jsxs('div', {
      key: status,
      className: 'flex items-center gap-2 text-sm',
      children: [
        jsx('span', { key: 'label', className: 'w-24 text-[var(--ui-text-tertiary)] truncate', children: status }),
        jsxs('div', {
          key: 'bar',
          className: 'flex-1 relative h-5 bg-[var(--ui-stroke-tertiary)] rounded-sm overflow-hidden',
          children: [
            jsx('div', {
              key: 'fill',
              className: 'h-full rounded-sm',
              style: { width: `${pct}%`, backgroundColor: 'var(--ui-accent)', opacity: 0.6 },
            }),
            jsx('span', {
              key: 'count',
              className: 'absolute inset-0 flex items-center text-[0.5625rem] px-1 overflow-hidden',
              children: String(count || 0),
            }),
          ],
        }),
      ],
    });
  }));
}

// === CHART: Success Rate — port of live chartSuccessRate (installed plugin
// lines 235-286). Logic identical (overall % headline + 14-day mini bar row +
// first/mid/last date axis). Class syntax adapted; tokens identical.
function chartSuccessRate(runActivity) {
  if (!runActivity.length) {
    return section('Success Rate', [jsx('div', { key: 'empty', className: 'text-sm text-[var(--ui-text-tertiary)]', children: 'No data yet' })]);
  }

  const totalAll = runActivity.reduce((s, d) => s + (d.total || 0), 0);
  const successAll = runActivity.reduce((s, d) => s + (d.succeeded || 0) + (d.recovered || 0), 0);
  const overallPct = totalAll > 0 ? (successAll / totalAll) * 100 : 0;

  const dailyPct = runActivity.map(d => {
    const t = d.total || 0;
    return t > 0 ? ((d.succeeded || 0) + (d.recovered || 0)) / t * 100 : 0;
  });

  const maxDaily = Math.max(...dailyPct, 1);
  const n = runActivity.length;
  const firstDate = runActivity[0]?.date || '—';
  const midDate = runActivity[Math.floor(n / 2)]?.date || '—';
  const lastDate = runActivity[n - 1]?.date || '—';

  return section('Success Rate', [
    jsxs('span', {
      key: 'headline',
      className: 'text-2xl font-semibold text-[var(--ui-accent)]',
      children: [
        overallPct.toFixed(1),
        jsx('span', { key: 'pct', className: 'text-sm font-normal text-[var(--ui-text-tertiary)]', children: '%' }),
      ],
    }),
    jsx('div', {
      key: 'bars',
      className: 'flex items-end gap-px h-12 mt-2',
      children: dailyPct.map((pct, i) => {
        const h = pct > 0 ? (pct / maxDaily) * 100 : 0;
        return jsx('div', {
          key: i,
          className: 'flex-1 min-w-px flex items-end',
          children: jsx('div', {
            className: 'w-full rounded-sm',
            style: { height: `${h}%`, backgroundColor: 'var(--ui-accent)', opacity: pct > 0 ? 0.55 : 0.1 },
          }),
        });
      }),
    }),
    jsxs('div', {
      key: 'axis',
      className: 'mt-1 flex justify-between text-[0.5625rem] text-[var(--ui-text-tertiary)]',
      children: [
        jsx('span', { key: 'first', children: firstDate }),
        jsx('span', { key: 'mid', children: midDate }),
        jsx('span', { key: 'last', children: lastDate }),
      ],
    }),
  ]);
}

function agentFinishedAt(agent, liveRuns) {
  const runs = (liveRuns || []).filter(
    (r) => r && (r.agentId === agent.id || r.agentName === agent.name),
  );
  const stamps = runs
    .map((r) => r.finishedAt || r.completedAt || r.updatedAt)
    .filter(Boolean)
    .sort();
  if (stamps.length) return stamps[stamps.length - 1];
  return agent.lastHeartbeatAt || agent.updatedAt || null;
}

function AgentsRow({ agents, liveRuns }) {
  const list = (agents || []).slice(0, 4);
  if (!list.length) {
    return section('Agents', [jsx('p', { key: 'empty', className: 'text-sm text-[var(--ui-text-tertiary)]', children: 'No agents reporting yet.' })]);
  }
  return jsx(
    'section',
    {
      'aria-label': 'Agents',
      className: 'grid grid-cols-2 gap-3 xl:grid-cols-4',
      children: list.map((a) => {
        const name = a.name || a.id || 'Agent';
        const finished = agentFinishedAt(a, liveRuns);
        return jsxs('div', {
          key: a.id || name,
          className: 'flex items-center gap-3 rounded border border-[var(--ui-stroke-tertiary)] p-3',
          children: [
            jsx('span', {
              key: 'avatar',
              className: 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-control-hover-background)] text-sm font-semibold',
              children: String(name).slice(0, 1).toUpperCase(),
            }),
            jsxs('div', {
              key: 'meta',
              className: 'min-w-0',
              children: [
                jsx('div', { key: 'name', className: 'truncate text-sm font-medium', children: name }),
                jsxs('div', {
                  key: 'status',
                  className: 'mt-0.5 flex items-center gap-1 text-xs text-[var(--ui-text-tertiary)]',
                  children: [
                    jsx('span', { key: 'icon', children: statusIcon(a.status) }),
                    jsx('span', { key: 'text', children: a.status || 'unknown' }),
                    jsx('span', { key: 'finished', children: '· Finished ' + timeAgo(finished) }),
                  ],
                }),
              ],
            }),
          ],
        });
      }),
    },
  );
}

// Recent Activity shows user-facing actor/action/time rows — never tool/ok
// system-log rows. Field fallbacks cover both /dashboard bridge_activity and
// /activity shapes; the tool/ok shape is deliberately not rendered.
function RecentActivityList({ items }) {
  const list = (items || []).slice(0, 8);
  if (!list.length) {
    return section('Recent Activity', [jsx('p', { key: 'empty', className: 'text-sm text-[var(--ui-text-tertiary)]', children: 'No activity yet.' })]);
  }
  return section('Recent Activity', [
    jsx(
      'ul',
      {
        key: 'list',
        className: 'flex flex-col gap-2',
        children: list.map((b, i) => {
          const actor = b.actor || b.actorName || b.agentName || b.actorType || '—';
          const action = b.action || b.description || b.title || 'activity';
          return jsxs('li', {
            key: b.id || b.createdAt || b.at || i,
            className: 'flex items-center gap-2 text-xs',
            children: [
              jsx('span', { key: 'actor', className: 'shrink-0 font-medium', children: actor }),
              jsx('span', { key: 'action', className: 'truncate text-[var(--ui-text-tertiary)]', children: action }),
              jsx('span', { key: 'time', className: 'ml-auto shrink-0 text-[var(--ui-text-tertiary)]', children: timeAgo(b.createdAt || b.at || b.time) }),
            ],
          });
        }),
      },
    ),
  ]);
}

// Recent Tasks shows identifier/title/status/time columns.
function RecentTasksList({ issues }) {
  const list = (issues || []).slice(0, 8);
  if (!list.length) {
    return section('Recent Tasks', [jsx('p', { key: 'empty', className: 'text-sm text-[var(--ui-text-tertiary)]', children: 'No tasks yet.' })]);
  }
  return section('Recent Tasks', [
    jsx(
      'ul',
      {
        key: 'list',
        className: 'flex flex-col gap-2',
        children: list.map((t) =>
          jsxs('li', {
            key: t.id || t.identifier,
            className: 'flex items-center gap-2 text-xs',
            children: [
              jsx('span', { key: 'icon', children: statusIcon(t.status) }),
              t.identifier
                ? jsx('span', { key: 'id', className: 'shrink-0 text-[var(--ui-text-tertiary)]', children: t.identifier })
                : null,
              jsx('span', { key: 'title', className: 'truncate', children: t.title || t.id }),
              jsx('span', { key: 'status', className: 'shrink-0 text-[var(--ui-text-tertiary)]', children: t.status || '—' }),
              jsx('span', { key: 'time', className: 'ml-auto shrink-0 text-[var(--ui-text-tertiary)]', children: timeAgo(t.updatedAt) }),
            ],
          }),
        ),
      },
    ),
  ]);
}

function PageDashboard({ dash, ov, onRefresh, refreshing }) {
  const d = (dash && dash.dashboard) || {};
  const tasks = d.tasks || {};
  const costs = d.costs || {};
  const runActivity = d.runActivity || [];
  const agents = (ov && ov.agents) || [];
  const liveRuns = (ov && ov.live_runs) || [];
  const issueCounts = (ov && ov.issue_counts) || {};
  const recentIssues = (ov && ov.recent_issues) || [];
  const bridgeActivity = (dash && dash.bridge_activity) || [];

  // KPI logic follows live PageOverview (installed plugin lines 321-345):
  // prefer /dashboard, fall back to /overview. Card labels follow the binding
  // packet (reference row), including 'Tasks In Progress'.
  const dashAgents = d.agents;
  const agentsEnabled = (dashAgents?.active ?? agents.length) ?? 0;
  const agentRunning = dashAgents?.running ?? 0;
  const agentPaused = dashAgents?.paused ?? 0;
  const agentError = dashAgents?.error ?? 0;

  const dashTaskTotal = (tasks.open ?? 0) + (tasks.inProgress ?? 0) + (tasks.blocked ?? 0) + (tasks.done ?? 0);
  const tasksValue = (dashTaskTotal || (ov && ov.issue_total)) ?? 0;
  const tasksOpen = tasks.open ?? 0;
  const tasksBlocked = tasks.blocked ?? issueCounts.blocked ?? 0;

  const monthBudgetCents = costs.monthBudgetCents ?? 0;
  const monthSpend = costs.monthSpendCents != null ? '$' + (costs.monthSpendCents / 100).toFixed(2) : '$0.00';
  const monthSpendSubtext = monthBudgetCents > 0
    ? (costs.monthUtilizationPercent ?? 0) + '% of budget'
    : 'Unlimited budget';

  const pendingApprovals = d.pendingApprovals ?? 0;

  return jsxs('div', {
    className: 'flex flex-col gap-3 p-4',
    children: [
      jsxs('div', {
        key: 'header',
        className: 'flex items-center justify-between',
        children: [
          jsx('h1', { key: 'title', className: 'text-lg font-semibold', children: 'Dashboard' }),
          jsx('button', {
            key: 'refresh',
            type: 'button',
            onClick: onRefresh,
            className: 'rounded border border-[var(--ui-stroke-tertiary)] px-3 py-1.5 text-xs text-[var(--ui-text-tertiary)]',
            children: refreshing ? 'Refreshing…' : 'Refresh',
          }),
        ],
      }),
      jsx('div', {
        key: 'kpis',
        className: 'grid grid-cols-4 gap-3',
        children: [
          jsx('span', { key: 'agents', children: metricCard('Agents Enabled', agentsEnabled, `${agentRunning} running, ${agentPaused} paused, ${agentError} errors`) }),
          jsx('span', { key: 'tasks', children: metricCard('Tasks In Progress', tasksValue, `${tasksOpen} open, ${tasksBlocked} blocked`) }),
          jsx('span', { key: 'spend', children: metricCard('Month Spend', monthSpend, monthSpendSubtext) }),
          jsx('span', { key: 'approvals', children: metricCard('Pending Approvals', pendingApprovals, 'Awaiting board review') }),
        ],
      }),
      jsx('div', {
        key: 'agents-row',
        children: jsx(AgentsRow, { agents, liveRuns }),
      }),
      jsxs('div', {
        key: 'charts',
        className: 'grid grid-cols-2 gap-3',
        children: [
          jsx('span', { key: 'run-activity', children: chartRunActivity(runActivity) }),
          jsx('span', { key: 'tasks-by-status', children: chartTasksByStatus(issueCounts) }),
        ],
      }),
      jsx('div', { key: 'success-rate', children: chartSuccessRate(runActivity) }),
      jsxs('div', {
        key: 'recent',
        className: 'grid grid-cols-2 gap-3',
        children: [
          jsx(RecentActivityList, { key: 'activity', items: bridgeActivity }),
          jsx(RecentTasksList, { key: 'tasks', issues: recentIssues }),
        ],
      }),
    ],
  });
}

function PageStub({ title, detail }) {
  return jsxs('div', {
    className: 'flex flex-col gap-2 p-4',
    children: [
      jsx('h1', { key: 'title', className: 'text-lg font-semibold', children: title }),
      jsx('p', {
        key: 'detail',
        className: 'text-sm text-[var(--ui-text-tertiary)]',
        children: detail || 'Live view lands here once its REST source is mounted.',
      }),
    ],
  });
}

const STUB_COPY = {
  inbox: 'Triage queue: approvals and mentions.',
  tasks: 'Task board by status.',
  projects: 'Project portfolio with progress.',
  routines: 'Recurring routines.',
  artifacts: 'Artifact library.',
  goals: 'Goals with linked tasks.',
  agents: 'Agent roster with status and budgets.',
  skills: 'Skill catalog.',
  connectors: 'Connected integrations.',
  audit: 'Audit trail.',
  costs: 'Spend vs budget.',
  approvals: 'Pending approvals.',
  bridge: 'Bridge integrations.',
  health: 'Service health.',
};

export function PaperclipShell() {
  const [route, setRoute] = useState('dashboard');
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const dash = usePoll('/dashboard', 15000);
  const ov = usePoll('/overview', 15000);

  function handleRefresh() {
    setRefreshing(true);
    setTick((t) => t + 1);
    setTimeout(() => setRefreshing(false), 500);
  }

  const sidebar = jsx(
    'nav',
    {
      className: 'flex flex-col gap-0.5 p-2',
      children: NAV.map((item) =>
        item.type === 'group'
          ? jsx(SidebarEyebrow, { key: item.id, label: item.label })
          : jsx(SidebarItem, {
              key: item.id,
              icon: item.icon,
              label: item.label,
              active: route === item.id,
              onSelect: () => setRoute(item.id),
            }),
      ),
    },
  );

  let page = null;
  if (route === 'dashboard') {
    if (!dash.data && !ov.data && !dash.error && !ov.error) {
      page = jsx(LoadingState, { message: 'Loading dashboard…' });
    } else if (dash.error && ov.error) {
      page = jsx(PageStub, { title: 'Dashboard unavailable', detail: 'Dashboard: ' + dash.error + ' · Overview: ' + ov.error });
    } else {
      page = jsx('div', { key: tick, children: jsx(PageDashboard, { dash: dash.data, ov: ov.data, onRefresh: handleRefresh, refreshing }) });
    }
  } else {
    const nav = NAV.find((item) => item.id === route);
    page = jsx(PageStub, { title: nav ? nav.label : route, detail: STUB_COPY[route] });
  }

  return jsx(SidebarShell, { sidebar, children: page });
}
