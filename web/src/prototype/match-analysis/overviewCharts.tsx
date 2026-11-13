// PROTOTYPE: the overview chapter's three charts that are not ordinary pitch sections.
import { eventLine, playerLabel, playerName } from './clips'
import { Markings, UPRIGHT, X, Y, markEids, type Focus, type Open } from './Pitch'
import type { ArrowMark, DotMark, GoalItem, LineupSection, MatchData, TickMark, TimelineSection } from './types'

type MarkState = 'idle' | 'in' | 'out' | 'current'
const stateOf = (ids: string[], focus: Focus | null): MarkState => {
  if (!focus) return 'idle'
  if (ids.some((id) => focus.current.has(id))) return 'current'
  return ids.some((id) => focus.all.has(id)) ? 'in' : 'out'
}

/* ---------------------------------------------------------------- match timeline */

const W = 1000
const H = 250
const PAD = { l: 34, r: 8, t: 30, b: 28 }

export function TimelineChart({ data, section, type, visible, focus, open, title }: {
  data: MatchData; section: TimelineSection; type: TickMark['type']; visible: Set<string>; focus: Focus | null; open: Open; title: string
}) {
  const x = (m: number) => PAD.l + (m / section.end) * (W - PAD.l - PAD.r)
  const mid = PAD.t + (H - PAD.t - PAD.b) / 2
  const half = (H - PAD.t - PAD.b) / 2 - 4
  // The first half's 45′ would sit on top of the second half's start, so the half-time line marks it instead.
  const ticks = [0, 15, 30].map((m) => ({ at: m, label: `${m}′` })).concat([0, 15, 30, 45].map((m) => ({ at: section.h1 + m, label: `${45 + m}′` })))
  // A goal is also a shot: draw only the kind the table row asks for, once.
  const marks = section.marks.filter((m) => m.type === type && visible.has(m.eid))
  const peers = marks.map((m) => m.eid)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tl" role="img" aria-label={section.readings[0]}>
      <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} className="tl-bg" />
      {section.bins.map((b) => {
        const total = b.team + b.opp
        if (!total) return null
        const x0 = x(b.start) + 1
        const w = Math.max(1, x(b.end) - x(b.start) - 2)
        const ht = (b.team / total) * half
        const ho = (b.opp / total) * half
        return (
          <g key={b.start}>
            <title>{`${Math.round(b.start)}–${Math.round(b.end)} 分钟：前场传球 ${b.team} 比 ${b.opp}`}</title>
            <rect x={x0} y={mid - ht} width={w} height={ht} className="tl-bar us" />
            <rect x={x0} y={mid} width={w} height={ho} className="tl-bar them" />
          </g>
        )
      })}
      <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} className="tl-axis" />
      <line x1={x(section.h1)} x2={x(section.h1)} y1={PAD.t - 6} y2={H - PAD.b} className="tl-half" />
      <text x={x(section.h1) + 4} y={PAD.t - 10} className="tl-note">下半场</text>
      {ticks.map((t) => (
        <text key={t.at} x={x(t.at)} y={H - 8} className="tl-tick">
          {t.label}
        </text>
      ))}
      {marks.map((m: TickMark) => {
        const y = m.side === 'team' ? PAD.t - 12 : H - PAD.b + 2
        const cls = `tl-mark ${m.type}${m.card ? ` card-${m.card}` : ''}${m.side === 'opp' ? ' opp' : ''} st-${stateOf([m.eid], focus)}`
        return (
          <g key={m.eid} className={cls} onClick={() => open(title, peers, m.eid)}>
            <title>{eventLine(data, data.events[m.eid])}</title>
            <rect className="hit" x={x(m.tx) - 7} y={y - 9} width={14} height={18} />
            {m.type === 'card' ? (
              <rect className="dot" x={x(m.tx) - 3} y={y - 5} width={6} height={9} rx={1} />
            ) : (
              <circle className="dot" cx={x(m.tx)} cy={y} r={m.type === 'goal' ? 6 : 4} />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ---------------------------------------------------------------- lineup: declared shape vs actual positions */

// Upright full pitch drawn without a transform so the numbers stay readable: attack upwards, our left on the left.
const U = (y: number) => (100 - y) * 0.68
const V = (x: number) => 105 - x * 1.05

export function LineupChart({ data, section, selected, touchEids, focus, onSelect }: {
  data: MatchData; section: LineupSection; selected: string | null; touchEids: string[]; focus: Focus | null; onSelect: (playerId: string) => void
}) {
  const starters = section.rows.filter((r) => r.starter)
  const subs = section.rows.filter((r) => !r.starter)
  const dim = (pid: string) => (selected && pid !== selected ? ' is-dim' : '')
  return (
    <svg viewBox="-2.5 -2.5 73 110" className="pz pz-upright" role="img" aria-label={section.readings[0]}>
      <g transform={UPRIGHT}>
        <Markings />
      </g>
      {touchEids.map((id) => {
        const e = data.events[id]
        if (!e) return null
        return (
          <circle key={id} className={`touch st-${stateOf([id], focus)}`} cx={U(e.y)} cy={V(e.x)} r={0.7}>
            <title>{eventLine(data, e)}</title>
          </circle>
        )
      })}
      {starters.map((r) =>
        r.slotX != null && r.avgX != null ? (
          <line key={`l-${r.playerId}`} className={`lu-link${dim(r.playerId)}`} x1={U(r.slotY!)} y1={V(r.slotX)} x2={U(r.avgY!)} y2={V(r.avgX)} />
        ) : null,
      )}
      {starters.map((r) =>
        r.slotX != null ? (
          <g key={`s-${r.playerId}`} className={`lu-slot${dim(r.playerId)}`} onClick={() => onSelect(r.playerId)}>
            <title>{`${r.positionZh}：${playerLabel(data, r.playerId)}`}</title>
            <circle cx={U(r.slotY!)} cy={V(r.slotX)} r={2.6} />
            <text x={U(r.slotY!)} y={V(r.slotX) + 0.7}>{r.position}</text>
          </g>
        ) : null,
      )}
      {[...starters, ...subs].map((r) =>
        r.avgX != null ? (
          <g
            key={`a-${r.playerId}`}
            className={`lu-avg${r.starter ? '' : ' is-sub'}${selected === r.playerId ? ' is-selected' : ''}${dim(r.playerId)}`}
            onClick={() => onSelect(r.playerId)}
          >
            <title>{`${playerLabel(data, r.playerId)}：实际平均位置（${r.touches.value} 次触球）`}</title>
            <circle cx={U(r.avgY!)} cy={V(r.avgX)} r={2} />
            <text className="num" x={U(r.avgY!)} y={V(r.avgX) + 0.6}>
              {data.players[r.playerId]?.number ?? ''}
            </text>
            <text className="nm" x={U(r.avgY!)} y={V(r.avgX) + 3.6}>
              {playerName(data, r.playerId)}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  )
}

/* ---------------------------------------------------------------- one goal's move */

export function GoalChart({ data, item, focus, open, title }: { data: MatchData; item: GoalItem; focus: Focus | null; open: Open; title: string }) {
  const steps = item.marks
  return (
    <svg viewBox="-2.5 -2.5 110 73" className="pz pz-full" role="img" aria-label={`${item.clock} ${item.source}`}>
      <Markings />
      {steps.map((m, i) => {
        const ids = markEids(m)
        const st = stateOf(ids, focus)
        const side = item.side === 'opp' ? ' opp' : ''
        const label = <title>{`${i + 1}. ${eventLine(data, data.events[ids[0]])}`}</title>
        if (m.kind === 'arrow') {
          const a = m as ArrowMark
          return (
            <g key={a.eid} className={`mk mk-arrow ok${side} st-${st}`} onClick={() => open(title, item.eids, a.eid)}>
              {label}
              <line className="hit" x1={X(a.x)} y1={Y(a.y)} x2={X(a.ex)} y2={Y(a.ey)} />
              <line className="ln" x1={X(a.x)} y1={Y(a.y)} x2={X(a.ex)} y2={Y(a.ey)} />
              <circle className="tip" cx={X(a.ex)} cy={Y(a.ey)} r={0.5} />
              <text className="step" x={X(a.x)} y={Y(a.y) - 1.2}>{i + 1}</text>
            </g>
          )
        }
        const d = m as DotMark
        return (
          <g key={d.eid} className={`mk mk-dot${side}${d.goal ? ' is-goal' : ''} st-${st}`} onClick={() => open(title, item.eids, d.eid)}>
            {label}
            <circle className="hit" cx={X(d.x)} cy={Y(d.y)} r={2.2} />
            <circle className="dot" cx={X(d.x)} cy={Y(d.y)} r={d.goal ? 1.4 : 0.9} />
            {!d.goal && <text className="step" x={X(d.x)} y={Y(d.y) - 1.4}>{i + 1}</text>}
          </g>
        )
      })}
    </svg>
  )
}
