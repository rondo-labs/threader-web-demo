// /player/<id>/?league=&tab=<data | log>&ability=&reading=&chapter=&filter=&focus=: one player's season, built around
// the radar (docs/players.md). Three views under the header: 分析 (the default), 全部数据 (the match page's six chapters
// for this player), 比赛记录. 分析 opens on one row of three charts of one size: the five abilities the position is
// judged by (data.ts FIVE), the picked ability's own radar (its reading and the ones that explain it, radar.ts) and the
// position group's quadrant chart. Under the row, for the picked reading: where on the pitch, the position group, match
// by match, the clips, and a way into its section under 全部数据. Once the row scrolls away a bar with the radar in
// small takes its place at the top. Section questions, row definitions and how to use a chart are in hover tips. Older
// links (?tab=<chapter>) open that chapter under 全部数据.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Nav } from '../app/Nav'
import { CHAPTERS } from '../match-analysis/common'
import { rankText, type Axis } from '../radar/axis'
import { Info, Radar, Sized, Swarm, mapHeight, useScrolledPast } from '../radar/charts'
import { Defined, FilterSeg, Head, PageTabs, StickyBar } from '../radar/parts'
import { AppBars, GroupStrip, Quadrant, SeasonPitch, type QPoint } from './charts'
import { ClipPlayer, buildClips, playable, type PPlaylist } from './ClipPlayer'
import {
  DEFAULT_AXES, FILTERS, LEAGUES, axisOf, axisValue, currentStint, fmtAxis, fmtInt, fmtValue, footLine, groupRank, isRanked,
  loadPlayer, matchPageHref, median, nameOf, peers, placesLine, playerHref, playersHref, reading, shortDate, summaryOf,
  teamPageHref, teamRank, useSeason, type Filter, type LeagueDetail, type PlayerFile, type PMetric, type Season,
} from './data'
import { abilityAxes, playerAxes, radarSet } from './radar'
import { SearchBox } from './SearchBox'

const PAGES: [string, string][] = [['analysis', '分析'], ['data', '全部数据'], ['log', '比赛记录']]
const CHAPTER_KEYS = CHAPTERS.map((c) => c.key as string)

function readUrl() {
  const q = new URLSearchParams(location.search)
  // Older links put a chapter in ?tab=: open it under 全部数据.
  const old = q.get('tab')
  const t = old && CHAPTER_KEYS.includes(old) ? 'data' : old
  const ch = q.get('chapter') ?? (old && CHAPTER_KEYS.includes(old) ? old : null)
  const filter = FILTERS.find(([k]) => k === q.get('filter'))?.[0] ?? 'all'
  const ab = Number(q.get('ability'))
  const rd = Number(q.get('reading'))
  return {
    league: q.get('league'),
    tab: t && PAGES.some(([k]) => k === t) ? t : 'analysis',
    ability: Number.isInteger(ab) && ab >= 0 && ab < 5 ? ab : 0,
    reading: Number.isInteger(rd) && rd >= 0 && rd < 6 ? rd : 0,
    chapter: ch && CHAPTER_KEYS.includes(ch) ? ch : 'overview',
    filter: filter as Filter, focus: q.get('focus'),
  }
}

