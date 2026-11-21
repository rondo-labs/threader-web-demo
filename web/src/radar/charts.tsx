// The charts of the radar pages (team and player): a radar of any number of corners (the five, a chapter's sections,
// an ability's readings), each corner named with its place and value; the swarm of a picked reading; the radar in
// miniature for the bar that takes the top once the page scrolls; the ⓘ that holds definitions and how-to lines.
// How far out = the share of the group the subject is ahead of; the dashed line is the median, the pale band the
// middle half (25–75). Team green for the subject, thread red for the opened corner.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { rankText, type Axis } from './axis'

/** A block that knows its own width, so the charts in a row can share one size and follow the window. */
export function Sized({ className, children }: { className?: string; children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.floor(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref} className={className}>{w > 0 ? children(w) : null}</div>
}

/** A chart in the row (a quadrant, the season line) as tall as the radars beside it. */
export const mapHeight = (width: number) => Math.round(Math.min(330, width * 0.72))

/* ------------------------------------------------------------------ radar */

/** `width`: the block's width; the radar takes what its corner labels leave (or give `size` and `padX` yourself). */
export function Radar({ axes, selected, onPick, width, size: sizeIn, padX: padXIn, small = false }: {
  axes: Axis[]; selected: number | null; onPick: (i: number) => void; width?: number; size?: number; padX?: number; small?: boolean
}) {
  const padX = padXIn ?? (width ? Math.round(Math.min(110, Math.max(86, width * 0.23))) : 84)
  const size = sizeIn ?? (width ? Math.max(150, Math.min(270, width - padX * 2)) : 250)
  const n = axes.length
  const padTop = small ? 40 : 48, padBottom = small ? 38 : 44
  const R = size / 2
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  // How far the shape reaches below its centre depends on the number of corners (a square's bottom corner, a
  // pentagon's two feet, a triangle's base): size the drawing to it.
  const below = Math.max(...axes.map((_, i) => Math.sin(ang(i)))) * R
  const W = size + padX * 2
  const H = padTop + R + below + padBottom
  const cx = W / 2, cy = padTop + R
  const at = (i: number, r: number): [number, number] => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r]
  const ring = (f: number) => axes.map((_, i) => at(i, R * f))
  const pts = (list: [number, number][]) => list.map((p) => p.join(',')).join(' ')
  const path = (list: [number, number][]) => `M${list.map((p) => p.join(',')).join('L')}Z`
  const band = `${path(ring(0.75))} ${path([...ring(0.25)].reverse())}`
  const vertices = axes.map((a, i) => (a.pct == null ? null : { i, p: at(i, R * Math.max(0.025, a.pct)) }))
  const shape = vertices.filter((v): v is { i: number; p: [number, number] } => v != null)
  return (
    <svg className={`rd-radar${small ? ' is-small' : ''}`} width={W} height={H} role="img" aria-label="在同组里的位置">
      <path d={band} className="rd-band" fillRule="evenodd" />
      {[0.25, 0.75, 1].map((f) => <polygon key={f} points={pts(ring(f))} className="rd-ring" />)}
      <polygon points={pts(ring(0.5))} className="rd-mid"><title>中位数</title></polygon>
      {axes.map((_, i) => {
        const [x, y] = at(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className={`rd-spoke${selected === i ? ' is-sel' : ''}`} />
      })}
      {shape.length > 2 && <polygon points={pts(shape.map((v) => v.p))} className="rd-shape" />}
      {shape.length === 2 && <line x1={shape[0].p[0]} y1={shape[0].p[1]} x2={shape[1].p[0]} y2={shape[1].p[1]} className="rd-shape" />}
      {axes.map((a, i) => {
        const cos = Math.cos(ang(i)), sin = Math.sin(ang(i))
        const [lx, ly] = at(i, R + 14)
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
        const y0 = sin < -0.9 ? ly - 22 : sin > 0.6 ? ly + 10 : ly - 3
        const v = vertices[i]
        const hit = [[cx, cy], at(i - 0.5, R * 1.2), at(i, R * 1.6), at(i + 0.5, R * 1.2)] as [number, number][]
        const tip = `${a.label === a.reading ? a.reading : `${a.label}：${a.reading}`} ${a.display}${a.unit ? ` ${a.unit}` : ''}\n${rankText(a)}${a.median != null ? ` · 中位数 ${a.fmt(a.median)}` : ''}`
        return (
          <g key={`${a.key}-${i}`} className={`rd-axis${selected === i ? ' is-sel' : ''}${a.missing ? ' is-missing' : ''}`} onClick={() => onPick(i)}>
            <title>{tip}</title>
            <polygon points={pts(hit)} className="rd-hit" />
            <text x={lx} y={y0} textAnchor={anchor} className="rd-label">{a.label}</text>
            <text x={lx} y={y0 + 15} textAnchor={anchor} className="rd-rank">
              {rankText(a)}
              {!a.missing && a.value != null && <tspan className="rd-value">{` · ${a.display}`}</tspan>}
            </text>
            {v && <circle cx={v.p[0]} cy={v.p[1]} r={selected === i ? 6 : 4} className="rd-vertex" />}
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ the swarm of a picked reading */

/** Everyone in the group on one line, nudged up and down so no two dots sit on each other; names on hover. `ghost`: the
 *  subject's own value when it is not among the rows (below the threshold), drawn hollow. */
export function Swarm({ rows, me, median, fmt, ghost = null, width = 520, r = 4 }: {
  rows: { id: string; v: number; name: string }[]; me: string; median: number | null; fmt: (v: number) => string
  ghost?: { v: number; name: string } | null; width?: number; r?: number
}) {
  if (!rows.length) return null
  const vs = rows.map((x) => x.v).concat(ghost && !rows.some((x) => x.id === me) ? [ghost.v] : [])
  const lo = Math.min(...vs), hi = Math.max(...vs)
  const pad = 12
  const x = (v: number) => (hi === lo ? width / 2 : pad + ((v - lo) / (hi - lo)) * (width - pad * 2))
  const d = r * 2 + 1
  const placed: { id: string; x: number; y: number; v: number; name: string }[] = []
  for (const row of [...rows].sort((a, b) => a.v - b.v)) {
    const px = x(row.v)
    let y = 0
    for (let k = 0; k < 40; k++) {
      const dy = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * d * 0.9
      if (!placed.some((p) => (p.x - px) ** 2 + (p.y - dy) ** 2 < d * d)) {
        y = dy
        break
      }
    }
    placed.push({ ...row, x: px, y })
  }
  const spread = Math.max(r * 2, ...placed.map((p) => Math.abs(p.y))) + r + 4
  const H = spread * 2 + 18
  const mid = spread
  const mine = placed.find((p) => p.id === me)
  const hollow = !mine && ghost ? { x: x(ghost.v), ...ghost } : null
  const nameAt = (px: number) => (px > width - 90 ? { x: px - 9, anchor: 'end' as const } : { x: px + 9, anchor: 'start' as const })
  return (
    <svg className="rd-swarm" width={width} height={H} role="img" aria-label="同组里每个的位置">
      <line x1={pad} x2={width - pad} y1={mid} y2={mid} className="rd-swarm-axis" />
      {median != null && (
        <g className="rd-swarm-med">
          <line x1={x(median)} x2={x(median)} y1={2} y2={H - 16} />
          <text x={x(median)} y={H - 4} textAnchor="middle">{`中位数 ${fmt(median)}`}</text>
        </g>
      )}
      <text x={pad} y={H - 4} className="rd-swarm-end">{fmt(lo)}</text>
      <text x={width - pad} y={H - 4} className="rd-swarm-end" textAnchor="end">{fmt(hi)}</text>
      {placed.filter((p) => p.id !== me).map((p) => (
        <circle key={p.id} cx={p.x} cy={mid + p.y} r={r} className="rd-swarm-dot"><title>{`${p.name} ${fmt(p.v)}`}</title></circle>
      ))}
      {mine && (
        <g className="rd-swarm-me">
          <circle cx={mine.x} cy={mid + mine.y} r={r + 2.5}><title>{`${mine.name} ${fmt(mine.v)}`}</title></circle>
          <text x={nameAt(mine.x).x} y={mid + mine.y - 7} textAnchor={nameAt(mine.x).anchor}>{mine.name}</text>
        </g>
      )}
      {hollow && (
        <g className="rd-swarm-me is-ghost">
          <circle cx={hollow.x} cy={mid} r={r + 2.5}><title>{`${hollow.name} ${fmt(hollow.v)}（出场不够门槛，不参加排名）`}</title></circle>
          <text x={nameAt(hollow.x).x} y={mid - 7} textAnchor={nameAt(hollow.x).anchor}>{hollow.name}</text>
        </g>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ the radar in miniature */

export function MiniRadar({ axes, selected, size = 34 }: { axes: Axis[]; selected: number | null; size?: number }) {
  const n = axes.length
  const R = size / 2 - 2
  const cx = size / 2, cy = size / 2 + 1
  const at = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  }
  const pts = (f: (i: number) => number) => axes.map((_, i) => at(i, f(i)).join(',')).join(' ')
  const sel = selected != null && axes[selected]?.pct != null ? at(selected, R * Math.max(0.025, axes[selected].pct!)) : null
  return (
    <svg className="rd-mini" width={size} height={size} aria-hidden>
      <polygon points={pts(() => R)} className="rd-ring" />
      <polygon points={pts(() => R / 2)} className="rd-mid" />
      <polygon points={pts((i) => R * Math.max(0.025, axes[i].pct ?? 0))} className="rd-shape" />
      {sel && <circle cx={sel[0]} cy={sel[1]} r={2.4} className="rd-mini-sel" />}
    </svg>
  )
}

/* ------------------------------------------------------------------ the ⓘ that holds a line of text */

export function Info({ text }: { text: string | null | undefined }) {
  if (!text) return null
  return <span className="rd-info" title={text} aria-label={text}>ⓘ</span>
}

/** True once the element has scrolled up out of view: the radar's bar then takes its place at the top. */
export function useScrolledPast(ref: RefObject<HTMLElement | null>, ready: unknown) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const check = () => {
      const el = ref.current
      setPast(!!el && el.getBoundingClientRect().bottom < 0)
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [ref, ready])
  return past
}
