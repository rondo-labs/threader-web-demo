// PROTOTYPE: small charts the shell variants share. Thin marks; the analysis object in team green, the rest of
// the league in grey, the one picked thing in thread red. Hover titles stand in for tooltips.
import { Markings, X, Y } from '../../match-analysis/Pitch'

/** Every team in the league as a dot on one line; the analysis object stands out, the tick is the league mean. */
export function Strip({ rows, highlight, mean, label, width = 220 }: {
  rows: { teamId: string; v: number; name: string }[]; highlight: string; mean: number; label: (v: number) => string; width?: number
}) {
  const vs = rows.map((r) => r.v)
  const lo = Math.min(...vs), hi = Math.max(...vs)
  const x = (v: number) => (hi === lo ? width / 2 : 6 + ((v - lo) / (hi - lo)) * (width - 12))
  const me = rows.find((r) => r.teamId === highlight)
  return (
    <svg className="sh-strip" width={width} height={24} role="img" aria-label="联赛分布">
      <line x1={6} x2={width - 6} y1={12} y2={12} className="sh-axis" />
      <line x1={x(mean)} x2={x(mean)} y1={5} y2={19} className="sh-mean"><title>{`联赛平均 ${label(mean)}`}</title></line>
      {rows.filter((r) => r.teamId !== highlight).map((r) => (
        <circle key={r.teamId} cx={x(r.v)} cy={12} r={3} className="sh-dot"><title>{`${r.name} ${label(r.v)}`}</title></circle>
      ))}
      {me && <circle cx={x(me.v)} cy={12} r={4.5} className="sh-dot-me"><title>{`${me.name} ${label(me.v)}`}</title></circle>}
    </svg>
  )
}

/** One bar per match, in date order; the line is the league's per-match mean. */
export function MatchBars({ values, labels, mean, selected, onPick, width = 520, height = 96, marks }: {
  values: (number | null)[]; labels: string[]; mean: number; selected?: number | null; onPick?: (i: number) => void
  width?: number; height?: number; marks?: boolean[]
}) {
  const n = values.length
  const max = Math.max(1, mean, ...values.map((v) => v ?? 0))
  const pad = 24, top = 8, bottom = 18
  const slot = (width - pad) / Math.max(1, n)
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom)
  return (
    <svg className="sh-bars" width={width} height={height} role="img" aria-label="每场的数值">
      <text x={0} y={top + 4} className="sh-tick">{Math.round(max)}</text>
      <text x={0} y={height - bottom} className="sh-tick">0</text>
      {values.map((v, i) => (
        <g key={i} className={`sh-bar${selected === i ? ' is-sel' : ''}${onPick ? ' is-pick' : ''}`} onClick={onPick ? () => onPick(i) : undefined}>
          <title>{`${labels[i]}：${v ?? '—'}`}</title>
          <rect className="hit" x={pad + i * slot} y={top} width={slot} height={height - top - bottom} />
          {v != null && <rect className="bar" x={pad + i * slot + slot * 0.18} y={y(v)} width={slot * 0.64} height={Math.max(0.5, y(0) - y(v))} rx={1} />}
          {marks?.[i] && <circle className="sh-video" cx={pad + i * slot + slot / 2} cy={top - 3} r={2.5}><title>有视频</title></circle>}
        </g>
      ))}
      <line className="sh-mean" x1={pad} x2={width} y1={y(mean)} y2={y(mean)}><title>{`联赛场均 ${mean.toFixed(1)}`}</title></line>
      {[0, Math.floor(n / 2), n - 1].filter((i, k, a) => n && a.indexOf(i) === k).map((i, k, a) => (
        <text key={i} x={k === 0 ? pad : k === a.length - 1 ? width : pad + i * slot + slot / 2} y={height - 4} className="sh-tick"
          textAnchor={k === 0 ? 'start' : k === a.length - 1 ? 'end' : 'middle'}>{labels[i].split(' ')[0]}</text>
      ))}
    </svg>
  )
}

