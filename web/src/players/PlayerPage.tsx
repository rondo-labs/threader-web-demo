// /player/<id>/?league=&tab=<chapter | log>&filter=&focus=: one player's season, built like the team page. A header
// (squad facts included), the five readings where he stands out in his position group with a small quadrant chart,
// then the match page's six chapters and a match log. In a section the table is the filter; its chart is the season
// on one pitch with a strip of bars per appearance under it: pick a bar and the pitch draws only that match, hover
// either and the other lights up. Numbers with video play in the section, above its table.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Nav } from '../app/Nav'
import { CHAPTERS } from '../match-analysis/common'
import { AppBars, GroupStrip, Quadrant, SeasonPitch, type QPoint } from './charts'
import { ClipPlayer, buildClips, playable, type PPlaylist } from './ClipPlayer'
import {
  DEFAULT_AXES, FILTERS, LEAGUES, axisOf, axisValue, currentStint, fmtAxis, fmtInt, fmtValue, footLine, groupRank, isRanked, loadPlayer,
  matchPageHref, median, nameOf, peers, placesLine, playerHref, playersHref, reading, shortDate, shortName, standouts, summaryOf,
  teamPageHref, teamRank, useSeason, type Filter, type LeagueDetail, type PlayerFile, type PMetric, type Season,
} from './data'
import { SearchBox } from './SearchBox'

const CHAPTER_ZH: Record<string, string> = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.zh]))
const TABS = [...CHAPTERS.map((c) => c.key as string), 'log']

function readUrl() {
  const q = new URLSearchParams(location.search)
  const tab = q.get('tab')
  const filter = FILTERS.find(([k]) => k === q.get('filter'))?.[0] ?? 'all'
  return { league: q.get('league'), tab: tab && TABS.includes(tab) ? tab : 'overview', filter: filter as Filter, focus: q.get('focus') }
}

/** Which of his appearances a filter keeps: home, away, or his own last five. */
function keepOf(detail: LeagueDetail, f: Filter): boolean[] {
  const n = detail.apps.length
  return detail.apps.map((a, i) => (f === 'home' ? a.h : f === 'away' ? !a.h : f === 'last5' ? i >= n - 5 : true))
}

