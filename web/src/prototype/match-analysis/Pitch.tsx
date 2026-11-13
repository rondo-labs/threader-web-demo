// PROTOTYPE: pitch diagrams for the attack sections, in Opta proportions.
// Opta x,y run 0–100 with each team attacking left→right and y = 100 on the attacking team's left.
// Full pitches are horizontal (attack to the right, our left at the top); half and final-third views
// are upright (attack upwards, our left on the left), per the design system's pitch rules.
import { eventLine, playerLabel, playerName } from './clips'
import type { ArrowMark, DotMark, EdgeMark, Ev, LaneKey, Mark, MatchData, NodeMark, Section, ShotMark } from './types'

export type Open = (title: string, eids: string[], startEid?: string) => void
export interface Focus { all: Set<string>; current: Set<string> }

export const X = (x: number) => x * 1.05
export const Y = (y: number) => (100 - y) * 0.68
export const UPRIGHT = 'matrix(0 -1 1 0 0 105)' // (X, Y) → (Y, 105 − X)
const VIEWS: Record<Section['pitch'], string> = {
  full: '-2.5 -2.5 110 73',
  half: '-2.5 -2.5 73 57',
  'final-third': '-2.5 -2.5 73 39.5',
  // our own half, upright: our goal at the bottom
  'half-own': '-2.5 50 73 57.5',
}

export const markEids = (m: Mark): string[] => (m.kind === 'shot' || m.kind === 'arrow' || m.kind === 'dot' ? [m.eid] : m.eids)
export const LANE_ZH: Record<LaneKey, string> = { left: '左路', center: '中路', right: '右路' }

export function Markings({ thirds }: { thirds?: boolean }) {
  const boxX = X(83)
  const sixX = X(94.2)
  const spot = X(88.5)
  const boxTop = Y(78.9)
  const boxH = Y(21.1) - boxTop
  const sixTop = Y(63.2)
  const sixH = Y(36.8) - sixTop
  const goalTop = Y(55.8)
  const goalH = Y(44.2) - goalTop
  const arc = Math.sqrt(9.15 ** 2 - (spot - boxX) ** 2)
  return (
    <g className="pz-markings">
      <rect x={-2.5} y={-2.5} width={110} height={73} className="pz-surface" />
      <rect x={0} y={0} width={105} height={68} className="pz-strong" />
      <line x1={52.5} y1={0} x2={52.5} y2={68} />
      <circle cx={52.5} cy={34} r={9.15} />
      <circle cx={52.5} cy={34} r={0.3} className="pz-spot" />
      <rect x={boxX} y={boxTop} width={105 - boxX} height={boxH} />
      <rect x={sixX} y={sixTop} width={105 - sixX} height={sixH} />
      <circle cx={spot} cy={34} r={0.3} className="pz-spot" />
      <path d={`M ${boxX} ${34 - arc} A 9.15 9.15 0 0 0 ${boxX} ${34 + arc}`} />
      <rect x={105} y={goalTop} width={1.8} height={goalH} className="pz-strong" />
      <rect x={0} y={boxTop} width={105 - boxX} height={boxH} />
      <rect x={0} y={sixTop} width={105 - sixX} height={sixH} />
      <circle cx={105 - spot} cy={34} r={0.3} className="pz-spot" />
      <path d={`M ${105 - boxX} ${34 - arc} A 9.15 9.15 0 0 1 ${105 - boxX} ${34 + arc}`} />
      <rect x={-1.8} y={goalTop} width={1.8} height={goalH} className="pz-strong" />
      {thirds && (
        <g className="pz-dashed">
          <line x1={X(66.7)} y1={0} x2={X(66.7)} y2={68} />
          <line x1={X(66.7)} y1={Y(66.7)} x2={105} y2={Y(66.7)} />
          <line x1={X(66.7)} y1={Y(33.3)} x2={105} y2={Y(33.3)} />
        </g>
      )}
    </g>
  )
}

type MarkState = 'idle' | 'in' | 'out' | 'current'

interface ChartProps {
  data: MatchData
  section: Section
  teamName: string
  focus: Focus | null
  open: Open
  /** Draw only the marks behind these event ids. */
  only?: Set<string>
  mini?: boolean
  /** Entries: the three-lane summary instead of single arrows. */
  aggregate?: boolean
  onDrill?: (band: string) => void
  /** Reference lines to draw; defaults to the section's own. */
  lines?: { x: number; label: string; key?: boolean }[]
  /** Events behind the box badge of a lane summary (the section's box metric in the current filter). */
  badgeEids?: string[]
  /** Round-1 lane tags on the entries chart. */
  laneTags?: boolean
  /** Title of the playlist a click on a mark opens. */
  playTitle?: string
}