/** Rank after each round, stage by stage; first place on top. */
export function RankLine({ parts, width = 560, height = 150 }: {
  parts: { stage: string; size: number; points: [number, number, number][] }[]; width?: number; height?: number
}) {
  const weeks = parts.reduce((s, p) => s + p.points.length, 0)
  const gap = 18, left = 26, top = 18, bottom = 18
  const step = (width - left - gap * (parts.length - 1)) / Math.max(1, weeks - 1)
  let cursor = left
  return (
    <svg className="sh-rank" width={width} height={height} role="img" aria-label="排名走势">
      {parts.map((p) => {
        const x0 = cursor
        const y = (r: number) => top + ((r - 1) / Math.max(1, p.size - 1)) * (height - top - bottom)
        const pts = p.points.map(([w, r, pts], i) => ({ x: x0 + i * step, y: y(r), w, r, pts }))
        cursor = x0 + (p.points.length - 1) * step + gap + step
        const last = pts[pts.length - 1]
        return (
          <g key={p.stage}>
            <text x={x0} y={10} className="sh-tick">{p.stage}</text>
            <line className="sh-axis" x1={x0} x2={last?.x ?? x0} y1={y(1)} y2={y(1)} />
            <line className="sh-axis" x1={x0} x2={last?.x ?? x0} y1={y(p.size)} y2={y(p.size)} />
            <text x={x0 - 4} y={y(1) + 4} className="sh-tick" textAnchor="end">1</text>
            <text x={x0 - 4} y={y(p.size) + 4} className="sh-tick" textAnchor="end">{p.size}</text>
            <polyline className="sh-line" points={pts.map((q) => `${q.x},${q.y}`).join(' ')} />
            {pts.map((q) => (
              <circle key={q.w} cx={q.x} cy={q.y} r={2.5} className="sh-line-dot"><title>{`第 ${q.w} 轮后 第 ${q.r} 名 · ${q.pts} 分`}</title></circle>
            ))}
            {last && <text x={last.x + 6} y={last.y + 4} className="sh-end">{`第 ${last.r}`}</text>}
          </g>
        )
      })}
    </svg>
  )
}

/** A ranking as horizontal bars. */
export function HBars({ rows, format, max }: { rows: { key: string; label: string; v: number; sub?: string; mark?: boolean; href?: string }[]; format: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.v), 1)
  return (
    <ol className="sh-hbars">
      {rows.map((r, i) => (
        <li key={r.key} className={r.mark ? 'is-mark' : ''}>
          <span className="t-numeric sh-hb-rank">{i + 1}</span>
          {r.href ? <a href={r.href} className="sh-hb-label">{r.label}</a> : <span className="sh-hb-label">{r.label}</span>}
          <span className="sh-hb-track"><span className="sh-hb-bar" style={{ width: `${(r.v / top) * 100}%` }} /></span>
          <span className="t-numeric">{format(r.v)}</span>
          <span className="t-caption sh-hb-sub">{r.sub ?? ''}</span>
        </li>
      ))}
    </ol>
  )
}

/** The attacking half with dots, e.g. where corners came down. */
export function PitchDots({ dots, half = true, big }: { dots: { x: number; y: number; label: string; hot?: boolean }[]; half?: boolean; big?: boolean }) {
  const vb = half ? `${X(50) - 1} -2.5 ${X(100) - X(50) + 4.5} 73` : '-2.5 -2.5 110 73'
  return (
    <svg viewBox={vb} className={`pz pz-full sh-pitch${big ? ' is-big' : ''}`} role="img" aria-label="落点">
      <Markings />
      {dots.map((d, i) => (
        <circle key={i} cx={X(d.x)} cy={Y(d.y)} r={d.hot ? 1.3 : 0.95} className={`sh-pdot${d.hot ? ' is-hot' : ''}`}><title>{d.label}</title></circle>
      ))}
    </svg>
  )
}

export function Form({ list }: { list: { r: '胜' | '平' | '负'; title: string; href?: string | null }[] }) {
  return (
    <span className="sh-form">
      {list.map((f, i) =>
        f.href ? (
          <a key={i} href={f.href} className={`sh-res r-${f.r}`} title={f.title}>{f.r}</a>
        ) : (
          <span key={i} className={`sh-res r-${f.r}`} title={f.title}>{f.r}</span>
        ),
      )}
    </span>
  )
}
