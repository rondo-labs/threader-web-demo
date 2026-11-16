// /players/?league=&group=&filter=&share=&x=&y=&hl=&sel=: the 球员 entry. One league's position group in a quadrant
// chart (any two readings, each group opening on its own pair), next to the ranking table: click a row and the
// chart picks him out. Only players above the minutes threshold take part; search finds anyone.
import { useEffect, useMemo, useState } from 'react'
import { Nav } from '../app/Nav'
import { loadIndex } from '../team/data'
import { CHAPTERS } from '../match-analysis/common'
import { Quadrant, type QPoint } from './charts'
import {
  BIO_AXES, DEFAULT_AXES, FILTERS, FOCUS_LEAGUE, LEAGUES, REPEATS, axisOf, axisValue, fmtAxis, fmtInt, isAxis, mainPlace, median, minutesOf,
  nameOf, placesLine, playerHref, shortName, teamPageHref, useSeason, type Filter, type Season,
} from './data'
import { SearchBox } from './SearchBox'

const SHARES = [1 / 6, 1 / 3, 1 / 2, 2 / 3]
const FULL: Record<Filter, number> = { all: 2700, home: 1350, away: 1350, last5: 450 }

function readUrl() {
  const q = new URLSearchParams(location.search)
  const league = LEAGUES.some((l) => l.slug === q.get('league')) ? q.get('league')! : FOCUS_LEAGUE
  const group = q.get('group') && DEFAULT_AXES[q.get('group')!] ? q.get('group')! : '中场'
  const filter = (FILTERS.find(([k]) => k === q.get('filter'))?.[0] ?? 'all') as Filter
  const share = Number(q.get('share') ?? 1)
  return { league, group, filter, share: share >= 0 && share < SHARES.length ? share : 1, x: q.get('x'), y: q.get('y'), hl: q.get('hl'), sel: q.get('sel') }
}

