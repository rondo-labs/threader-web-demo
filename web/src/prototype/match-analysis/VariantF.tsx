// PROTOTYPE variant F (picked in round 2): A's report where the figures table is the filter. Picking a row
// draws only that row on the chart; clicking its number also plays it, so the chart always shows what plays.
// F: the player slides in from the right (covers the table, i.e. the filter).
// G (picked in round 3): the player opens inside the section, above the table. G also carries the overview chapter.
import { useState } from 'react'
import { playerLabel, playerName } from './clips'
import { Legend, type VariantProps } from './common'
import { FULL, inScope, scopedSpans, summaryMetric, type Scope } from './filters'
import { GoalChart, LineupChart, TimelineChart } from './overviewCharts'
import { SectionChart } from './Pitch'
import { FunnelChart } from './transitionCharts'
import { InlinePlayer, LeadersFrom, MetricsTable, Report, ScopeBar, scopeLabel, type Ctx } from './round2'
import type { GoalsSection, LineupSection, Metric, OverviewSection, Section, TickMark, TimelineSection } from './types'

export function VariantF(props: VariantProps) {
  return <Report props={props} renderSection={(s, ctx) => <SectionF section={s} ctx={ctx} inline={false} />} />
}

export function VariantG(props: VariantProps) {
  return (
    <Report
      props={props}
      playback="inline"
      renderSection={(s, ctx) => <SectionF section={s} ctx={ctx} inline />}
      renderOverview={(s, ctx) => <OverviewSectionG section={s} ctx={ctx} />}
    />
  )
}

function OverviewSectionG({ section, ctx }: { section: OverviewSection; ctx: Ctx }) {
  if ('kind' in section) {
    if (section.kind === 'timeline') return <TimelineG section={section} ctx={ctx} />
    if (section.kind === 'lineup') return <LineupG section={section} ctx={ctx} />
    return <GoalsG section={section} ctx={ctx} />
  }
  return <SectionF section={section} ctx={ctx} inline />
}

const firstPlayable = (metrics: Metric[]) => metrics.find((m) => !m.noPlay && (m.team.eids.length || m.opp?.eids.length))?.key ?? metrics[0].key

function SectionF({ section: s, ctx, inline }: { section: Section; ctx: Ctx; inline: boolean }) {
  const [key, setKey] = useState(() => firstPlayable(s.metrics))
  const [scope, setScope] = useState<Scope>(FULL)
  const metric = s.metrics.find((m) => m.key === key) ?? s.metrics[0]
  const teamIds = inScope(ctx.data, metric.team.eids, scope, ctx.team.id)
  const eids = s.bothTeams ? [...teamIds, ...inScope(ctx.data, metric.opp?.eids ?? [], scope, ctx.team.id)] : teamIds
  const when = scopeLabel(scope)
  const title = `${s.bothTeams ? '两队' : ctx.team.nameZh} · ${metric.label}${when ? ` · ${when}` : ''}`
  // Funnel rows play whole moves (from the regain or the loss to what it led to).
  const spans = metric.team.spans ? scopedSpans(ctx.data, metric.team, scope, ctx.team.id) : null
  const playAll = () => (spans ? ctx.openSpans(title, spans) : ctx.open(title, eids))
  const badgeMetric = s.summary?.badge ? s.metrics.find((m) => m.key === s.summary!.badge) : undefined
  const badge = badgeMetric ? inScope(ctx.data, badgeMetric.team.eids, scope, ctx.team.id) : undefined
  // Lines tied to a metric (the average height of defensive actions) move with the filter.
  const lines = s.lines?.map((l) => {
    const m = l.metric ? s.metrics.find((x) => x.key === l.metric) : undefined
    if (!m) return l
    const ids = inScope(ctx.data, m.team.eids, scope, ctx.team.id)
    return ids.length ? { ...l, x: ids.reduce((sum, id) => sum + ctx.data.events[id].x, 0) / ids.length } : l
  })
  return (
    <div className="va-grid">
      <div className="va-chart-col">
        <div className="filter-line">
          <span className="t-heading">{`图上：${metric.label}`}</span>
          <span className="t-caption">{`${eids.length} 次${when ? ` · ${when}` : ''}`}</span>
          <button className="btn" disabled={!eids.length} onClick={playAll}>{`播放这 ${eids.length} 次`}</button>
        </div>
        {s.funnel ? (
          <FunnelChart
            data={ctx.data}
            section={s}
            teamId={ctx.team.id}
            scope={scope}
            selected={metric.key}
            onPick={(m, rowSpans) => {
              setKey(m.key)
              if (rowSpans.length) ctx.openSpans(`${ctx.team.nameZh} · ${m.label}${when ? ` · ${when}` : ''}`, rowSpans)
            }}
          />
        ) : (
        <SectionChart
          data={ctx.data}
          section={s}
          teamName={ctx.team.nameZh}
          focus={ctx.focus}
          open={ctx.open}
          only={new Set(eids)}
          aggregate={summaryMetric(s, metric.key)}
          onDrill={(band) => setKey(s.summary?.drill[band] ?? `lane_${band}`)}
          laneTags={false}
          playTitle={title}
          lines={lines}
          badgeEids={badge}
        />
        )}
        {s.funnel ? <p className="t-caption">{`${s.readings[0]} 点一条，播放这些回合：从抢回或丢球的那一下，到它打成的那一步。`}</p> : <Legend section={s} />}
      </div>
      <div className="va-data">
        {inline && <InlinePlayer ctx={ctx} />}
        <div className="table-tools">
          <span className="t-caption">点一行，左边的图只画这一行</span>
          <ScopeBar scope={scope} setScope={setScope} ctx={ctx} />
        </div>
        <MetricsTable section={s} ctx={ctx} scope={scope} selected={metric.key} onSelect={setKey} />
        {!s.bothTeams && !s.funnel && <LeadersFrom ctx={ctx} eids={teamIds} label={`${metric.label}：谁最多`} />}
      </div>
    </div>
  )
}

