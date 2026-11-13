// Small charts of the team pages. Thin marks; the analysis object in team green, the rest of the league in grey,
// the one picked thing in thread red. Hover titles carry the exact values.

/** Every team in the league as a dot on one line; the analysis object stands out, the tick is the league mean. */
export function Strip({ rows, highlight, mean, label, width = 200 }: {
  rows: { teamId: string; v: number; name: string }[]; highlight: string; mean: number; label: (v: number) => string; width?: number
}) {
  if (!rows.length) return null
  const vs = rows.map((r) => r.v)
  const lo = Math.min(...vs), hi = Math.max(...vs)
  const x = (v: number) => (hi === lo ? width / 2 : 6 + ((v - lo) / (hi - lo)) * (width - 12))
  const me = rows.find((r) => r.teamId === highlight)
  return (
    <svg className="tm-strip" width={width} height={24} role="img" aria-label="在联赛里的位置">
      <line x1={6} x2={width - 6} y1={12} y2={12} className="tm-axis" />
      <line x1={x(mean)} x2={x(mean)} y1={5} y2={19} className="tm-mean"><title>{`联赛平均 ${label(mean)}`}</title></line>
      {rows.filter((r) => r.teamId !== highlight).map((r) => (
        <circle key={r.teamId} cx={x(r.v)} cy={12} r={3} className="tm-dot"><title>{`${r.name} ${label(r.v)}`}</title></circle>
      ))}
      {me && <circle cx={x(me.v)} cy={12} r={4.5} className="tm-dot-me"><title>{`${me.name} ${label(me.v)}`}</title></circle>}
    </svg>
  )
}

/** One bar per analysed match, in date order. Matches the filter leaves out are faded; the line is the league mean. */
export function MatchBars({ values, labels, mean, meanLabel, keep, video, selected, onPick, format, width = 520, height = 104 }: {
  values: (number | null)[]; labels: string[]; mean: number; meanLabel: string; keep: boolean[]; video: boolean[]
  selected: number | null; onPick: (i: number) => void; format: (v: number) => string; width?: number; height?: number
}) {
  const n = values.length
  const max = Math.max(mean, ...values.map((v) => v ?? 0)) || 1
  const pad = 28, top = 12, bottom = 18
  const slot = (width - pad) / Math.max(1, n)
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom)
  const ticks = [0, Math.floor(n / 2), n - 1].filter((i, k, a) => n > 0 && a.indexOf(i) === k)
  return (
    <svg className="tm-bars" width={width} height={height} role="img" aria-label="每场的数值">
      <text x={0} y={top + 4} className="tm-tick">{format(max)}</text>
      <text x={0} y={height - bottom} className="tm-tick">0</text>
      {values.map((v, i) => (
        <g key={i} className={`tm-bar${selected === i ? ' is-sel' : ''}${keep[i] ? '' : ' is-out'}`} onClick={() => onPick(i)}>
          <title>{`${labels[i]}：${v == null ? '—' : format(v)}${video[i] ? '（有视频）' : ''}`}</title>
          <rect className="hit" x={pad + i * slot} y={0} width={slot} height={height - bottom} />
          {v != null && <rect className="bar" x={pad + i * slot + slot * 0.18} y={y(v)} width={slot * 0.64} height={Math.max(0.5, y(0) - y(v))} rx={1} />}
          {video[i] && <circle className="tm-video" cx={pad + i * slot + slot / 2} cy={5} r={2.5} />}
        </g>
      ))}
      <line className="tm-mean" x1={pad} x2={width} y1={y(mean)} y2={y(mean)}><title>{`联赛平均 ${meanLabel}`}</title></line>
      {ticks.map((i, k) => (
        <text key={i} x={k === 0 ? pad : k === ticks.length - 1 ? width : pad + i * slot + slot / 2} y={height - 4} className="tm-tick"
          textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}>{labels[i].split(' ')[0]}</text>
      ))}
    </svg>
  )
}

/** Rank after each round, stage by stage; first place on top. */
export function RankLine({ parts, width = 640, height = 150 }: {
  parts: { label: string; size: number; points: [number, number, number][] }[]; width?: number; height?: number
}) {
  const shown = parts.filter((p) => p.points.length)
  const rounds = shown.reduce((s, p) => s + p.points.length, 0)
  const gap = 28, left = 26, top = 20, bottom = 16, right = 44
  const step = (width - left - right - gap * (shown.length - 1)) / Math.max(1, rounds - shown.length)
  let cursor = left
  return (
    <svg className="tm-rank" width={width} height={height} role="img" aria-label="排名走势">
      {shown.map((p) => {
        const x0 = cursor
        const y = (r: number) => top + ((r - 1) / Math.max(1, p.size - 1)) * (height - top - bottom)
        const pts = p.points.map(([w, r, pts], i) => ({ x: x0 + i * step, y: y(r), w, r, pts }))
        const last = pts[pts.length - 1]
        cursor = last.x + gap
        return (
          <g key={p.label}>
            <text x={x0} y={10} className="tm-tick">{p.label}</text>
            <line className="tm-axis" x1={x0} x2={last.x} y1={y(1)} y2={y(1)} />
            <line className="tm-axis" x1={x0} x2={last.x} y1={y(p.size)} y2={y(p.size)} />
            <text x={x0 - 4} y={y(1) + 4} className="tm-tick" textAnchor="end">1</text>
            <text x={x0 - 4} y={y(p.size) + 4} className="tm-tick" textAnchor="end">{p.size}</text>
            <polyline className="tm-line" points={pts.map((q) => `${q.x},${q.y}`).join(' ')} />
            {pts.map((q) => (
              <circle key={q.w} cx={q.x} cy={q.y} r={2.5} className="tm-line-dot"><title>{`第 ${q.w} 轮后 第 ${q.r} 名 · ${q.pts} 分`}</title></circle>
            ))}
            <text x={last.x + 6} y={last.y + 4} className="tm-end">{`第 ${last.r}`}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function Form({ list }: { list: { r: '胜' | '平' | '负'; title: string; href?: string | null }[] }) {
  return (
    <span className="tm-form">
      {list.map((f, i) =>
        f.href ? (
          <a key={i} href={f.href} className={`tm-res r-${f.r}`} title={f.title}>{f.r}</a>
        ) : (
          <span key={i} className={`tm-res r-${f.r}`} title={f.title}>{f.r}</span>
        ),
      )}
    </span>
  )
}
