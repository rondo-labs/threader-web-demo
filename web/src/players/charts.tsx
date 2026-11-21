// Charts of the player pages: the quadrant chart (two readings, the group's medians as the cross), the group strip,
// the bars per appearance and the season pitch (linked: a bar picks a match, hovering either lights up the other),
// and the depth chart of the team page's 阵容. Thin marks; team green, the rest grey, the one picked thing thread red.
import { useState } from 'react'
import { Markings, X, Y } from '../match-analysis/Pitch'
import { fmtInt, shortDate, type App, type PEvent } from './data'

/* ------------------------------------------------------------------ quadrant */

export interface QPoint { id: string; x: number; y: number; name: string; team: string; hl: boolean }

function ticks(lo: number, hi: number, n: number): number[] {
  if (hi === lo) return [lo]
  const raw = (hi - lo) / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

/** Every player of the group as a dot; dashed lines at the group's medians cut the plane into four. The corners say
 *  more or less of each reading, never better or worse. */
export function Quadrant({ points, xLabel, yLabel, xWords, yWords, xShort, yShort, xMed, yMed, fmtX, fmtY, selected, ghost, onPick, width = 640, height = 470, small = false }: {
  points: QPoint[]; xLabel: string; yLabel: string; xWords: [string, string]; yWords: [string, string]; xShort: string; yShort: string
  xMed: number | null; yMed: number | null; fmtX: (v: number) => string; fmtY: (v: number) => string
  selected: string | null
  /** The player himself when he is below the threshold: drawn hollow, not counted in the medians. */
  ghost?: QPoint | null
  onPick?: (id: string) => void; width?: number; height?: number; small?: boolean
}) {
  const all = ghost ? [...points, ghost] : points
  if (!all.length) return <div className="pq-empty t-caption">这一组没有出场时间够门槛的球员。</div>
  const m = small ? { l: 34, r: 10, t: 12, b: 24 } : { l: 48, r: 18, t: 26, b: 40 }
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y)
  const pad = (lo: number, hi: number) => { const d = (hi - lo) * 0.06 || Math.abs(hi) * 0.1 || 1; return [lo - d, hi + d] }
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs))
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys))
  const sx = (v: number) => m.l + ((v - x0) / (x1 - x0)) * (width - m.l - m.r)
  const sy = (v: number) => height - m.b - ((v - y0) / (y1 - y0)) * (height - m.t - m.b)
  const xt = ticks(x0, x1, small ? 3 : 5), yt = ticks(y0, y1, small ? 3 : 5)
  const order = [...points].sort((a, b) => Number(a.hl) - Number(b.hl) || Number(a.id === selected) - Number(b.id === selected))
  const corner = (xi: 0 | 1, yi: 0 | 1) => `${xShort}${xWords[xi]} · ${yShort}${yWords[yi]}`
  const right = (p: QPoint) => sx(p.x) > width - 90
  return (
    <svg className={`pq${small ? ' pq-small' : ''}`} width={width} height={height} role="img" aria-label={`${xLabel} 和 ${yLabel}`}>
      <rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} className="pq-plane" />
      {xt.map((v) => (
        <g key={`x${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={height - m.b} y2={height - m.b + 4} className="pq-tickline" />
          <text x={sx(v)} y={height - m.b + 14} className="pq-tick" textAnchor="middle">{fmtX(v)}</text>
        </g>
      ))}
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={m.l - 4} x2={m.l} y1={sy(v)} y2={sy(v)} className="pq-tickline" />
          <text x={m.l - 6} y={sy(v) + 3} className="pq-tick" textAnchor="end">{fmtY(v)}</text>
        </g>
      ))}
      {xMed != null && (
        <g className="pq-med">
          <line x1={sx(xMed)} x2={sx(xMed)} y1={m.t} y2={height - m.b} />
          {!small && <text x={sx(xMed) + 4} y={m.t + 10}>{`中位数 ${fmtX(xMed)}`}</text>}
        </g>
      )}
      {yMed != null && (
        <g className="pq-med">
          <line x1={m.l} x2={width - m.r} y1={sy(yMed)} y2={sy(yMed)} />
          {!small && <text x={width - m.r - 4} y={sy(yMed) - 4} textAnchor="end">{`中位数 ${fmtY(yMed)}`}</text>}
        </g>
      )}
      {!small && (
        <g className="pq-corner">
          <text x={width - m.r - 6} y={m.t + 24} textAnchor="end">{corner(0, 0)}</text>
          <text x={m.l + 6} y={m.t + 24}>{corner(1, 0)}</text>
          <text x={width - m.r - 6} y={height - m.b - 8} textAnchor="end">{corner(0, 1)}</text>
          <text x={m.l + 6} y={height - m.b - 8}>{corner(1, 1)}</text>
        </g>
      )}
      {!small && (
        <>
          <text x={width - m.r} y={height - 4} className="pq-title" textAnchor="end">{`${xLabel} →`}</text>
          <text x={m.l} y={12} className="pq-title">{`↑ ${yLabel}`}</text>
        </>
      )}
      {order.map((p) => (
        <g key={p.id} className={`pq-pt${p.hl ? ' is-hl' : ''}${p.id === selected ? ' is-sel' : ''}${onPick ? ' is-click' : ''}`} onClick={() => onPick?.(p.id)}>
          <title>{`${p.name}（${p.team}）\n${xLabel}：${fmtX(p.x)}\n${yLabel}：${fmtY(p.y)}`}</title>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={small ? (p.id === selected ? 4.5 : 2.6) : p.id === selected ? 6 : p.hl ? 4.6 : 3.6} />
          {(small ? p.id === selected : p.hl || p.id === selected) && (
            <text x={sx(p.x) + (right(p) ? -8 : 8)} y={sy(p.y) + 4} textAnchor={right(p) ? 'end' : 'start'}>{p.name}</text>
          )}
        </g>
      ))}
      {ghost && (
        <g className="pq-pt is-ghost">
          <title>{`${ghost.name}：出场时间不够门槛，不参加排名`}</title>
          <circle cx={sx(ghost.x)} cy={sy(ghost.y)} r={small ? 4.5 : 6} />
          <text x={sx(ghost.x) + (right(ghost) ? -8 : 8)} y={sy(ghost.y) + 4} textAnchor={right(ghost) ? 'end' : 'start'}>{`${ghost.name}（不够门槛）`}</text>
        </g>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ strip */

/** The group's players on one line; the tick is the group's median; the player stands out (hollow when he is below
 *  the threshold and so not among them). */
export function GroupStrip({ rows, me, mine, med, label, nameOf, width = 150 }: {
  rows: { id: string; v: number }[]; me: string; mine: number | null; med: number | null; label: (v: number) => string
  nameOf: (id: string) => string; width?: number
}) {
  const vs = rows.map((r) => r.v).concat(mine != null ? [mine] : [])
  if (!vs.length) return null
  const lo = Math.min(...vs), hi = Math.max(...vs)
  const x = (v: number) => (hi === lo ? width / 2 : 6 + ((v - lo) / (hi - lo)) * (width - 12))
  const inRows = rows.some((r) => r.id === me)
  return (
    <svg className="tm-strip" width={width} height={24} role="img" aria-label="在同位置里的位置">
      <line x1={6} x2={width - 6} y1={12} y2={12} className="tm-axis" />
      {med != null && <line x1={x(med)} x2={x(med)} y1={5} y2={19} className="tm-mean"><title>{`同位置中位数 ${label(med)}`}</title></line>}
      {rows.filter((r) => r.id !== me).map((r) => (
        <circle key={r.id} cx={x(r.v)} cy={12} r={2.6} className="tm-dot"><title>{`${nameOf(r.id)} ${label(r.v)}`}</title></circle>
      ))}
      {mine != null && (
        <circle cx={x(mine)} cy={12} r={4.5} className={inRows ? 'tm-dot-me' : 'pp-dot-ghost'}>
          <title>{`${nameOf(me)} ${label(mine)}${inRows ? '' : '（不参加排名）'}`}</title>
        </circle>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ bars per appearance */

/** One bar per appearance, in date order. Rates draw attempts with the successes inside; substitute appearances are
 *  lighter; matches the filter leaves out are faded; the dashed line is his own average per appearance. */
export function AppBars({ apps, values, ok, keep, mean, meanLabel, selected, onPick, format, teams, hover = null, onHover, width = 540, height = 84 }: {
  apps: App[]; values: number[]; ok: number[] | null; keep: boolean[]; mean: number | null; meanLabel: string
  selected: number | null; onPick: (i: number) => void; format: (v: number) => string; teams: Record<string, string>
  /** The appearance under the mouse, here or on the pitch: both charts light it up. */
  hover?: number | null; onHover?: (i: number | null) => void
  width?: number; height?: number
}) {
  const n = values.length
  const max = Math.max(mean ?? 0, ...values) || 1
  const pad = 30, top = 12, bottom = 18
  const slot = (width - pad) / Math.max(1, n)
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom)
  const tick = [0, Math.floor(n / 2), n - 1].filter((i, k, a) => n > 0 && a.indexOf(i) === k)
  return (
    <svg className={`tm-bars pa-bars${ok ? ' is-rate' : ''}`} width={width} height={height} role="img" aria-label="每场的数值">
      <text x={0} y={top + 4} className="tm-tick">{format(max)}</text>
      <text x={0} y={height - bottom} className="tm-tick">0</text>
      {values.map((v, i) => {
        const a = apps[i]
        return (
          <g key={i} className={`tm-bar${selected === i ? ' is-sel' : ''}${keep[i] ? '' : ' is-out'}${a.st ? '' : ' is-sub'}${hover === i ? ' is-hover' : ''}`}
            onClick={() => onPick(i)} onMouseEnter={onHover && (() => onHover(i))} onMouseLeave={onHover && (() => onHover(null))}>
            <title>{`${shortDate(a.d)} ${a.h ? '主' : '客'} ${teams[a.o] ?? ''} ${a.s[0]}–${a.s[1]} · ${a.st ? '首发' : '替补'} ${a.min} 分钟：${format(v)}${ok ? `（成功 ${ok[i]}）` : ''}${a.src ? ' · 有视频' : ''}`}</title>
            <rect className="hit" x={pad + i * slot} y={0} width={slot} height={height - bottom} />
            <rect className="bar" x={pad + i * slot + slot * 0.18} y={y(v)} width={slot * 0.64} height={Math.max(0.5, y(0) - y(v))} rx={1} />
            {ok && ok[i] > 0 && <rect className="bar-ok" x={pad + i * slot + slot * 0.18} y={y(ok[i])} width={slot * 0.64} height={Math.max(0.5, y(0) - y(ok[i]))} rx={1} />}
            {a.src && <circle className="tm-video" cx={pad + i * slot + slot / 2} cy={5} r={2.5} />}
          </g>
        )
      })}
      {mean != null && <line className="tm-mean" x1={pad} x2={width} y1={y(mean)} y2={y(mean)}><title>{meanLabel}</title></line>}
      {tick.map((i, k) => (
        <text key={i} x={k === 0 ? pad : k === tick.length - 1 ? width : pad + i * slot + slot / 2} y={height - 4} className="tm-tick"
          textAnchor={k === 0 ? 'start' : k === tick.length - 1 ? 'end' : 'middle'}>{shortDate(apps[i].d)}</text>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ the season on one pitch */

const HEAT_FROM = 240

/** Every counted action on one pitch, attacking to the right. Passes and crosses are arrows, the rest dots; actions
 *  with video carry a ring and play when clicked. Above 240 actions it starts as a heat grid (counts per zone). */
export function SeasonPitch({ events, ok, apps, labels, teams, onPlay, current, dimApp = null, onHoverApp, width = 540 }: {
  events: { i: number; e: PEvent }[]; ok: Set<number> | null; apps: App[]; labels: string[]; teams: Record<string, string>
  onPlay: (i: number) => void; current: Set<number> | null
  /** The appearance under the mouse (on the bars or here): the other matches' actions fade. */
  dimApp?: number | null; onHoverApp?: (app: number | null) => void
  width?: number
}) {
  const [each, setEach] = useState(false)
  const heat = events.length > HEAT_FROM && !each
  const isOk = (i: number, e: PEvent) => (ok ? ok.has(i) : e[5] === 1)
  const title = (e: PEvent) => {
    const a = apps[e[4]]
    return `${shortDate(a.d)} ${a.h ? '主' : '客'} ${teams[a.o] ?? ''} · ${e[7]} · ${labels[e[6]]}${e[8] != null && a.src ? ' · 点开看视频' : ''}`
  }
  const cols = 12, rows = 8
  const grid = heat
    ? (() => {
        const g: number[] = Array(cols * rows).fill(0)
        for (const { e } of events) {
          const c = Math.min(cols - 1, Math.max(0, Math.floor((e[0] / 100) * cols)))
          const r = Math.min(rows - 1, Math.max(0, Math.floor(((100 - e[1]) / 100) * rows)))
          g[r * cols + c]++
        }
        return g
      })()
    : null
  const top = grid ? Math.max(...grid) : 0
  return (
    <div className="pb-wrap">
      <svg className={`pz pz-full pb-pitch${current ? ' pz-focus' : ''}`} viewBox="-2.5 -2.5 110 73" width={width} role="img" aria-label="画在一张场上">
        <Markings thirds />
        {grid && grid.map((c, k) => c > 0 && (
          <rect key={k} className="pb-heat" x={(k % cols) * (105 / cols)} y={Math.floor(k / cols) * (68 / rows)} width={105 / cols} height={68 / rows}
            style={{ opacity: 0.12 + 0.78 * (c / top) }}>
            <title>{`${c} 次`}</title>
          </rect>
        ))}
        {grid && grid.map((c, k) => c > 0 && (
          <text key={`t${k}`} className="pb-heat-n" x={(k % cols) * (105 / cols) + 105 / cols / 2} y={Math.floor(k / cols) * (68 / rows) + 68 / rows / 2 + 0.9}>{c}</text>
        ))}
        {!grid && events.map(({ i, e }) => {
          const playable = e[8] != null && !!apps[e[4]].src
          const state = `${playable ? ' pb-play' : ''}${current?.has(i) ? ' st-current' : ''}${dimApp != null && e[4] !== dimApp ? ' pb-dim' : ''}`
          const hover = onHoverApp ? { onMouseEnter: () => onHoverApp(e[4]), onMouseLeave: () => onHoverApp(null) } : {}
          const click = playable ? () => onPlay(i) : undefined
          return e[2] != null && e[3] != null && e[9] <= 1 ? (
            <g key={i} className={`mk-arrow ${isOk(i, e) ? 'ok' : 'fail'}${state}`} onClick={click} {...hover}>
              <title>{title(e)}</title>
              <line className="ln" x1={X(e[0])} y1={Y(e[1])} x2={X(e[2]!)} y2={Y(e[3]!)} />
              <circle className="tip" cx={X(e[2]!)} cy={Y(e[3]!)} r={0.5} />
              {playable && <circle className="pb-ring" cx={X(e[0])} cy={Y(e[1])} r={1.3} />}
            </g>
          ) : (
            <g key={i} className={`mk-dot${isOk(i, e) ? '' : ' is-fail'}${e[9] === 3 ? ' is-goal' : ''}${state}`} onClick={click} {...hover}>
              <title>{title(e)}</title>
              <circle className="dot" cx={X(e[0])} cy={Y(e[1])} r={0.9} />
              {playable && <circle className="pb-ring" cx={X(e[0])} cy={Y(e[1])} r={1.7} />}
            </g>
          )
        })}
      </svg>
      {events.length > HEAT_FROM && (
        <div className="t-caption pb-note">
          <button className="btn-quiet" onClick={() => setEach(!each)} title={heat ? `${fmtInt(events.length)} 次，先画成热区，格子里是次数` : undefined}>
            {each ? '改回热区' : '画出每一次'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ depth chart */

/** Who played each position for the team, by minutes: from our goal (left) to theirs, our left wing on top. A position
 *  shows once the team spent 270 minutes there, a player once he spent 45 minutes in it; three names each. */
export function DepthChart({ places, rows, href }: {
  places: Record<string, [number, number, string]>
  rows: { id: string; name: string; places: Record<string, number> }[]
  href: (id: string) => string
}) {
  const by = new Map<string, { id: string; name: string; min: number }[]>()
  for (const r of rows) {
    for (const [place, min] of Object.entries(r.places)) {
      if (!places[place] || min < 45) continue
      by.set(place, [...(by.get(place) ?? []), { id: r.id, name: r.name, min }])
    }
  }
  for (const [place, list] of [...by]) if (list.reduce((s, w) => s + w.min, 0) < 270) by.delete(place)
  const cols = [
    { title: '门将', test: (x: number) => x <= 10 },
    { title: '后卫', test: (x: number) => x > 10 && x <= 36 && x !== 33 && x !== 34 },
    { title: '后腰 · 中场', test: (x: number) => x === 33 || x === 34 || x === 45 },
    { title: '边前卫 · 前腰', test: (x: number) => x === 50 || x === 62 },
    { title: '边锋 · 前锋', test: (x: number) => x >= 70 },
  ]
  return (
    <div className="pd-board">
      {cols.map((c) => {
        const list = Object.entries(places).filter(([p, [x]]) => c.test(x) && by.has(p)).sort((a, b) => b[1][1] - a[1][1])
        return (
          <div key={c.title} className="pd-col">
            <div className="t-label pd-col-title">{c.title}</div>
            {list.map(([p]) => {
              const who = by.get(p)!.sort((a, b) => b.min - a.min)
              return (
                <div key={p} className="pd-place">
                  <div className="pd-place-name">{p}</div>
                  {who.slice(0, 3).map((w) => (
                    <a key={w.id} href={href(w.id)} className="pd-who"><span>{w.name}</span><span className="t-numeric">{`${fmtInt(w.min)}′`}</span></a>
                  ))}
                  {who.length > 3 && <div className="t-caption">{`还有 ${who.length - 3} 人`}</div>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
