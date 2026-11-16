// PROTOTYPE: /players/ — every player of one league and position group in a quadrant chart, next to the ranking
// table (click a row: the chart picks him out). Both axes can be any reading; each group starts on its own pair.
import { useEffect, useMemo, useState } from 'react'
import { CHAPTERS } from '../../match-analysis/common'
import { Quadrant, type QPoint } from './charts'
import {
  AXIS_SKIP, BIO_AXES, DEFAULT_AXES, FOCUS_LEAGUE, LEAGUES, PFILTERS, axisOf, axisValue, fmtAxis, fmtInt, loadPlayers, mainPlace, median,
  minutesOf, nameOf, placesLine, playerHref, shortName, teamHref, type PFilter, type Season,
} from './data'
import { ProtoNav, SearchBox } from './parts'

const SHARES = [1 / 6, 1 / 3, 1 / 2, 2 / 3]
const FULL: Record<PFilter, number> = { all: 2700, home: 1350, away: 1350, last5: 450 }

function setParams(p: Record<string, string | null>) {
  const url = new URL(location.href)
  for (const [k, v] of Object.entries(p)) {
    if (v == null) url.searchParams.delete(k)
    else url.searchParams.set(k, v)
  }
  history.replaceState(null, '', url)
}

export function PlayersIndex() {
  const q = new URLSearchParams(location.search)
  const [league, setLeague] = useState(q.get('league') ?? FOCUS_LEAGUE)
  const [S, setS] = useState<Season | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState(q.get('group') ?? '中场')
  const [filter, setFilter] = useState<PFilter>((q.get('filter') as PFilter) ?? 'all')
  const [share, setShare] = useState(Number(q.get('share') ?? 1))
  const [axes, setAxes] = useState<[string, string]>(() => {
    const d = DEFAULT_AXES[q.get('group') ?? '中场']
    return [q.get('x') ?? d[0], q.get('y') ?? d[1]]
  })
  const [hl, setHl] = useState<string | null>(q.get('hl'))
  const [sel, setSel] = useState<string | null>(q.get('sel'))
  const [sort, setSort] = useState<'x' | 'y' | 'min' | 'age'>('x')

  useEffect(() => {
    setS(null)
    loadPlayers(league).then((s) => {
      setS(s)
      setHl((h) => (h && s.lg.teams[h] ? h : s.lg.focusTeam))
    }).catch((e: Error) => setError(e.message))
  }, [league])
  useEffect(() => {
    setParams({ league, group, filter: filter === 'all' ? null : filter, x: axes[0], y: axes[1], hl, sel, share: share === 1 ? null : String(share) })
    document.title = '原型 · 球员'
  }, [league, group, filter, axes, hl, sel, share])

  const thr = Math.round(FULL[filter] * SHARES[share])
  const view = useMemo(() => {
    if (!S) return null
    const ids = Object.keys(S.lg.players).filter((id) => S.lg.players[id].group === group)
    const shown = ids.filter((id) => minutesOf(S, id, filter) >= thr)
    const pts: QPoint[] = []
    for (const id of shown) {
      const x = axisValue(S, id, axes[0], filter), y = axisValue(S, id, axes[1], filter)
      if (x == null || y == null) continue
      const p = S.lg.players[id]
      const tid = p.teams.at(-1)!
      pts.push({ id, x, y, name: nameOf(p), team: S.lg.teams[tid].nameZh, hl: !!hl && tid === hl })
    }
    const rankBy = (vals: Map<string, number>) => {
      const order = [...vals.entries()].sort((a, b) => b[1] - a[1])
      return new Map(order.map(([id], i) => [id, i + 1]))
    }
    const xr = rankBy(new Map(pts.map((p) => [p.id, p.x])))
    const yr = rankBy(new Map(pts.map((p) => [p.id, p.y])))
    return { pts, below: ids.length - shown.length, xr, yr, xMed: median(pts.map((p) => p.x)), yMed: median(pts.map((p) => p.y)) }
  }, [S, group, filter, thr, axes, hl])

  if (error) return <p className="boot">{`数据没有加载出来（${error}）。先在 web/ 下运行 pnpm prototype:players。`}</p>
  const counts = S ? Object.fromEntries(S.lg.groups.map((g) => [g, Object.keys(S.lg.players).filter((id) => S.lg.players[id].group === g && minutesOf(S, id, filter) >= thr).length])) : {}
  const ax = S ? axisOf(S, axes[0]) : null, ay = S ? axisOf(S, axes[1]) : null
  const pick = (id: string) => setSel(id === sel ? null : id)
  const rows = view ? [...view.pts].sort((a, b) => {
    if (sort === 'x') return b.x - a.x
    if (sort === 'y') return b.y - a.y
    if (sort === 'min') return minutesOf(S!, b.id, filter) - minutesOf(S!, a.id, filter)
    return (S!.lg.players[a.id].age ?? 99) - (S!.lg.players[b.id].age ?? 99)
  }) : []
  const selP = S && sel ? S.lg.players[sel] : null
  return (
    <div className="pi">
      <ProtoNav />
      <header className="pi-head">
        <h1 className="t-display">球员</h1>
        <div className="seg" role="group" aria-label="联赛">
          {LEAGUES.map((l) => (
            <button key={l.slug} aria-pressed={league === l.slug} onClick={() => { setLeague(l.slug); setSel(null); setHl(null) }}>{l.zh}</button>
          ))}
        </div>
        <span className="pi-gap" />
        <SearchBox />
      </header>
      {!S || !view || !ax || !ay ? <p className="boot">加载中…</p> : (
        <>
          <div className="pi-controls">
            <div className="seg" role="group" aria-label="位置">
              {S.lg.groups.map((g) => (
                <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setAxes(DEFAULT_AXES[g]); setSel(null) }}>
                  {g} <span className="pi-count">{counts[g]}</span>
                </button>
              ))}
            </div>
            <div className="seg seg-sm" role="group" aria-label="哪些比赛">
              {PFILTERS.map(([k, zh]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{zh}</button>)}
            </div>
            <label className="pi-select">
              <span className="t-label">门槛</span>
              <select value={share} onChange={(e) => setShare(Number(e.target.value))}>
                {SHARES.map((s, i) => <option key={i} value={i}>{`出场 ≥ ${fmtInt(Math.round(FULL[filter] * s))} 分钟`}</option>)}
              </select>
            </label>
            <label className="pi-select">
              <span className="t-label">标出</span>
              <select value={hl ?? ''} onChange={(e) => setHl(e.target.value || null)}>
                <option value="">不标</option>
                {Object.entries(S.lg.teams).sort((a, b) => a[1].nameZh.localeCompare(b[1].nameZh, 'zh')).map(([id, t]) => <option key={id} value={id}>{t.nameZh}</option>)}
              </select>
            </label>
            {hl && <a className="pi-team-link" href={teamHref(hl, { tab: 'lineup' })}>{`${S.lg.teams[hl].nameZh}的阵容 →`}</a>}
          </div>

          <main className="pi-main">
            <section className="pi-chart">
              <div className="pi-axes">
                <AxisSelect S={S} label="横轴" value={axes[0]} onChange={(k) => setAxes([k, axes[1]])} />
                <AxisSelect S={S} label="纵轴" value={axes[1]} onChange={(k) => setAxes([axes[0], k])} />
                <button className="btn" onClick={() => setAxes([axes[1], axes[0]])}>对调</button>
                {(axes[0] !== DEFAULT_AXES[group][0] || axes[1] !== DEFAULT_AXES[group][1]) && (
                  <button className="btn-quiet" onClick={() => setAxes(DEFAULT_AXES[group])}>回到这组默认</button>
                )}
              </div>
              <Quadrant
                points={view.pts} xLabel={ax.label} yLabel={ay.label} xWords={ax.words} yWords={ay.words} xShort={ax.short} yShort={ay.short}
                xMed={view.xMed} yMed={view.yMed} fmtX={(v) => fmtAxis(S, axes[0], v)} fmtY={(v) => fmtAxis(S, axes[1], v)}
                selected={sel} onPick={pick}
              />
              <p className="t-caption pi-note">
                {`${S.lg.nameZh} · ${group} · 出场满 ${fmtInt(thr)} 分钟的 ${view.pts.length} 人。虚线是这 ${view.pts.length} 人的中位数，四个角只说多少，不分好坏。`}
                {view.below ? `另有 ${view.below} 人分钟不够，不在图上（搜名字能找到）。` : ''}
              </p>
              {selP && sel && (
                <div className="pi-card">
                  <div>
                    <span className="t-heading">{`${selP.number != null ? `#${selP.number} ` : ''}${nameOf(selP)}`}</span>
                    <span className="t-caption">{` · ${S.lg.teams[selP.teams.at(-1)!].nameZh} · ${placesLine(selP.pos, 2)}${selP.age ? ` · ${selP.age} 岁` : ''}${selP.height ? ` · ${selP.height} 厘米` : ''}`}</span>
                  </div>
                  <div className="t-caption">
                    {`${ax.short}：${fmtAxis(S, axes[0], axisValue(S, sel, axes[0], filter))}（第 ${view.xr.get(sel) ?? '—'}/${view.pts.length}） · ${ay.short}：${fmtAxis(S, axes[1], axisValue(S, sel, axes[1], filter))}（第 ${view.yr.get(sel) ?? '—'}/${view.pts.length}）`}
                  </div>
                  <a href={playerHref(sel, league)}>打开球员页 →</a>
                </div>
              )}
            </section>

            <section className="pi-table-wrap">
              <table className="tm-table pi-table">
                <thead>
                  <tr>
                    <th className="t-label">#</th>
                    <th className="t-label">球员</th>
                    <th className="t-label">球队</th>
                    <th className="t-label is-sort" aria-sort={sort === 'age' ? 'ascending' : undefined} onClick={() => setSort('age')}>年龄</th>
                    <th className="t-label is-sort" aria-sort={sort === 'min' ? 'descending' : undefined} onClick={() => setSort('min')}>分钟</th>
                    <th className="t-label is-sort" aria-sort={sort === 'x' ? 'descending' : undefined} onClick={() => setSort('x')} title={ax.label}>{ax.short}</th>
                    <th className="t-label is-sort" aria-sort={sort === 'y' ? 'descending' : undefined} onClick={() => setSort('y')} title={ay.label}>{ay.short}</th>
                    <th className="t-label">主要位置</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const p = S.lg.players[r.id]
                    return (
                      <tr key={r.id} className={`${r.id === sel ? 'is-selected' : ''}${r.hl ? ' is-hl' : ''}`} onClick={() => pick(r.id)}>
                        <td className="t-numeric pi-rank">{i + 1}</td>
                        <td><a href={playerHref(r.id, league)} onClick={(e) => e.stopPropagation()}>{`${p.number != null ? `${p.number} ` : ''}${nameOf(p)}`}</a></td>
                        <td className="t-caption">{r.team}</td>
                        <td className="t-numeric">{p.age ?? '—'}</td>
                        <td className="t-numeric">{fmtInt(minutesOf(S, r.id, filter))}</td>
                        <td className="t-numeric">{fmtAxis(S, axes[0], r.x)}<span className="pi-r">{view.xr.get(r.id)}</span></td>
                        <td className="t-numeric">{fmtAxis(S, axes[1], r.y)}<span className="pi-r">{view.yr.get(r.id)}</span></td>
                        <td className="t-caption">{mainPlace(p.pos)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          </main>
        </>
      )}
    </div>
  )
}

function AxisSelect({ S, label, value, onChange }: { S: Season; label: string; value: string; onChange: (k: string) => void }) {
  return (
    <label className="pi-select">
      <span className="t-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <optgroup label="档案">
          {BIO_AXES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </optgroup>
        {CHAPTERS.map((c) => (
          <optgroup key={c.key} label={c.zh}>
            {S.lg.metrics.filter((m) => m.chapter === c.key && !AXIS_SKIP.has(m.key)).map((m) => (
              <option key={m.key} value={m.key}>{`${shortName(S, m)}${m.format === 'int' ? ' / 90' : ''}`}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