const TICK_TYPE: Record<string, TickMark['type']> = { goals: 'goal', shots: 'shot', box: 'box', cards: 'card', subs: 'sub' }

function TimelineG({ section, ctx }: { section: TimelineSection; ctx: Ctx }) {
  const [key, setKey] = useState('goals')
  const metric = section.metrics.find((m) => m.key === key) ?? section.metrics[0]
  const eids = [...metric.team.eids, ...(metric.opp?.eids ?? [])]
  const title = `两队 · ${metric.label}`
  return (
    <div className="va-grid">
      <div className="va-chart-col">
        <div className="filter-line">
          <span className="t-heading">{`图上：${metric.label}`}</span>
          <span className="t-caption">{`${eids.length} 次`}</span>
          <button className="btn" disabled={!eids.length} onClick={() => ctx.open(title, eids)}>{`播放这 ${eids.length} 次`}</button>
        </div>
        <TimelineChart data={ctx.data} section={section} type={TICK_TYPE[metric.key] ?? 'goal'} visible={new Set(eids)} focus={ctx.focus} open={ctx.open} title={title} />
        <div className="legend t-caption">
          <span className="legend-item"><span className="sw sw-us" />{`${section.legendText.us}，前场传球占比（上）`}</span>
          <span className="legend-item"><span className="sw sw-them" />{`${section.legendText.them}（下）`}</span>
        </div>
        <p className="t-caption">{section.readings[0]}</p>
      </div>
      <div className="va-data">
        <InlinePlayer ctx={ctx} />
        <MetricsTable section={section} ctx={ctx} scope={FULL} selected={metric.key} onSelect={setKey} />
      </div>
    </div>
  )
}