export function SectionChart({ data, section, teamName, focus, open, only, mini, aggregate, onDrill, laneTags = true, playTitle, lines = section.lines, badgeEids }: ChartProps) {
  const filtered = only ? section.marks.filter((m) => markEids(m).some((id) => only.has(id))) : section.marks
  // The pass network keeps every player on the pitch as context; filtered-out players are dimmed.
  const marks = section.key === 'network' && only ? [...filtered.filter((m) => m.kind === 'edge'), ...section.marks.filter((m) => m.kind === 'node')] : filtered
  const state = (m: Mark): MarkState => {
    if (only && m.kind === 'node' && !markEids(m).some((id) => only.has(id))) return 'out'
    if (!focus) return 'idle'
    const ids = markEids(m)
    if (ids.some((id) => focus.current.has(id))) return 'current'
    return ids.some((id) => focus.all.has(id)) ? 'in' : 'out'
  }
  const interactive = !mini
  const summary = section.summary?.kind ?? 'lanes'
  const props = { data, section, teamName, marks, state, open, interactive, playTitle }
  return (
    <svg
      viewBox={VIEWS[section.pitch]}
      className={`pz pz-${section.pitch}${mini ? ' pz-mini' : ''}${focus ? ' pz-focus' : ''}`}
      role="img"
      aria-label={`${teamName}${section.title}：${section.readings[0] ?? ''}`}
    >
      <g transform={section.pitch === 'full' ? undefined : UPRIGHT}>
        <Markings thirds={section.key === 'entries'} />
        {!aggregate && <Arrows {...props} />}
        {section.key === 'shots' && <Shots {...props} />}
        {!aggregate && <Dots {...props} />}
        {section.key === 'network' && <Network {...props} mini={!!mini} />}
      </g>
      {aggregate && summary === 'thirds' && <ThirdSummary {...props} mini={!!mini} onDrill={onDrill} />}
      {aggregate && summary === 'corners' && <CornerSummary {...props} mini={!!mini} onDrill={onDrill} />}
      {aggregate && (summary === 'lanes' || summary === 'lanes-defending') && (
        <LaneSummary {...props} mini={!!mini} onDrill={onDrill} defending={summary === 'lanes-defending'} badgeEids={badgeEids} />
      )}
      {section.pitch === 'full' && !mini &&
        lines?.map((l) => (
          <g key={l.label} className={`pz-ref${l.key ? ' is-key' : ''}`}>
            <line x1={X(l.x)} x2={X(l.x)} y1={-1.5} y2={69.5} />
            {/* the key line is labelled above, to its left; plain lines below, pointing into the zone they open */}
            {l.key ? (
              <text x={X(l.x) - 0.6} y={-0.4} className="end">{`${l.label} ${Math.round(l.x * 1.05)} 米`}</text>
            ) : (
              <text x={X(l.x) + 0.6} y={69.4}>{`${l.label} →`}</text>
            )}
          </g>
        ))}
      {section.key === 'entries' && interactive && laneTags && !aggregate && section.lanes && (
        <g className="pz-lanes">
          {section.lanes.map((l) => {
            const cy = l.lane === 'left' ? Y(83.35) : l.lane === 'center' ? Y(50) : Y(16.65)
            return (
              <g key={l.lane} className="lane-tag" onClick={() => open(`${teamName} · 从${l.label}进入前场`, l.eids)}>
                <title>{`从${l.label}进入前场 ${l.value} 次，点开看视频`}</title>
                <rect x={X(66.7) + 0.8} y={cy - 2} width={10.4} height={4} rx={0.5} />
                <text x={X(66.7) + 1.6} y={cy + 0.75}>{`${l.label} ${l.value}`}</text>
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}

interface LayerProps {
  data: MatchData
  section: Section
  teamName: string
  marks: Mark[]
  state: (m: Mark) => MarkState
  open: Open
  interactive: boolean
  playTitle?: string
}

function Shots({ data, teamName, marks, state, open, interactive, playTitle }: LayerProps) {
  const shots = marks.filter((m): m is ShotMark => m.kind === 'shot').sort((a, b) => Number(a.goal) - Number(b.goal))
  const all = shots.map((m) => m.eid)
  return (
    <g>
      {shots.map((m) => {
        const look = m.goal ? 'is-goal' : m.onTarget ? 'is-on' : m.blocked ? 'is-blocked' : 'is-off'
        return (
          <g
            key={m.eid}
            className={`mk mk-shot ${look} st-${state(m)}`}
            onClick={interactive ? () => open(playTitle ?? `${teamName} · 射门`, all, m.eid) : undefined}
          >
            <title>{eventLine(data, data.events[m.eid])}</title>
            {interactive && <circle className="hit" cx={X(m.x)} cy={Y(m.y)} r={2.4} />}
            <circle className="dot" cx={X(m.x)} cy={Y(m.y)} r={m.big ? 1.35 : 0.9} />
          </g>
        )
      })}
    </g>
  )
}

function Arrows({ data, section, teamName, marks, state, open, interactive, playTitle }: LayerProps) {
  const rank = (m: ArrowMark) => (m.key ? 2 : m.ok ? 1 : 0)
  const arrows = marks.filter((m): m is ArrowMark => m.kind === 'arrow').sort((a, b) => rank(a) - rank(b))
  const peers = arrows.map((a) => a.eid)
  // The thread colour picks the key arrows out of the rest; when every arrow on the chart is key, none is.
  const mixed = arrows.some((a) => a.key) && arrows.some((a) => !a.key)
  return (
    <g>
      {arrows.map((m) => {
        return (
          <g
            key={m.eid}
            className={`mk mk-arrow ${m.ok ? 'ok' : 'fail'}${m.key && mixed ? ' key' : ''}${m.side === 'opp' ? ' opp' : ''} st-${state(m)}`}
            onClick={interactive ? () => open(playTitle ?? `${teamName} · ${section.title}`, peers, m.eid) : undefined}
          >
            <title>{eventLine(data, data.events[m.eid])}</title>
            {interactive && <line className="hit" x1={X(m.x)} y1={Y(m.y)} x2={X(m.ex)} y2={Y(m.ey)} />}
            <line className="ln" x1={X(m.x)} y1={Y(m.y)} x2={X(m.ex)} y2={Y(m.ey)} />
            <circle className="tip" cx={X(m.ex)} cy={Y(m.ey)} r={0.5} />
          </g>
        )
      })}
    </g>
  )
}

function Dots({ data, teamName, marks, state, open, interactive, playTitle }: LayerProps) {
  const dots = marks.filter((m): m is DotMark => m.kind === 'dot')
  const peers = dots.map((d) => d.eid)
  return (
    <g>
      {dots.map((m) => (
        <g
          key={m.eid}
          className={`mk mk-dot${m.side === 'opp' ? ' opp' : ''}${m.goal ? ' is-goal' : ''}${m.ok === false ? ' is-fail' : ''}${m.key ? ' is-key' : ''} st-${state(m)}`}
          onClick={interactive ? () => open(playTitle ?? teamName, peers, m.eid) : undefined}
        >
          <title>{eventLine(data, data.events[m.eid])}</title>
          {interactive && <circle className="hit" cx={X(m.x)} cy={Y(m.y)} r={2.2} />}
          <circle className="dot" cx={X(m.x)} cy={Y(m.y)} r={m.goal ? 1.3 : 0.85} />
        </g>
      ))}
    </g>
  )
}

function Network({ data, section, teamName, marks, state, open, interactive, mini }: LayerProps & { mini: boolean }) {
  const allNodes = new Map(section.marks.filter((m): m is NodeMark => m.kind === 'node').map((n) => [n.playerId, n]))
  const edges = marks.filter((m): m is EdgeMark => m.kind === 'edge')
  const nodes = marks.filter((m): m is NodeMark => m.kind === 'node')
  return (
    <g>
      {edges.map((e) => {
        const a = allNodes.get(e.a)
        const b = allNodes.get(e.b)
        if (!a || !b) return null
        const label = `${playerLabel(data, e.a)} ↔ ${playerLabel(data, e.b)}`
        return (
          <g
            key={`${e.a}-${e.b}`}
            className={`mk mk-edge st-${state(e)}`}
            onClick={interactive ? () => open(`${teamName} · ${label}`, e.eids) : undefined}
          >
            <title>{`${label}：互传 ${e.count} 次`}</title>
            {interactive && <line className="hit" x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} />}
            <line
              className="ln"
              x1={X(a.x)}
              y1={Y(a.y)}
              x2={X(b.x)}
              y2={Y(b.y)}
              style={{ strokeWidth: `${Math.min(1 + e.count * 0.75, 9)}px` }}
            />
          </g>
        )
      })}
      {nodes.map((n) => {
        const r = 1.4 + Math.sqrt(n.count) * 0.3
        return (
          <g
            key={n.playerId}
            className={`mk mk-node st-${state(n)}`}
            onClick={interactive ? () => open(`${teamName} · ${playerLabel(data, n.playerId)} 的传球`, n.eids) : undefined}
          >
            <title>{`${playerLabel(data, n.playerId)}：传球 ${n.count} 次`}</title>
            <circle className="dot" cx={X(n.x)} cy={Y(n.y)} r={r} />
            {!mini && (
              <>
                <text className="num" x={X(n.x)} y={Y(n.y) + 0.55}>
                  {data.players[n.playerId]?.number ?? ''}
                </text>
                <text className="nm" x={X(n.x)} y={Y(n.y) + r + 1.9}>
                  {playerName(data, n.playerId)}
                </text>
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** Third-by-third overview: how many of the drawn actions started in each third (our goal on the left). */
function ThirdSummary({ section, marks, interactive, mini, onDrill }: LayerProps & { mini: boolean; onDrill?: (band: string) => void }) {
  const dots = marks.flatMap((m) => (m.kind === 'dot' ? [{ x: m.x, ok: m.ok !== false }] : m.kind === 'arrow' ? [{ x: m.x, ok: m.ok }] : []))
  const okLabel = section.summary?.okLabel ?? '成功'
  const zones = [
    { key: 'back', label: '后场', x0: 0, x1: 33.3 },
    { key: 'mid', label: '中场', x0: 33.3, x1: 66.7 },
    { key: 'front', label: '前场', x0: 66.7, x1: 100.1 },
  ].map((z) => {
    const inZone = dots.filter((d) => d.x >= z.x0 && d.x < z.x1)
    return { ...z, n: inZone.length, ok: inZone.filter((d) => d.ok).length }
  })
  const total = Math.max(1, dots.length)
  return (
    <g className="lane-summary">
      {zones.map((z) => {
        const share = z.n / total
        const tone = share >= 0.45 ? 'tone-3' : share >= 0.2 ? 'tone-2' : 'tone-1'
        const cx = (X(z.x0) + X(Math.min(z.x1, 100))) / 2
        return (
          <g key={z.key} className={`lane-sum${interactive && onDrill ? ' is-live' : ''}`} onClick={interactive && onDrill ? () => onDrill(z.key) : undefined}>
            {interactive && <title>{`${z.label}：${z.n} 次，其中${okLabel} ${z.ok} 次。点一下只看这一块`}</title>}
            <rect x={X(z.x0)} y={0} width={X(Math.min(z.x1, 100)) - X(z.x0)} height={68} className={`lane-band ${tone}`} />
            {!mini && (
              <>
                <text x={cx} y={33} className={`lane-num center ${tone}`}>
                  {z.n}
                </text>
                <text x={cx} y={37.5} className={`lane-sub center ${tone}`}>
                  {`${z.label}${z.ok < z.n ? ` · ${okLabel} ${z.ok}` : ''}`}
                </text>
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

// Upright coordinates for summaries drawn without a transform, so their text stays upright.
const U = (y: number) => (100 - y) * 0.68
const V = (x: number) => 105 - x * 1.05

/** Corner overview in real positions (attackers' left on the left): short corners beside the flag they were taken from,
 *  the other deliveries in three columns across the box by where they landed, and a badge for those that landed outside it. */
function CornerSummary({ section, marks, interactive, mini, onDrill }: LayerProps & { mini: boolean; onDrill?: (band: string) => void }) {
  const corners = marks.filter((m): m is ArrowMark => m.kind === 'arrow')
  const okLabel = section.summary?.okLabel ?? '成功'
  const zones = [
    { key: 'short_left', label: '短角球', title: '左侧短角球', y0: 78.9, y1: 100 },
    { key: 'left', label: '禁区左侧', title: '落在禁区左侧', y0: 55.8, y1: 78.9 },
    { key: 'central', label: '中路', title: '落在禁区中路', y0: 44.2, y1: 55.8 },
    { key: 'right', label: '禁区右侧', title: '落在禁区右侧', y0: 21.1, y1: 44.2 },
    { key: 'short_right', label: '短角球', title: '右侧短角球', y0: 0, y1: 21.1 },
  ].map((z) => {
    const these = corners.filter((c) => c.zone === z.key)
    return { ...z, n: these.length, ok: these.filter((c) => c.ok).length }
  })
  const total = Math.max(1, corners.length)
  const outside = corners.filter((c) => c.zone === 'outside')
  const live = interactive && !!onDrill
  return (
    <g className="lane-summary">
      {zones.map((z) => {
        const share = z.n / total
        const tone = share >= 0.45 ? 'tone-3' : share >= 0.2 ? 'tone-2' : 'tone-1'
        const cx = (U(z.y0) + U(z.y1)) / 2
        return (
          <g key={z.key} className={`lane-sum${interactive && onDrill ? ' is-live' : ''}`} onClick={interactive && onDrill ? () => onDrill(z.key) : undefined}>
            {interactive && <title>{`${z.title}：${z.n} 个，${okLabel} ${z.ok} 个。点一下只看这一类`}</title>}
            <rect x={U(z.y1)} y={V(100)} width={U(z.y0) - U(z.y1)} height={V(83) - V(100)} className={`lane-band ${tone}`} />
            {!mini && (
              <>
                <text x={cx} y={V(91) + 0.6} className={`lane-num center ${tone}`}>
                  {z.n}
                </text>
                <text x={cx} y={V(91) + 3.6} className={`lane-sub center ${tone}`}>
                  {z.label}
                </text>
              </>
            )}
          </g>
        )
      })}
      {!mini && outside.length > 0 && (
        <g className={`out-badge${live ? ' is-live' : ''}`} onClick={live ? () => onDrill!('outside') : undefined}>
          {live && <title>{`其他落在禁区外的：${outside.length} 个（不含短角球），${okLabel} ${outside.filter((c) => c.ok).length} 个。点一下只看这一类`}</title>}
          <rect x={U(50) - 7} y={V(76) - 2.2} width={14} height={4.4} rx={0.6} />
          <text x={U(50)} y={V(76) + 0.7}>{`禁区外 ${outside.length}`}</text>
        </g>
      )}
    </g>
  )
}

/** Entries overview: one band per lane with how often a team got into a final third that way.
 *  `defending` draws the opponent coming into our third, our goal on the left. */
function LaneSummary({ teamName, marks, open, interactive, mini, onDrill, defending, badgeEids }: LayerProps & {
  mini: boolean; onDrill?: (band: string) => void; defending?: boolean; badgeEids?: string[]
}) {
  const arrows = marks.filter((m): m is ArrowMark => m.kind === 'arrow')
  const entries = arrows.filter((m) => m.entry)
  const box = badgeEids ?? arrows.filter((m) => m.key).map((m) => m.eid)
  const lanes = (['left', 'center', 'right'] as const).map((lane) => {
    const ms = entries.filter((m) => m.lane === lane)
    return { lane, total: ms.length, ok: ms.filter((m) => m.ok).length }
  })
  const max = Math.max(1, ...lanes.map((l) => l.total))
  const sum = Math.max(1, entries.length)
  const bands: Record<LaneKey, [number, number]> = { left: [0, Y(66.7)], center: [Y(66.7), Y(33.3)], right: [Y(33.3), 68] }
  const [x0, x1] = defending ? [0, X(33.3)] : [X(66.7), 105]
  return (
    <g className="lane-summary">
      {lanes.map((l) => {
        const [y0, y1] = bands[l.lane]
        const cy = (y0 + y1) / 2
        const share = l.total / sum
        const tone = share >= 0.45 ? 'tone-3' : share >= 0.2 ? 'tone-2' : 'tone-1'
        const w = 0.8 + (l.total / max) * 5
        const [a, b, c] = defending ? [X(60), X(37.5), X(33.8)] : [X(40), X(62.5), X(66.2)]
        const tx = defending ? x1 - 2 : x0 + 2
        return (
          <g key={l.lane} className={`lane-sum${interactive && onDrill ? ' is-live' : ''}`} onClick={interactive && onDrill ? () => onDrill(l.lane) : undefined}>
            {interactive && <title>{`${LANE_ZH[l.lane]}：${defending ? '对手打进来' : '进入前场'} ${l.total} 次，成功 ${l.ok} 次。点一下只看这一路`}</title>}
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className={`lane-band ${tone}`} />
            {l.total > 0 && (
              <path
                className="lane-arrow"
                d={`M ${a} ${cy - w / 2} L ${b} ${cy - w / 2} L ${b} ${cy - w / 2 - 1.3} L ${c} ${cy} L ${b} ${cy + w / 2 + 1.3} L ${b} ${cy + w / 2} L ${a} ${cy + w / 2} Z`}
              />
            )}
            {!mini && (
              <>
                <text x={tx} y={cy + 0.6} className={`lane-num ${tone}${defending ? ' end' : ''}`}>
                  {l.total}
                </text>
                <text x={tx} y={cy + 3.7} className={`lane-sub ${tone}${defending ? ' end' : ''}`}>
                  {`${defending ? '从我们' : ''}${LANE_ZH[l.lane]}${l.ok < l.total ? ` · 成功 ${l.ok}` : ''}`}
                </text>
              </>
            )}
          </g>
        )
      })}
      {box.length > 0 && !mini && (
        <g className="box-badge" onClick={() => open(`${teamName} · ${defending ? '传进我们禁区' : '传进禁区'}`, box)}>
          <title>{`${defending ? '传进我们禁区' : '传进禁区'} ${box.length} 次，点开看视频`}</title>
          <rect x={defending ? X(1) : X(84.5)} y={Y(57.5)} width={X(99) - X(84.5)} height={Y(42.5) - Y(57.5)} rx={0.6} />
          <text x={defending ? (X(1) + X(15.5)) / 2 : (X(84.5) + X(99)) / 2} y={Y(50) + 0.7}>{`${defending ? '进禁区' : '传进禁区'} ${box.length}`}</text>
        </g>
      )}
    </g>
  )
}

/** One action on a small full pitch, beside a clip (the design system's PitchMini). */
export function EventThumb({ ev }: { ev: Ev }) {
  return (
    <svg viewBox="-2.5 -2.5 110 73" className="pz pz-thumb" role="img" aria-label="当前片段的位置">
      <Markings />
      {ev.ex != null && ev.ey != null && <line className="thumb-ln" x1={X(ev.x)} y1={Y(ev.y)} x2={X(ev.ex)} y2={Y(ev.ey)} />}
      <circle className="thumb-dot" cx={X(ev.x)} cy={Y(ev.y)} r={1.6} />
    </svg>
  )
}

/** Legend swatches drawn with the same classes as the marks. */
export function Swatch({ kind }: { kind: string }) {
  if (kind === 'ok' || kind === 'fail' || kind === 'key') {
    return (
      <svg viewBox="0 0 22 10" className="swatch">
        <g className={`mk-arrow ${kind === 'fail' ? 'fail' : 'ok'}${kind === 'key' ? ' key' : ''}`}>
          <line className="ln" x1={1} y1={5} x2={17} y2={5} />
          <circle className="tip" cx={18} cy={5} r={2.2} />
        </g>
      </svg>
    )
  }
  if (kind === 'act_ok' || kind === 'act_fail' || kind === 'them_shot' || kind === 'key_dot') {
    return (
      <svg viewBox="0 0 14 14" className="swatch">
        <g className={`mk-dot${kind === 'them_shot' ? ' opp' : ''}${kind === 'act_fail' ? ' is-fail' : ''}${kind === 'key_dot' ? ' is-key' : ''}`}><circle className="dot" cx={7} cy={7} r={4.5} /></g>
      </svg>
    )
  }
  if (kind === 'them_pass') {
    return (
      <svg viewBox="0 0 22 10" className="swatch">
        <g className="mk-arrow ok opp"><line className="ln" x1={21} y1={5} x2={5} y2={5} /><circle className="tip" cx={4} cy={5} r={2.2} /></g>
      </svg>
    )
  }
  if (kind === 'us' || kind === 'them') {
    return (
      <svg viewBox="0 0 14 14" className="swatch">
        <g className={`mk-dot${kind === 'them' ? ' opp' : ''}`}><circle className="dot" cx={7} cy={7} r={4.5} /></g>
      </svg>
    )
  }
  if (kind === 'edge') {
    return (
      <svg viewBox="0 0 22 10" className="swatch">
        <g className="mk-edge"><line className="ln" x1={1} y1={5} x2={21} y2={5} style={{ strokeWidth: '4px' }} /></g>
      </svg>
    )
  }
  const look = { goal: 'is-goal', on: 'is-on', off: 'is-off', blocked: 'is-blocked', big: 'is-off', node: '' }[kind] ?? ''
  return (
    <svg viewBox="0 0 14 14" className="swatch">
      <g className={kind === 'node' ? 'mk-node' : `mk-shot ${look}`}>
        <circle className="dot" cx={7} cy={7} r={kind === 'big' || kind === 'node' ? 5.5 : 4} />
      </g>
    </svg>
  )
}