export function PlayerPage({ playerId }: { playerId: string }) {
  const init = useMemo(readUrl, [])
  const [file, setFile] = useState<PlayerFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [league, setLeague] = useState<string | null>(init.league)
  const [tab, setTab] = useState(init.tab)
  const [filter, setFilter] = useState<Filter>(init.filter)
  const [focus, setFocus] = useState<string | null>(init.focus)
  const [playlist, setPlaylist] = useState<PPlaylist | null>(null)

  useEffect(() => {
    loadPlayer(playerId)
      .then((f) => {
        setFile(f)
        // Without a league in the link: the one he played most minutes in.
        const most = Object.entries(f.leagues).sort((a, b) => b[1].apps.reduce((s, x) => s + x.min, 0) - a[1].apps.reduce((s, x) => s + x.min, 0))[0][0]
        setLeague((l) => (l && f.leagues[l] ? l : most))
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId])
  const { S, shown, error: seasonError } = useSeason(league, filter)
  useEffect(() => {
    const url = new URL(location.href)
    const set = (k: string, v: string | null) => (v == null ? url.searchParams.delete(k) : url.searchParams.set(k, v))
    set('league', file && league && Object.keys(file.leagues).length > 1 ? league : null)
    set('tab', tab === 'overview' ? null : tab)
    set('filter', filter === 'all' ? null : filter)
    set('focus', focus)
    history.replaceState(null, '', url)
    if (S) document.title = `${nameOf(S.meta.players[playerId])} · Threader`
  }, [league, tab, filter, focus, S, file, playerId])

  const failed = error ?? seasonError
  if (failed) return <div className="tm"><Nav active="players" /><p className="boot">{`球员没有加载出来（${failed}）。`}<a href="/players/">回到球员</a></p></div>
  const detail = file && league ? file.leagues[league] : null
  if (!S || !detail || S.meta.slug !== league || !S.meta.players[playerId]) return <div className="tm"><Nav active="players" /><p className="boot">加载中…</p></div>

  const p = S.meta.players[playerId]
  const stint = currentStint(S, playerId)
  const teamId = S.meta.stints[stint][1]
  const all = summaryOf(S, playerId, 'all')!
  const personal = (k: string) => reading(all, S.idx[`overview.personal.${k}`], S.meta.metrics[S.idx[`overview.personal.${k}`]]).total
  const foot = footLine(p)
  const isChapter = CHAPTERS.some((c) => c.key === tab)
  const others = p.teams.filter((t) => t !== teamId).map((t) => S.meta.teams[t])
  const teammates = (S.teamStints.get(teamId) ?? []).map((i) => ({ id: S.meta.stints[i][0], min: S.rows.all![i][0] })).sort((a, b) => b.min - a.min)
  const open = (title: string, evs: number[], owner: string, start?: number) => {
    const clips = buildClips(detail, evs)
    if (!clips.length) return
    const at = start != null ? clips.findIndex((c) => c.evs.includes(start)) : 0
    setPlaylist({ title, clips, index: Math.max(0, at), owner, opened: Date.now() })
  }
  return (
    <div className="tm pp">
      <Nav active="players" />
      <header className="tm-head pp-head">
        <div>
          <div className="t-caption">
            {`${S.meta.nameZh} · 2026 赛季 · `}
            <a href={teamPageHref(teamId)}>{S.meta.teams[teamId]}</a>
            {others.length ? ` · 赛季中从${others.join('、')}转来，同位置排名按两队合计` : ''}
          </div>
          <h1 className="t-display pp-name">
            {p.number != null && <span className="pp-num">{p.number}</span>}
            {nameOf(p)}
            {p.nameZh && <span className="pp-en">{p.nameEn}</span>}
          </h1>
          <div className="t-lead">{`${p.group} · ${placesLine(p.places, 3)} 分钟`}</div>
          {file && Object.keys(file.leagues).length > 1 && (
            <div className="seg seg-sm pp-leagues" role="group" aria-label="联赛">
              {LEAGUES.filter((l) => file.leagues[l.slug]).map((l) => (
                <button key={l.slug} aria-pressed={league === l.slug} onClick={() => { setLeague(l.slug); setPlaylist(null) }}>{`在${l.zh}`}</button>
              ))}
            </div>
          )}
        </div>
        <dl className="tm-record">
          <div><dt className="t-label">出场</dt><dd className="t-figure">{all[1]}</dd></div>
          <div><dt className="t-label">首发</dt><dd className="t-figure">{all[2]}</dd></div>
          <div><dt className="t-label">分钟</dt><dd className="t-figure">{fmtInt(all[0])}</dd></div>
          <div><dt className="t-label">进球</dt><dd className="t-figure">{personal('goals')}</dd></div>
          <div><dt className="t-label">助攻</dt><dd className="t-figure">{personal('assists')}</dd></div>
        </dl>
        <dl className="tm-record pp-bio">
          <div><dt className="t-label">年龄</dt><dd className="t-figure">{p.age ?? '—'}</dd></div>
          <div><dt className="t-label">身高</dt><dd className="t-figure">{p.height ?? '—'}</dd></div>
          <div><dt className="t-label">体重</dt><dd className="t-figure">{p.weight ?? '—'}</dd></div>
          <div>
            <dt className="t-label">惯用脚</dt>
            <dd className={foot?.note ? 'pp-fact is-inferred' : 'pp-fact'} title={foot?.note ?? undefined}>{foot ? foot.text : '—'}</dd>
          </div>
          {p.nat && p.nat !== '中国' && <div><dt className="t-label">国籍</dt><dd className="pp-fact">{p.nat}</dd></div>}
          {p.joined && <div><dt className="t-label">加盟</dt><dd className="pp-fact">{`${p.joined.slice(0, 4)} 年 ${Number(p.joined.slice(5, 7))} 月`}</dd></div>}
        </dl>
        <div className="tm-picker">
          <select value={playerId} onChange={(e) => location.assign(playerHref(e.target.value, tab === 'overview' ? {} : { tab }))} aria-label="同队球员">
            {teammates.map((t) => <option key={t.id} value={t.id}>{`${S.meta.players[t.id].number ?? ''} ${nameOf(S.meta.players[t.id])}`}</option>)}
          </select>
          <SearchBox />
        </div>
      </header>

      <Standouts S={S} pid={playerId} onPick={(m) => { setTab(m.chapter); setFilter('all'); setFocus(m.key) }} />

      <nav className="tabs tm-tabs" aria-label="章">
        {CHAPTERS.map((c) => (
          <button key={c.key} aria-current={tab === c.key} onClick={() => { setTab(c.key); setFocus(null); setPlaylist(null) }}>{c.zh}</button>
        ))}
        {isChapter && (
          <div className="seg seg-sm tm-filter" role="group" aria-label="哪些比赛">
            {FILTERS.map(([k, zh]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{zh}</button>)}
          </div>
        )}
        {isChapter && filter === 'last5' && <span className="t-caption">{`他最近出场的 5 场：${detail.apps.slice(-5).map((a) => shortDate(a.d)).join('、')}`}</span>}
        {isChapter && filter !== shown && <span className="t-caption">加载中…</span>}
        <span className="tm-tab-gap" />
        <button aria-current={tab === 'log'} onClick={() => setTab('log')}>比赛记录</button>
      </nav>

      <main className="tm-main">
        {tab === 'log' ? (
          <MatchLog teams={S.meta.teams} detail={detail} />
        ) : (
          sectionsOf(S, tab).map((s) => (
            <PSection
              key={`${playerId}-${league}-${tab}-${s.key}`} S={S} detail={detail} pid={playerId} stint={stint} filter={shown} section={s}
              focus={s.metrics.some((m) => m.key === focus) ? focus : null}
              playlist={playlist?.owner === s.key ? playlist : null}
              open={(title, evs, start) => open(title, evs, s.key, start)}
              go={(i) => setPlaylist((pl) => (pl && i >= 0 && i < pl.clips.length ? { ...pl, index: i } : pl))}
              close={() => setPlaylist(null)}
            />
          ))
        )}
      </main>
    </div>
  )
}

interface SectionDef { key: string; title: string; question: string | null; chapter: string; metrics: PMetric[] }
function sectionsOf(S: Season, chapter: string): SectionDef[] {
  const out: SectionDef[] = []
  for (const m of S.meta.metrics) {
    if (m.chapter !== chapter) continue
    let s = out.find((x) => x.key === m.section)
    if (!s) out.push((s = { key: m.section, title: m.sectionTitle, question: m.question, chapter, metrics: [] }))
    s.metrics.push(m)
  }
  return out
}

/* ------------------------------------------------------------------ under the header */

function Standouts({ S, pid, onPick }: { S: Season; pid: string; onPick: (m: PMetric) => void }) {
  const p = S.meta.players[pid]
  const list = standouts(S, pid)
  const [xk, yk] = DEFAULT_AXES[p.group] ?? DEFAULT_AXES['中场']
  const ax = axisOf(S, xk), ay = axisOf(S, yk)
  const pts: QPoint[] = []
  for (const id of peers(S, p.group, 'all')) {
    const x = axisValue(S, id, xk, 'all'), y = axisValue(S, id, yk, 'all')
    if (x == null || y == null) continue
    const q = S.meta.players[id]
    pts.push({ id, x, y, name: nameOf(q), team: S.meta.teams[q.teams.at(-1)!], hl: false })
  }
  const inPts = pts.some((x) => x.id === pid)
  const gx = axisValue(S, pid, xk, 'all'), gy = axisValue(S, pid, yk, 'all')
  const ghost = !inPts && gx != null && gy != null ? { id: pid, x: gx, y: gy, name: nameOf(p), team: '', hl: false } : null
  const all = summaryOf(S, pid, 'all')!
  return (
    <section className="tm-odd pp-odd">
      <div>
        <div className="t-label">{`和${S.meta.nameZh}其他${p.group}比，最突出的 5 项（整季，每 90 分钟）`}</div>
        {list.length ? (
          <div className="tm-tiles">
            {list.map((x) => {
              const g = groupRank(S, pid, x.m.key, 'all')
              return (
                <button key={x.m.key} className="tm-tile" onClick={() => onPick(x.m)}>
                  <span className="t-caption">{`${CHAPTER_ZH[x.m.chapter]} · ${x.m.sectionTitle}`}</span>
                  <span className="t-heading">{shortName(S, x.m)}</span>
                  <span className="t-figure">{fmtValue(x.m.format, x.value)}</span>
                  <span className="t-caption">{`${x.more ? '偏多' : '偏少'} · 第 ${x.rank}/${x.of} · 中位数 ${fmtValue(x.m.format, x.median)}`}</span>
                  <GroupStrip rows={g.rows} me={pid} mine={x.value} med={g.median} label={(v) => fmtValue(x.m.format, v)} nameOf={(id) => nameOf(S.meta.players[id])} width={160} />
                </button>
              )
            })}
          </div>
        ) : (
          <p className="t-lead pp-unranked">{`整季出场 ${fmtInt(all[0])} 分钟，不到 ${fmtInt(S.meta.thresholds.all)} 分钟，不和同位置排名。下面的数字照常给出。`}</p>
        )}
      </div>
      <div className="pp-mini">
        <div className="t-label">{`在${S.meta.nameZh}${p.group}里的位置`}</div>
        <Quadrant
          small width={300} height={196} points={pts} ghost={ghost} selected={pid}
          xLabel={ax.label} yLabel={ay.label} xWords={ax.words} yWords={ay.words} xShort={ax.short} yShort={ay.short}
          xMed={median(pts.map((q) => q.x))} yMed={median(pts.map((q) => q.y))} fmtX={(v) => fmtAxis(S, xk, v)} fmtY={(v) => fmtAxis(S, yk, v)}
        />
        <div className="t-caption pp-mini-axes">{`横：${ax.label}　纵：${ay.label}`}</div>
        <a className="t-caption" href={playersHref({ league: S.meta.slug, group: p.group, sel: pid, hl: p.teams.at(-1)! })}>换两项读数，看全组 →</a>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ one section */

function PSection({ S, detail, pid, stint, filter, section, focus, playlist, open, go, close }: {
  S: Season; detail: LeagueDetail; pid: string; stint: number; filter: Filter; section: SectionDef
  focus: string | null; playlist: PPlaylist | null
  open: (title: string, evs: number[], start?: number) => void; go: (i: number) => void; close: () => void
}) {
  const sum = summaryOf(S, pid, filter)
  const keep = useMemo(() => keepOf(detail, filter), [detail, filter])
  const visible = section.metrics.filter((m) => {
    const r = reading(sum, S.idx[m.key], m)
    return r.total > 0 || r.n > 0 || (groupRank(S, pid, m.key, filter).median ?? 0) > 0
  })
  const hidden = section.metrics.length - visible.length
  const first = visible.find((m) => m.format === 'int' && reading(sum, S.idx[m.key], m).total > 0) ?? visible[0]
  const [sel, setSel] = useState(focus ?? first?.key ?? section.metrics[0].key)
  const [pick, setPick] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focus) return
    setSel(focus)
    box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focus])
  useEffect(() => setPick(null), [filter])

  if (!visible.length) {
    return (
      <section className="tm-section pp-section is-empty">
        <div className="tm-sec-head"><h2 className="t-title">{section.title}</h2></div>
        <p className="t-caption">{`这一节的 ${section.metrics.length} 项他都是 0，同位置的人也很少做。`}</p>
      </section>
    )
  }
  const m = S.meta.metrics[S.idx[sel]] ?? visible[0]
  const series = detail.metrics[m.key]
  const kept = (key: string) => (detail.metrics[key]?.e ?? []).filter((i) => keep[detail.events[i][4]])
  const current = playlist ? new Set(playlist.clips[playlist.index]?.evs ?? []) : null
  const teamId = S.meta.stints[stint][1]

  // the bars: one value per appearance (rates: attempts, with the successes drawn inside)
  const perApp = detail.apps.map((_, i) => {
    const v = series?.n[i] ?? 0
    if (m.format === 'int') return typeof v === 'number' ? v : 0
    const [a, b] = typeof v === 'number' ? [0, 0] : v
    return m.format === 'pct' ? b : b ? a / b : 0
  })
  const okPerApp = m.format === 'pct' ? detail.apps.map((_, i) => { const v = series?.n[i] ?? 0; return typeof v === 'number' ? 0 : v[0] }) : null
  const keptApps = detail.apps.map((_, i) => i).filter((i) => keep[i])
  const mean = keptApps.length ? keptApps.reduce((s, i) => s + perApp[i], 0) / keptApps.length : null
  const one = (v: number) => (m.format === 'meters' ? `${Math.round(v)} 米` : `${Math.round(v * 10) / 10}`)
  const picked = pick != null ? detail.apps[pick] : null
  const pickedPlayable = pick != null && series ? playable(detail, series.e.filter((i) => detail.events[i][4] === pick)) : []
  // the pitch: the filter's matches, or only the picked one
  const onPitch = (i: number) => pick == null || detail.events[i][4] === pick
  const pitchEvs = kept(m.key).filter(onPitch)

  return (
    <section ref={box} className={`tm-section pp-section${focus ? ' is-focus' : ''}`}>
      <div className="tm-sec-head pp-sec-head">
        <div>
          <h2 className="t-title">{section.title}</h2>
          {section.question && <p className="t-lead">{section.question}</p>}
        </div>
        <a className="t-caption" href={teamPageHref(teamId, { tab: section.chapter, focus: sel })}>{`${S.meta.teams[teamId]}全队这一项 →`}</a>
      </div>
      <div className="tm-sec-body">
        <div className="tm-chart">
          <div className="t-label">{`${m.label} · 场上分布${picked ? `（只画 ${shortDate(picked.d)} 这一场）` : ''}`}</div>
          {series && pitchEvs.length ? (
            <SeasonPitch
              key={`${m.key}-${pick}`}
              events={pitchEvs.map((i) => ({ i, e: detail.events[i] }))}
              ok={m.format === 'pct' && series.k ? new Set(series.k) : null}
              apps={detail.apps} labels={detail.labels} teams={S.meta.teams} current={current}
              onPlay={(i) => open(`${m.label}（有视频的）`, playable(detail, kept(m.key).filter(onPitch)), i)}
              dimApp={pick == null ? hover : null} onHoverApp={pick == null ? setHover : undefined}
            />
          ) : (
            <p className="t-caption pp-none">这一项他在这些比赛里一次也没有。</p>
          )}
          <div className="t-label pp-bars-label">{`按场次 · ${m.format === 'pct' ? '尝试（深色是成功）' : m.format === 'meters' ? '平均位置' : '每场次数'}`}</div>
          <AppBars
            apps={detail.apps} values={perApp} ok={okPerApp} keep={keep} mean={mean} teams={S.meta.teams}
            meanLabel={`他的场均 ${mean == null ? '—' : one(mean)}`} selected={pick} onPick={(i) => setPick(pick === i ? null : i)} format={one}
            hover={hover} onHover={setHover}
          />
          <p className="t-caption">
            {picked ? (
              <>
                {`${shortDate(picked.d)} ${picked.h ? '主' : '客'} ${S.meta.teams[picked.o] ?? ''} ${picked.s[0]}–${picked.s[1]} · ${picked.st ? '首发' : '替补'} ${picked.min} 分钟 · ${one(perApp[pick!])}${okPerApp ? `（成功 ${okPerApp[pick!]}）` : ''}。`}
                {pickedPlayable.length > 0 && (
                  <button className="btn-quiet pp-inline" onClick={() => open(`${m.label} · ${shortDate(picked.d)}`, pickedPlayable)}>{`看这场的 ${pickedPlayable.length} 次 ▶`}</button>
                )}
                <a href={matchPageHref(picked.m, picked.t, section.chapter)}>{`打开这场的${CHAPTER_ZH[section.chapter]} →`}</a>
                <button className="btn-quiet pp-inline pp-back" onClick={() => setPick(null)}>回到整季</button>
              </>
            ) : (
              '点一根柱子，场上只画那一场，再点一下回到整季。鼠标停在柱子上，场上会亮出那一场的动作；停在场上的动作上，它那一场的柱子会亮。柱子上方的点：有视频的场次。'
            )}
          </p>
        </div>
        <div className="pp-right">
          {playlist && <ClipPlayer detail={detail} teams={S.meta.teams} playlist={playlist} go={go} close={close} />}
          <table className="tm-metrics pp-metrics">
            <thead>
              <tr>
                <th />
                <th className="t-label" title="次数按每 90 分钟算；比率和平均位置照原样">每 90 分钟</th>
                <th className="t-label">合计</th>
                <th className="t-label" title={`在${S.meta.teams[teamId]}按合计排`}>队内</th>
                <th className="t-label" title={`和${S.meta.nameZh}同位置、出场够门槛的人比，按每 90 分钟排`}>同位置</th>
                <th className="t-label">联赛同位置</th>
                <th className="t-label" title="他出场的那些比赛里，全队这一项有多少是他做的">占全队</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => {
                const i = S.idx[x.key]
                const r = reading(sum, i, x)
                const g = groupRank(S, pid, x.key, filter)
                const tr = teamRank(S, stint, x.key, filter)
                const s = detail.metrics[x.key]
                const mineTeam = s?.t ? keptApps.reduce((acc, k) => [acc[0] + (s.n[k] as number), acc[1] + s.t![k]], [0, 0]) : null
                const play = playable(detail, kept(x.key))
                const value = x.format === 'pct' && !r.rankable && r.n > 0 ? '—' : fmtValue(x.format, r.value)
                const total = x.format === 'int' ? fmtInt(r.total) : x.format === 'pct' ? `${r.total}/${r.n}` : `${r.n} 次`
                return (
                  <tr key={x.key} className={sel === x.key ? 'is-selected' : ''} onClick={() => { setSel(x.key); setPick(null) }}>
                    <th>
                      <div className="t-body">{x.label}</div>
                      {x.hint && <div className="t-caption">{x.hint}</div>}
                    </th>
                    <td className="t-figure pp-value">{value}</td>
                    <td className="t-numeric">
                      {play.length ? (
                        <button className="val val-sm pp-play" title={`其中 ${play.length} 次有视频，点开看`} onClick={(e) => { e.stopPropagation(); setSel(x.key); open(`${x.label}（有视频的）`, play) }}>
                          {total}<span className="pp-vid">{`▶${play.length}`}</span>
                        </button>
                      ) : total}
                    </td>
                    <td className="t-numeric">{tr.rank ? `${tr.rank}/${tr.of}` : '—'}</td>
                    <td className="t-numeric" title={g.rank ? undefined : !isRanked(S, pid, filter) ? '出场时间不够门槛' : '次数太少，不比比率'}>
                      {g.rank ? `${g.rank}/${g.of}` : !isRanked(S, pid, filter) ? '不排' : '—'}
                    </td>
                    <td>
                      <GroupStrip rows={g.rows} me={pid} mine={r.rankable || x.format === 'int' ? r.value : null} med={g.median} label={(v) => fmtValue(x.format, v)} nameOf={(id) => nameOf(S.meta.players[id])} />
                    </td>
                    <td className="t-numeric">{mineTeam && mineTeam[1] ? `${Math.round((mineTeam[0] / mineTeam[1]) * 100)}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hidden > 0 && <p className="t-caption pp-hidden">{`另有 ${hidden} 项他是 0，同位置的人也很少做，没列出来。`}</p>}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ match log */

function MatchLog({ teams, detail }: { teams: Record<string, string>; detail: LeagueDetail }) {
  const col = (k: string, i: number) => {
    const v = detail.metrics[k]?.n[i] ?? 0
    return typeof v === 'number' ? v : v[1]
  }
  return (
    <table className="tm-table pp-log">
      <thead>
        <tr>{['日期', '对手', '主客', '比分', '', '首发', '分钟', '位置', '进球', '助攻', '射门', '关键传球', '触球', '视频', ''].map((c, i) => <th key={i} className="t-label">{c}</th>)}</tr>
      </thead>
      <tbody>
        {detail.apps.map((a, i) => {
          const r = a.s[0] > a.s[1] ? '胜' : a.s[0] < a.s[1] ? '负' : '平'
          return (
            <tr key={a.m}>
              <td className="t-numeric">{shortDate(a.d)}</td>
              <td><a href={teamPageHref(a.o)}>{teams[a.o]}</a></td>
              <td>{a.h ? '主' : '客'}</td>
              <td className="t-numeric">{`${a.s[0]}–${a.s[1]}`}</td>
              <td><span className={`tm-res r-${r}`}>{r}</span></td>
              <td>{a.st ? '首发' : '替补'}</td>
              <td className="t-numeric">{a.min}</td>
              <td className="t-caption">{Object.entries(a.places).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k).join('、')}</td>
              <td className="t-numeric">{col('overview.personal.goals', i) || ''}</td>
              <td className="t-numeric">{col('overview.personal.assists', i) || ''}</td>
              <td className="t-numeric">{col('attack.shots.shots', i) || ''}</td>
              <td className="t-numeric">{col('overview.personal.key_passes', i) || ''}</td>
              <td className="t-numeric">{col('overview.personal.touches', i)}</td>
              <td>{a.src ? <span className="tm-has-video">有视频</span> : ''}</td>
              <td><a href={matchPageHref(a.m, a.t)}>比赛分析 →</a></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