function LineupG({ section, ctx }: { section: LineupSection; ctx: Ctx }) {
  const [selected, setSelected] = useState<string | null>(null)
  const row = section.rows.find((r) => r.playerId === selected)
  return (
    <div className="va-grid va-grid-lineup">
      <div className="va-chart-col">
        <div className="filter-line">
          <span className="t-heading">{`开场 ${section.shape}`}</span>
          <span className="t-caption">{section.changes.length ? section.changes.map((c) => `${c.clock} 变 ${c.shape}`).join('，') : '全场没有变阵'}</span>
          {selected && (
            <button className="btn-quiet" onClick={() => setSelected(null)}>
              看全队
            </button>
          )}
        </div>
        <LineupChart
          data={ctx.data}
          section={section}
          selected={selected}
          touchEids={row ? row.touches.eids : []}
          focus={ctx.focus}
          onSelect={(pid) => setSelected(pid === selected ? null : pid)}
        />
        <div className="legend t-caption">
          <span className="legend-item"><span className="sw sw-slot" />名单上的阵型位置</span>
          <span className="legend-item"><span className="sw sw-us" />实际平均位置（按触球）</span>
          <span className="legend-item"><span className="sw sw-sub" />替补上场</span>
        </div>
      </div>
      <div className="va-data">
        <InlinePlayer ctx={ctx} />
        <table className="va-metrics is-selectable lineup-table">
          <thead>
            <tr>
              <th className="t-label">球员</th>
              <th className="t-label">位置</th>
              <th className="t-label">出场</th>
              <th className="t-label">触球</th>
              <th className="t-label">关键动作</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r) => (
              <tr key={r.playerId} className={selected === r.playerId ? 'is-selected' : undefined} onClick={() => setSelected(r.playerId)}>
                <th className="t-body">{playerLabel(ctx.data, r.playerId)}</th>
                <td className="t-caption">{r.starter ? r.positionZh : `替补 ${Math.round(r.on ?? 0)}′`}</td>
                <td className="t-numeric">{`${r.minutes}′`}</td>
                <td className="t-numeric">{r.touches.value}</td>
                <td>
                  <button
                    className="val val-sm"
                    disabled={!r.keyActions.eids.length}
                    title="射门、关键传球、过人、抢断、拦截"
                    onClick={() => ctx.open(`${playerLabel(ctx.data, r.playerId)} · 关键动作`, r.keyActions.eids)}
                  >
                    {r.keyActions.value}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-caption">点一名球员，图上画出他的每一次触球；点「关键动作」播放他的射门、关键传球、过人、抢断和拦截。</p>
      </div>
    </div>
  )
}

function GoalsG({ section, ctx }: { section: GoalsSection; ctx: Ctx }) {
  const [index, setIndex] = useState(0)
  // While this section plays goal moves, the chart follows the goal on screen, not the row picked earlier.
  const pl = ctx.playlist?.owner === ctx.sectionKey ? ctx.playlist : null
  const playingIndex = pl ? section.items.findIndex((i) => pl.clips[pl.index]?.eids.includes(i.goalEid)) : -1
  const shown = playingIndex >= 0 ? playingIndex : index
  const item = section.items[shown]
  if (!item) return <p className="t-lead">这场没有进球。</p>
  const titleOf = (i: typeof item) => `${i.clock} ${playerName(ctx.data, i.scorerId)} · ${i.source}`
  const span = (i: typeof item) => (i.span ? [{ start: i.span.start, end: i.span.end, eids: i.eids }] : [])
  return (
    <div className="va-grid">
      <div className="va-chart-col">
        <div className="filter-line">
          <span className="t-heading">{titleOf(item)}</span>
          <span className="t-caption">{`从${item.startZone}开始，${item.passes} 脚传球，${item.seconds} 秒`}</span>
          <button className="btn" disabled={!item.span} onClick={() => ctx.openSpans(titleOf(item), span(item))}>
            播放这个回合
          </button>
        </div>
        <GoalChart data={ctx.data} item={item} focus={ctx.focus} open={ctx.open} title={titleOf(item)} />
        <p className="t-caption">箭头上的数字是回合里的第几脚；红色是进球那一脚。</p>
      </div>
      <div className="va-data">
        <InlinePlayer ctx={ctx} />
        <div className="table-tools">
          <span className="t-caption">点一行看这个进球的回合</span>
          <button
            className="btn"
            onClick={() => ctx.openSpans('本场所有进球的回合', section.items.flatMap((i) => span(i)))}
          >
            连播所有进球
          </button>
        </div>
        <table className="va-metrics is-selectable goals-table">
          <thead>
            <tr>
              <th className="t-label">时间</th>
              <th className="t-label">进球</th>
              <th className="t-label">来源</th>
              <th className="t-label">传球</th>
              <th className="t-label">用时</th>
            </tr>
          </thead>
          <tbody>
            {section.items.map((i, n) => (
              <tr key={i.goalEid} className={n === shown ? 'is-selected' : undefined} onClick={() => setIndex(n)}>
                <td>
                  <button className="val val-sm" disabled={!i.span} onClick={() => ctx.openSpans(titleOf(i), span(i))}>
                    {i.clock}
                  </button>
                </td>
                <th className="t-body">
                  <span className={`side-dot ${i.side}`} />
                  {playerName(ctx.data, i.scorerId)}
                  <span className="t-caption">{` ${ctx.data.teams[i.teamId].nameZh}`}</span>
                </th>
                <td className="t-caption">{i.source}</td>
                <td className="t-numeric">{i.passes}</td>
                <td className="t-numeric">{`${i.seconds}″`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-caption">{section.readings[0]}</p>
      </div>
    </div>
  )
}