/** Which of the appearances a filter keeps: home, away, or the player's own last five. */
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
  const [ability, setAbility] = useState(init.ability)
  // the reading picked in the ability's own radar (0: the ability's reading itself)
  const [part, setPart] = useState(init.reading)
  const [chapter, setChapter] = useState(init.chapter)
  const [filter, setFilter] = useState<Filter>(init.filter)
  const [focus, setFocus] = useState<string | null>(init.focus)
  const [playlist, setPlaylist] = useState<PPlaylist | null>(null)
  const top = useRef<HTMLElement>(null)
  const readingBox = useRef<HTMLElement>(null)

  useEffect(() => {
    loadPlayer(playerId)
      .then((f) => {
        setFile(f)
        // Without a league in the link: the one with the most minutes.
        const most = Object.entries(f.leagues).sort((a, b) => b[1].apps.reduce((s, x) => s + x.min, 0) - a[1].apps.reduce((s, x) => s + x.min, 0))[0][0]
        setLeague((l) => (l && f.leagues[l] ? l : most))
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId])
  const { S, shown, error: seasonError } = useSeason(league, filter)
  const past = useScrolledPast(top, `${!!S}-${tab}`)
  useEffect(() => {
    const url = new URL(location.href)
    const set = (k: string, v: string | null) => (v == null ? url.searchParams.delete(k) : url.searchParams.set(k, v))
    set('league', file && league && Object.keys(file.leagues).length > 1 ? league : null)
    set('tab', tab === 'analysis' ? null : tab)
    set('ability', tab === 'analysis' && ability ? String(ability) : null)
    set('reading', tab === 'analysis' && part ? String(part) : null)
    set('chapter', tab === 'data' && chapter !== 'overview' ? chapter : null)
    set('filter', tab === 'data' && filter !== 'all' ? filter : null)
    set('focus', tab === 'data' ? focus : null)
    history.replaceState(null, '', url)
    if (S) document.title = `${nameOf(S.meta.players[playerId])} · Threader`
  }, [league, tab, ability, part, chapter, filter, focus, S, file, playerId])

  const failed = error ?? seasonError
  if (failed) return <div className="tm"><Nav active="players" /><p className="boot">{`球员没有加载出来（${failed}）。`}</p></div>
  const detail = file && league ? file.leagues[league] : null
  if (!S || !detail || S.meta.slug !== league || !S.meta.players[playerId]) return <div className="tm"><Nav active="players" /><p className="boot">加载中…</p></div>

  const p = S.meta.players[playerId]
  const stint = currentStint(S, playerId)
  const teamId = S.meta.stints[stint][1]
  const all = summaryOf(S, playerId, 'all')!
  const personal = (k: string) => reading(all, S.idx[`overview.personal.${k}`], S.meta.metrics[S.idx[`overview.personal.${k}`]]).total
  const foot = footLine(p)
  const others = p.teams.filter((t) => t !== teamId).map((t) => S.meta.teams[t])
  const teammates = (S.teamStints.get(teamId) ?? []).map((i) => ({ id: S.meta.stints[i][0], min: S.rows.all![i][0] })).sort((a, b) => b.min - a.min)
  const set = radarSet(S, playerId)
  const axes = isRanked(S, playerId, 'all') ? playerAxes(S, playerId) : []
  const parts = axes[ability] ? abilityAxes(S, playerId, axes[ability]) : []
  const open = (title: string, evs: number[], owner: string, start?: number) => {
    const clips = buildClips(detail, evs)
    if (!clips.length) return
    const at = start != null ? clips.findIndex((c) => c.evs.includes(start)) : 0
    setPlaylist({ title, clips, index: Math.max(0, at), owner, opened: Date.now() })
  }
  const go = (i: number) => setPlaylist((pl) => (pl && i >= 0 && i < pl.clips.length ? { ...pl, index: i } : pl))
  const pickAbility = (i: number) => {
    setAbility(i)
    setPart(0)
    setPlaylist(null)
    // From the bar at the top (the row out of view), go back up to the row: the ability's radar opens there.
    if (past) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const pickPart = (i: number) => {
    setPart(i)
    setPlaylist(null)
    requestAnimationFrame(() => {
      const el = readingBox.current
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.75) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }
  const showPage = (k: string) => {
    setTab(k)
    setPlaylist(null)
    window.scrollTo({ top: 0 })
  }
  const toData = (ch: string, key: string) => {
    setChapter(ch)
    setFocus(key)
    showPage('data')
  }
  return (
    <div className="tm pp rd-page">
      <Nav active="players" />
      <header className="tm-head pp-head">
        <div>
          <div className="t-caption">
            {`${S.meta.nameZh} · 2026 赛季 · `}
            <a href={teamPageHref(teamId)}>{S.meta.teams[teamId]}</a>
            {others.length ? ` · 赛季中从${others.join('、')}转来` : ''}
            {others.length > 0 && <Info text="同位置排名按两队合计" />}
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
          <select value={playerId} onChange={(e) => location.assign(playerHref(e.target.value))} aria-label="同队球员">
            {teammates.map((t) => <option key={t.id} value={t.id}>{`${S.meta.players[t.id].number ?? ''} ${nameOf(S.meta.players[t.id])}`}</option>)}
          </select>
          <SearchBox />
        </div>
      </header>
      <PageTabs tabs={PAGES} current={tab} onPick={showPage} />

      {tab === 'analysis' && (
        <>
          <section ref={top} className="rd-row">
            <Sized className="rd-block">
              {(w) => (
                <>
                  <div className="rd-cap t-label">
                    {`${set.name}最看重的 5 项 · 和${S.meta.nameZh}其他${p.group}比 · 整季`}
                    <Info text={`每个角是这个位置最看重的一项，用一个读数和同位置的人比：越往外，超过的人越多；虚线是中位数，浅色带是中间一半的人。角上写名次和数值。点一个角，旁边换成这一项的雷达，下面换成它的场上分布、逐场和视频。${set.name === '门将' ? '扑救量、球门球长传占比不分好坏，不在雷达上：在右边的图里，也在扑救、长传的小雷达里。' : ''}`} />
                  </div>
                  {axes.length ? (
                    <Radar axes={axes} selected={ability} onPick={pickAbility} width={w} />
                  ) : (
                    <p className="t-lead pp-unranked">{`整季出场 ${fmtInt(all[0])} 分钟，不到 ${fmtInt(S.meta.thresholds.all)} 分钟，不和同位置比。`}</p>
                  )}
                </>
              )}
            </Sized>
            <Sized className="rd-block rd-block-mid">
              {(w) =>
                parts.length > 0 && (
                  <>
                    <div className="rd-cap t-label">
                      {`${axes[ability].label} · 拆开看`}
                      <Info text="这一项和与它相关的几项，同样和同位置比；点一个角，下面换成那一项。" />
                    </div>
                    <Radar axes={parts} selected={part} onPick={pickPart} width={w} />
                  </>
                )
              }
            </Sized>
            <Sized className="rd-block">
              {(w) => (
                <>
                  <div className="rd-cap t-label">{`在${S.meta.nameZh}${p.group}里的位置`}</div>
                  <GroupMap S={S} pid={playerId} width={w} />
                  <a className="t-caption" href={playersHref({ league: S.meta.slug, group: p.group, sel: playerId, hl: p.teams.at(-1)! })}>换两项读数，看全组 →</a>
                </>
              )}
            </Sized>
          </section>

          {axes.length > 0 && (
            <StickyBar
              show={past} axes={axes} current={ability} name={nameOf(p)}
              links={axes.map((a, i) => ({ key: a.key, label: a.label, rank: rankText(a), on: ability === i, onClick: () => pickAbility(i) }))}
            />
          )}

          <main className="tm-main rd-below">
            {parts[part] ? (
              <ReadingBlock
                key={`${league}-${axes[ability].key}-${ability}-${part}`} box={readingBox} S={S} detail={detail} pid={playerId} ab={axes[ability]} a={parts[part]}
                playlist={playlist?.owner === 'ability' ? playlist : null} open={(t, evs, start) => open(t, evs, 'ability', start)} go={go} close={() => setPlaylist(null)}
                toData={() => toData(parts[part].chapter, parts[part].key)}
              />
            ) : (
              <p className="t-lead rd-empty">
                不和同位置比，没有雷达。<button className="btn-quiet" onClick={() => showPage('data')}>看全部数据 →</button>
              </p>
            )}
          </main>
        </>
      )}

      {tab === 'data' && (
        <main className="tm-main rd-below">
          <nav className="tabs rd-chapter-tabs" aria-label="章">
            {CHAPTERS.map((c) => (
              <button key={c.key} aria-current={chapter === c.key} onClick={() => { setChapter(c.key); setFocus(null); setPlaylist(null) }}>{c.zh}</button>
            ))}
            <span className="tm-tab-gap" />
            {filter !== shown && <span className="t-caption">加载中…</span>}
            <FilterSeg filter={filter} setFilter={setFilter} />
          </nav>
          {sectionsOf(S, chapter).map((s) => (
            <PSection
              key={`${playerId}-${league}-${chapter}-${s.key}`} S={S} detail={detail} pid={playerId} stint={stint} filter={shown} section={s}
              focus={s.metrics.some((m) => m.key === focus) ? focus : null}
              playlist={playlist?.owner === s.key ? playlist : null}
              open={(title, evs, start) => open(title, evs, s.key, start)} go={go} close={() => setPlaylist(null)}
            />
          ))}
        </main>
      )}

      {tab === 'log' && (
        <main className="tm-main rd-below">
          <MatchLog teams={S.meta.teams} detail={detail} />
        </main>
      )}
    </div>
  )
}

/** The player page's quadrant chart: the player's group, on the group's default pair of readings. */
function GroupMap({ S, pid, width }: { S: Season; pid: string; width: number }) {
  const p = S.meta.players[pid]
  const [xk, yk] = DEFAULT_AXES[p.group] ?? DEFAULT_AXES['中场']
  const ax = axisOf(S, xk), ay = axisOf(S, yk)
  const pts: QPoint[] = []
  for (const id of peers(S, p.group, 'all')) {
    const x = axisValue(S, id, xk, 'all'), y = axisValue(S, id, yk, 'all')
    if (x == null || y == null) continue
    const q = S.meta.players[id]
    pts.push({ id, x, y, name: nameOf(q), team: S.meta.teams[q.teams.at(-1)!], hl: false })
  }
  const gx = axisValue(S, pid, xk, 'all'), gy = axisValue(S, pid, yk, 'all')
  const ghost = !pts.some((q) => q.id === pid) && gx != null && gy != null ? { id: pid, x: gx, y: gy, name: nameOf(p), team: '', hl: false } : null
  // Long reading names crowd the corner words in a narrow block: there, the compact chart and the axes in a line.
  const small = width < 400
  return (
    <>
      <Quadrant
        small={small} points={pts} ghost={ghost} selected={pid} width={width} height={mapHeight(width)}
        xLabel={ax.label} yLabel={ay.label} xWords={ax.words} yWords={ay.words} xShort={ax.short} yShort={ay.short}
        xMed={median(pts.map((q) => q.x))} yMed={median(pts.map((q) => q.y))} fmtX={(v) => fmtAxis(S, xk, v)} fmtY={(v) => fmtAxis(S, yk, v)}
      />
      {small && <div className="t-caption rd-map-axes">{`横 ${ax.label} · 纵 ${ay.label}`}</div>}
    </>
  )

}

/** The reading picked in the ability's radar (at first the ability's own): where on the pitch, the group, match by
 *  match, and the clips. */
function ReadingBlock({ box, S, detail, pid, ab, a, playlist, open, go, close, toData }: {
  box: RefObject<HTMLElement | null>; S: Season; detail: LeagueDetail; pid: string; ab: Axis; a: Axis; playlist: PPlaylist | null
  open: (title: string, evs: number[], start?: number) => void; go: (i: number) => void; close: () => void
  /** Into this reading's section under 全部数据: its table, the rest of the section. */
  toData: () => void
}) {
  const [pick, setPick] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const m = S.meta.metrics[S.idx[a.key]]
  const series = detail.metrics[a.key]
  const evs = series?.e ?? []
  const current = playlist ? new Set(playlist.clips[playlist.index]?.evs ?? []) : null
  const perApp = detail.apps.map((_, i) => {
    const v = series?.n[i] ?? 0
    if (m.format === 'int') return typeof v === 'number' ? v : 0
    const [x, y] = typeof v === 'number' ? [0, 0] : v
    return m.format === 'pct' ? y : y ? x / y : 0
  })
  const okPerApp = m.format === 'pct' ? detail.apps.map((_, i) => { const v = series?.n[i] ?? 0; return typeof v === 'number' ? 0 : v[0] }) : null
  const mean = perApp.length ? perApp.reduce((s, v) => s + v, 0) / perApp.length : null
  const one = (v: number) => (m.format === 'meters' ? `${Math.round(v)} 米` : `${Math.round(v * 10) / 10}`)
  const onPitch = (i: number) => pick == null || detail.events[i][4] === pick
  const pitchEvs = evs.filter(onPitch)
  const toPlay = playable(detail, pitchEvs)
  const picked = pick != null ? detail.apps[pick] : null
  const raw = reading(summaryOf(S, pid, 'all'), S.idx[a.key], m)
  const group = S.meta.players[pid].group
  return (
    <section ref={box} className="rd-ability">
      <Head title={ab.label} extra={<button className="btn-quiet rd-head-link" onClick={toData}>这一节的全部数据 →</button>}>
        <span className="rd-head-reading">{a.reading}</span>
        <span className="rd-head-rank t-numeric">{rankText(a)}</span>
        <span className="t-caption">{`${a.display}${a.unit ? ` ${a.unit}` : ''}${a.median != null ? ` · 中位数 ${a.fmt(a.median)}` : ''}`}</span>
      </Head>
      <div className="tm-sec-body rd-ability-body">
        <div className="tm-chart">
          <div className="t-label">
            {`${a.reading} · 场上${picked ? ` · ${shortDate(picked.d)}` : ''}`}
            <Info text="进攻方向向右；带圈的有视频，点一下就播。点下面的柱子只画那一场。" />
          </div>
          {pitchEvs.length ? (
            <SeasonPitch
              key={`${a.key}-${pick}`}
              events={pitchEvs.map((i) => ({ i, e: detail.events[i] }))}
              ok={m.format === 'pct' && series?.k ? new Set(series.k) : null}
              apps={detail.apps} labels={detail.labels} teams={S.meta.teams} current={current}
              onPlay={(i) => open(`${a.reading}（有视频的）`, toPlay, i)}
              dimApp={pick == null ? hover : null} onHoverApp={pick == null ? setHover : undefined}
            />
          ) : (
            <p className="t-caption pp-none">没有</p>
          )}
        </div>
        <div className="pp-right">
          {playlist ? (
            <ClipPlayer detail={detail} teams={S.meta.teams} playlist={playlist} go={go} close={close} />
          ) : (
            toPlay.length > 0 && <button className="btn rd-play" onClick={() => open(`${a.reading}（有视频的）`, toPlay)}>{`播放 ${toPlay.length} 次 ▶`}</button>
          )}
          <div className="t-label rd-swarm-label">{`${S.meta.nameZh}每名${group}`}<Info text="出场够门槛的同位置球员；悬停看名字。" /></div>
          <Swarm rows={a.rows} me={pid} median={a.median} fmt={a.fmt} ghost={a.value == null && raw.value != null ? { v: raw.value, name: nameOf(S.meta.players[pid]) } : null} />
          <div className="t-label rd-swarm-label">{m.format === 'pct' ? '每场尝试 · 深色是成功' : '每场'}</div>
          <AppBars
            apps={detail.apps} values={perApp} ok={okPerApp} keep={detail.apps.map(() => true)} mean={mean} teams={S.meta.teams}
            meanLabel={`场均 ${mean == null ? '—' : one(mean)}`} selected={pick} onPick={(i) => setPick(pick === i ? null : i)} format={one}
            hover={hover} onHover={setHover}
          />
          {picked && (
            <p className="t-caption">
              {`${shortDate(picked.d)} ${picked.h ? '主' : '客'} ${S.meta.teams[picked.o] ?? ''} ${picked.s[0]}–${picked.s[1]} · ${picked.min} 分钟 · ${one(perApp[pick!])}　`}
              <a href={matchPageHref(picked.m, picked.t, m.chapter)}>打开这场 →</a>
            </p>
          )}
        </div>
      </div>
    </section>
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

/** A chapter's section under 全部数据: the production section, its words moved into hover tips. */
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
        <p className="t-caption">都是 0</p>
      </section>
    )
  }
  const m = S.meta.metrics[S.idx[sel]] ?? visible[0]
  const series = detail.metrics[m.key]
  const kept = (key: string) => (detail.metrics[key]?.e ?? []).filter((i) => keep[detail.events[i][4]])
  const current = playlist ? new Set(playlist.clips[playlist.index]?.evs ?? []) : null
  const teamId = S.meta.stints[stint][1]
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
  const onPitch = (i: number) => pick == null || detail.events[i][4] === pick
  const pitchEvs = kept(m.key).filter(onPitch)

  return (
    <section ref={box} className={`tm-section pp-section${focus ? ' is-focus' : ''}`}>
      <div className="tm-sec-head pp-sec-head">
        <div><h2 className="t-title">{section.title}<Info text={section.question} /></h2></div>
        <a className="t-caption" href={teamPageHref(teamId, { view: section.chapter, focus: sel })}>{`${S.meta.teams[teamId]}全队这一项 →`}</a>
      </div>
      <div className="tm-sec-body">
        <div className="tm-chart">
          <div className="t-label">
            {`${m.label} · 场上${picked ? ` · ${shortDate(picked.d)}` : ''}`}
            <Info text="进攻方向向右；带圈的有视频，点一下就播。点下面的柱子只画那一场，再点一下回到整季；鼠标停在柱子或动作上，两边一起亮。" />
          </div>
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
            <p className="t-caption pp-none">没有</p>
          )}
          <div className="t-label pp-bars-label">{m.format === 'pct' ? '每场尝试 · 深色是成功' : m.format === 'meters' ? '每场平均位置' : '每场'}</div>
          <AppBars
            apps={detail.apps} values={perApp} ok={okPerApp} keep={keep} mean={mean} teams={S.meta.teams}
            meanLabel={`场均 ${mean == null ? '—' : one(mean)}`} selected={pick} onPick={(i) => setPick(pick === i ? null : i)} format={one}
            hover={hover} onHover={setHover}
          />
          {picked && (
            <p className="t-caption">
              {`${shortDate(picked.d)} ${picked.h ? '主' : '客'} ${S.meta.teams[picked.o] ?? ''} ${picked.s[0]}–${picked.s[1]} · ${picked.min} 分钟 · ${one(perApp[pick!])}　`}
              {pickedPlayable.length > 0 && (
                <button className="btn-quiet pp-inline" onClick={() => open(`${m.label} · ${shortDate(picked.d)}`, pickedPlayable)}>{`看这场的 ${pickedPlayable.length} 次 ▶`}</button>
              )}
              <a href={matchPageHref(picked.m, picked.t, section.chapter)}>打开这场 →</a>
            </p>
          )}
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
                <th className="t-label" title="出场的那些比赛里，全队这一项有多少是这名球员做的">占全队</th>
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
                const val = x.format === 'pct' && !r.rankable && r.n > 0 ? '—' : fmtValue(x.format, r.value)
                const total = x.format === 'int' ? fmtInt(r.total) : x.format === 'pct' ? `${r.total}/${r.n}` : `${r.n} 次`
                return (
                  <tr key={x.key} className={sel === x.key ? 'is-selected' : ''} onClick={() => { setSel(x.key); setPick(null) }}>
                    <th><div className="t-body"><Defined label={x.label} hint={x.hint} /></div></th>
                    <td className="t-figure pp-value">{val}</td>
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
          {hidden > 0 && <p className="t-caption pp-hidden">{`另 ${hidden} 项是 0`}<Info text="这名球员和同位置的人都很少做，没列出来。" /></p>}
        </div>
      </div>
    </section>
  )
}

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