export function PlayersIndex() {
  const init = useMemo(readUrl, [])
  const [league, setLeague] = useState(init.league)
  const [group, setGroup] = useState(init.group)
  const [filter, setFilter] = useState<Filter>(init.filter)
  const [share, setShare] = useState(init.share)
  const [axes, setAxes] = useState<[string, string]>([init.x ?? DEFAULT_AXES[init.group][0], init.y ?? DEFAULT_AXES[init.group][1]])
  const [hl, setHl] = useState<string | null>(init.hl)
  // Until someone picks a team (or the link names one), the league's focus team is the one picked out.
  const [hlChosen, setHlChosen] = useState(init.hl != null)
  const [sel, setSel] = useState<string | null>(init.sel)
  const [sort, setSort] = useState<'x' | 'y' | 'min' | 'age'>('x')
  const { S, shown, error } = useSeason(league, filter)

  useEffect(() => {
    if (S && (!isAxis(S, axes[0]) || !isAxis(S, axes[1]))) setAxes(DEFAULT_AXES[group])
  }, [S, axes, group])
  useEffect(() => {
    if (hlChosen) return
    const zh = LEAGUES.find((l) => l.slug === league)?.zh
    loadIndex().then((ix) => setHl(ix.focusTeams.find((t) => t.league === zh)?.id ?? null)).catch(() => setHl(null))
  }, [league, hlChosen])
  useEffect(() => {
    const url = new URL(location.href)
    const set = (k: string, v: string | null) => (v == null ? url.searchParams.delete(k) : url.searchParams.set(k, v))
    set('league', league)
    set('group', group)
    set('filter', filter === 'all' ? null : filter)
    set('share', share === 1 ? null : String(share))
    set('x', axes[0] === DEFAULT_AXES[group][0] ? null : axes[0])
    set('y', axes[1] === DEFAULT_AXES[group][1] ? null : axes[1])
    set('hl', hl)
    set('sel', sel)
    history.replaceState(null, '', url)
    document.title = '球员 · Threader'
  }, [league, group, filter, share, axes, hl, sel])

  const f = shown
  const thr = Math.round(FULL[f] * SHARES[share])
  const view = useMemo(() => {
    if (!S || !isAxis(S, axes[0]) || !isAxis(S, axes[1])) return null
    const ids = Object.keys(S.meta.players).filter((id) => S.meta.players[id].group === group)
    const shownIds = ids.filter((id) => minutesOf(S, id, f) >= thr)
    const pts: QPoint[] = []
    for (const id of shownIds) {
      const x = axisValue(S, id, axes[0], f), y = axisValue(S, id, axes[1], f)
      if (x == null || y == null) continue
      const p = S.meta.players[id]
      const tid = p.teams.at(-1)!
      pts.push({ id, x, y, name: nameOf(p), team: S.meta.teams[tid], hl: !!hl && tid === hl })
    }
    const rankBy = (pick: (p: QPoint) => number) => new Map([...pts].sort((a, b) => pick(b) - pick(a)).map((p, i) => [p.id, i + 1]))
    return { pts, below: ids.length - shownIds.length, xr: rankBy((p) => p.x), yr: rankBy((p) => p.y), xMed: median(pts.map((p) => p.x)), yMed: median(pts.map((p) => p.y)) }
  }, [S, group, f, thr, axes, hl])

  if (error) return <div className="pi"><Nav active="players" /><p className="boot">{`球员数据没有加载出来（${error}）。`}</p></div>
  const ax = S && view ? axisOf(S, axes[0]) : null, ay = S && view ? axisOf(S, axes[1]) : null
  const counts = S ? Object.fromEntries(S.meta.groups.map((g) => [g, Object.keys(S.meta.players).filter((id) => S.meta.players[id].group === g && minutesOf(S, id, f) >= thr).length])) : {}
  const pick = (id: string) => setSel(id === sel ? null : id)
  const rows = S && view ? [...view.pts].sort((a, b) => {
    if (sort === 'x') return b.x - a.x
    if (sort === 'y') return b.y - a.y
    if (sort === 'min') return minutesOf(S, b.id, f) - minutesOf(S, a.id, f)
    return (S.meta.players[a.id].age ?? 99) - (S.meta.players[b.id].age ?? 99)
  }) : []
  const selP = S && sel ? S.meta.players[sel] : null
  return (
    <div className="pi">
      <Nav active="players" />
      <header className="pi-head">
        <h1 className="t-display">球员</h1>
        <div className="seg" role="group" aria-label="联赛">
          {LEAGUES.map((l) => (
            <button key={l.slug} aria-pressed={league === l.slug} onClick={() => { setLeague(l.slug); setSel(null); setHl(null); setHlChosen(false) }}>{l.zh}</button>
          ))}
        </div>
        <span className="pi-gap" />
        <SearchBox />
      </header>
      {!S || !view || !ax || !ay ? <p className="boot">加载中…</p> : (
        <>
          <div className="pi-controls">
            <div className="seg" role="group" aria-label="位置">
              {S.meta.groups.map((g) => (
                <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setAxes(DEFAULT_AXES[g]); setSel(null) }}>
                  {g} <span className="pi-count">{counts[g]}</span>
                </button>
              ))}
            </div>
            <div className="seg seg-sm" role="group" aria-label="哪些比赛">
              {FILTERS.map(([k, zh]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{zh}</button>)}
            </div>
            <label className="pi-select">
              <span className="t-label">门槛</span>
              <select value={share} onChange={(e) => setShare(Number(e.target.value))}>
                {SHARES.map((s, i) => <option key={i} value={i}>{`出场 ≥ ${fmtInt(Math.round(FULL[f] * s))} 分钟`}</option>)}
              </select>
            </label>
            <label className="pi-select">
              <span className="t-label">标出</span>
              <select value={hl ?? ''} onChange={(e) => { setHl(e.target.value || null); setHlChosen(true) }}>
                <option value="">不标</option>
                {Object.entries(S.meta.teams).sort((a, b) => a[1].localeCompare(b[1], 'zh')).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            {hl && <a className="pi-team-link" href={teamPageHref(hl, { tab: 'lineup' })}>{`${S.meta.teams[hl]}的阵容 →`}</a>}
            {filter !== f && <span className="t-caption">加载中…</span>}
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
                {`${S.meta.nameZh} · ${group} · 出场满 ${fmtInt(thr)} 分钟的 ${view.pts.length} 人。虚线是这 ${view.pts.length} 人的中位数，四个角只说多少，不分好坏。`}
                {view.below ? `另有 ${view.below} 人分钟不够，不在图上（搜名字能找到）。` : ''}
              </p>
              {selP && sel && (
                <div className="pi-card">
                  <div>
                    <span className="t-heading">{`${selP.number != null ? `#${selP.number} ` : ''}${nameOf(selP)}`}</span>
                    <span className="t-caption">{` · ${S.meta.teams[selP.teams.at(-1)!]} · ${placesLine(selP.places, 2)}${selP.age ? ` · ${selP.age} 岁` : ''}${selP.height ? ` · ${selP.height} 厘米` : ''}`}</span>
                  </div>
                  <div className="t-caption">
                    {`${ax.short}：${fmtAxis(S, axes[0], axisValue(S, sel, axes[0], f))}（第 ${view.xr.get(sel) ?? '—'}/${view.pts.length}） · ${ay.short}：${fmtAxis(S, axes[1], axisValue(S, sel, axes[1], f))}（第 ${view.yr.get(sel) ?? '—'}/${view.pts.length}）`}
                  </div>
                  <a href={playerHref(sel, { league })}>打开球员页 →</a>
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
                    const p = S.meta.players[r.id]
                    return (
                      <tr key={r.id} className={`${r.id === sel ? 'is-selected' : ''}${r.hl ? ' is-hl' : ''}`} onClick={() => pick(r.id)}>
                        <td className="t-numeric pi-rank">{i + 1}</td>
                        <td><a href={playerHref(r.id, { league })} onClick={(e) => e.stopPropagation()}>{`${p.number != null ? `${p.number} ` : ''}${nameOf(p)}`}</a></td>
                        <td className="t-caption">{r.team}</td>
                        <td className="t-numeric">{p.age ?? '—'}</td>
                        <td className="t-numeric">{fmtInt(minutesOf(S, r.id, f))}</td>
                        <td className="t-numeric">{fmtAxis(S, axes[0], r.x)}<span className="pi-r">{view.xr.get(r.id)}</span></td>
                        <td className="t-numeric">{fmtAxis(S, axes[1], r.y)}<span className="pi-r">{view.yr.get(r.id)}</span></td>
                        <td className="t-caption">{mainPlace(p.places)}</td>
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
            {S.meta.metrics.filter((m) => m.chapter === c.key && !REPEATS.has(m.key)).map((m) => (
              <option key={m.key} value={m.key}>{`${shortName(S, m)}${m.format === 'int' ? ' / 90' : ''}`}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
