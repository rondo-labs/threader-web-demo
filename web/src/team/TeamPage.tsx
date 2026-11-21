// /team/<id>/?tab=<schedule | lineup>&view=<chapter>&filter=<all | home | away | last5>&focus=<reading>: one team's
// season, built around its radar (docs/team.md). Three views under the header: 分析 (the default), 赛程, 阵容. 分析
// opens on one row of three charts of one size: the five (a corner per chapter, data.ts FIVE), the focus (at first the
// season's 排名走势; a corner swaps in that chapter's own radar, a corner per section) and 怎么踢 (possession and
// pressing). Under the row: 概览 (关键数据, 比赛走势), or the opened chapter's sections, where the table is the filter
// as on the match page; a section corner scrolls to its section. Once the row scrolls away, a bar with the radar in
// small and every corner takes its place at the top. Section questions, row definitions and how to use a chart are in
// hover tips. Older links (?tab=<chapter>) still open that chapter.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Nav } from '../app/Nav'
import { DepthChart, Quadrant, type QPoint } from '../players/charts'
import { fmtInt, median, playerHref, playersHref } from '../players/data'
import { rankText, type Axis } from '../radar/axis'
import { Info, Radar, Sized, Swarm, mapHeight, useScrolledPast } from '../radar/charts'
import { Defined, FilterSeg, Head, PageTabs, StickyBar } from '../radar/parts'
import { Form, MatchBars, RankLine, Strip } from './charts'
import {
  FILTERS, fmt, kept, leagueMean, loadLeague, loadTeam, matchHref, rankOf, ranked, results, shortDate, standingLine, standings,
  teamHref, value, type Filter, type League, type LeagueMetric, type TeamFile,
} from './data'
import { CHAPTER_ZH, TEAM_ORDER, chapterAxes, styleOf, teamAxes } from './radar'

const PAGES: [string, string][] = [['analysis', '分析'], ['schedule', '赛程'], ['lineup', '阵容']]

function readUrl() {
  const q = new URLSearchParams(location.search)
  const t = q.get('tab')
  // Older links put a chapter in ?tab=: open it from the radar.
  const v = q.get('view') ?? (t && TEAM_ORDER.includes(t) ? t : null)
  const f = q.get('filter') as Filter | null
  return {
    tab: t && PAGES.some(([k]) => k === t) ? t : 'analysis',
    view: v && TEAM_ORDER.includes(v) ? v : 'overview',
    filter: f && FILTERS.some(([k]) => k === f) ? f : ('all' as Filter),
    focus: q.get('focus'),
  }
}

export function TeamPage({ teamId }: { teamId: string }) {
  const init = useMemo(readUrl, [])
  const [data, setData] = useState<{ lg: League; team: TeamFile } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(init.tab)
  const [view, setView] = useState(init.view)
  const [filter, setFilter] = useState<Filter>(init.filter)
  const [focus, setFocus] = useState<string | null>(init.focus)
  const [jump, setJump] = useState(0)
  const top = useRef<HTMLElement>(null)
  const past = useScrolledPast(top, `${!!data}-${tab}`)

  useEffect(() => {
    loadTeam(teamId)
      .then((team) => loadLeague(team.league).then((lg) => setData({ lg, team })))
      .catch((e: Error) => setError(e.message))
  }, [teamId])
  useEffect(() => {
    const url = new URL(location.href)
    const set = (k: string, v: string | null) => (v == null ? url.searchParams.delete(k) : url.searchParams.set(k, v))
    set('tab', tab === 'analysis' ? null : tab)
    set('view', tab !== 'analysis' || view === 'overview' ? null : view)
    set('filter', filter === 'all' ? null : filter)
    set('focus', tab === 'analysis' ? focus : null)
    history.replaceState(null, '', url)
    if (data) document.title = `${data.lg.teams[teamId].nameZh} · Threader`
  }, [tab, view, filter, focus, data, teamId])

  if (error) return <p className="boot">{`球队没有加载出来（${error}）。`}</p>
  if (!data) return <p className="boot">加载中…</p>
  const { lg, team } = data
  const rs = results(lg, teamId)
  const rec = {
    w: rs.filter((r) => r.r === '胜').length, d: rs.filter((r) => r.r === '平').length, l: rs.filter((r) => r.r === '负').length,
    gf: rs.reduce((s, r) => s + r.gf, 0), ga: rs.reduce((s, r) => s + r.ga, 0), video: rs.filter((r) => r.m.video).length,
  }
  const axes = teamAxes(lg, teamId)
  const corner = axes.findIndex((a) => a.chapter === view)
  // The opened chapter's own radar, in the middle of the row: a corner per section, under the filter.
  const sub = corner >= 0 ? chapterAxes(lg, teamId, view, filter) : []
  const subAt = sub.findIndex((a) => a.key === focus)
  const show = (v: string) => {
    setView(v)
    setFocus(null)
    // From the bar at the top (the row out of view), go back up to the row: the chapter's radar opens there.
    if (past) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const toSection = (key: string) => {
    setFocus(key)
    setJump((j) => j + 1)
  }
  const filterZh = FILTERS.find(([k]) => k === filter)![1]
  return (
    <div className="tm rd-page">
      <Nav active="teams" />
      <header className="tm-head">
        <div>
          <div className="t-caption">{`${lg.nameZh} · 2026 赛季`}</div>
          <h1 className="t-display">{lg.teams[teamId].nameZh}</h1>
          <div className="t-lead">{standingLine(lg, teamId)}</div>
        </div>
        <dl className="tm-record">
          <div><dt className="t-label">场次</dt><dd className="t-figure">{rs.length}</dd></div>
          <div><dt className="t-label">胜 平 负</dt><dd className="t-figure">{`${rec.w} ${rec.d} ${rec.l}`}</dd></div>
          <div><dt className="t-label">进 失</dt><dd className="t-figure">{`${rec.gf} ${rec.ga}`}</dd></div>
          <div>
            <dt className="t-label">最近 6 场</dt>
            <dd><Form list={rs.slice(-6).map((r) => ({ r: r.r, title: `${r.m.date} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}`, href: matchHref(r.m, teamId) }))} /></dd>
          </div>
          <div><dt className="t-label">视频</dt><dd className="t-figure">{rec.video}</dd></div>
        </dl>
        <div className="tm-picker">
          <select value={teamId} onChange={(e) => location.assign(teamHref(e.target.value, tab === 'analysis' ? { view: view === 'overview' ? '' : view } : { tab }))} aria-label="分析对象">
            {Object.values(lg.teams).sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh')).map((t) => <option key={t.id} value={t.id}>{t.nameZh}</option>)}
          </select>
          <a href={`/teams/?league=${lg.slug}`} className="t-caption">其他联赛 →</a>
        </div>
      </header>
      <PageTabs tabs={PAGES} current={tab} onPick={(k) => { setTab(k); window.scrollTo({ top: 0 }) }} />

      {tab === 'analysis' && (
        <>
          <section ref={top} className="rd-row">
            <Sized className="rd-block">
              {(w) => (
                <>
                  <div className="rd-cap t-label">
                    {`最看重的 5 项 · 和${lg.nameZh}其他队比 · 整季`}
                    <Info text="每个角是一章，用一个读数和联赛其他队比：越往外，超过的队越多；虚线是中位数，浅色带是中间一半的队。角上写名次和数值。点一个角，旁边换成这一章的雷达，下面换成这一章。" />
                  </div>
                  <Radar axes={axes} selected={corner >= 0 ? corner : null} onPick={(i) => show(axes[i].chapter)} width={w} />
                </>
              )}
            </Sized>
            <Sized className="rd-block rd-block-mid">
              {(w) =>
                corner >= 0 ? (
                  <>
                    <div className="rd-cap t-label">
                      <button className="rd-crumb" onClick={() => show('overview')}>概览</button>
                      <span className="rd-crumb-sep">›</span>
                      {`${CHAPTER_ZH[view]} · 各节${filter === 'all' ? '' : ` · ${filterZh}`}`}
                      <Info text="每个角是这一章的一节，各用一个读数和联赛其他队比；点一个角，下面跳到那一节。" />
                    </div>
                    <Radar axes={sub} selected={subAt >= 0 ? subAt : null} onPick={(i) => toSection(sub[i].key)} width={w} />
                  </>
                ) : (
                  <>
                    <div className="rd-cap t-label">
                      概览 · 排名走势
                      <Info text={`${lg.stages.length > 1 ? '每轮之后在本组的名次；决赛阶段的积分含预赛带入。' : '每轮之后的名次。'}下面一排是每一场的结果。点雷达的一个角，这里换成那一章的雷达。`} />
                    </div>
                    <SeasonLine lg={lg} teamId={teamId} width={w} />
                  </>
                )
              }
            </Sized>
            <Sized className="rd-block">
              {(w) => (
                <>
                  <div className="rd-cap t-label">
                    {`怎么踢 · ${lg.nameZh} ${Object.keys(lg.teams).length} 队`}
                    <Info text="横轴控球率，纵轴压迫强度（PPDA：对手在后场每传几脚球，我们做一次防守动作；越小压得越凶）。虚线是中位数。" />
                  </div>
                  <StyleMap lg={lg} teamId={teamId} width={w} />
                </>
              )}
            </Sized>
          </section>

          <StickyBar
            show={past} axes={axes} current={corner >= 0 ? corner : null} name={lg.teams[teamId].nameZh}
            links={[
              { key: 'overview', label: '概览', on: view === 'overview', onClick: () => show('overview') },
              ...axes.map((a) => ({ key: a.chapter, label: a.label, rank: rankText(a), on: view === a.chapter, onClick: () => show(a.chapter) })),
            ]}
          />

          <main className="tm-main rd-below">
            {corner >= 0 ? (
              <ChapterView key={view} lg={lg} team={team} axis={axes[corner]} filter={filter} setFilter={setFilter} focus={focus} jump={jump} />
            ) : (
              <>
                <Head title="概览" extra={<FilterSeg filter={filter} setFilter={setFilter} />} />
                {sections(lg, 'overview').map((s) => (
                  <SectionBlock key={`${teamId}-overview-${s.key}`} lg={lg} team={team} filter={filter} chapter="overview" section={s} focus={null} jump={jump} />
                ))}
              </>
            )}
          </main>
        </>
      )}
      {tab === 'schedule' && (
        <main className="tm-main rd-below">
          <Schedule lg={lg} teamId={teamId} />
        </main>
      )}
      {tab === 'lineup' && (
        <main className="tm-main rd-below">
          <Lineup lg={lg} team={team} />
        </main>
      )}
    </div>
  )
}

/** The season so far, small enough for the row: the place after every round, then every result. */
function SeasonLine({ lg, teamId, width }: { lg: League; teamId: string; width: number }) {
  const rs = results(lg, teamId)
  return (
    <div className="rd-season">
      <RankLine
        parts={standings(lg, teamId).map((s) => ({ label: s.group.name ?? s.stage, size: s.group.rows.length, points: s.group.history[teamId] ?? [] }))}
        width={width} height={Math.round(width * 0.48)}
      />
      <div className="tm-results">
        <Form list={rs.map((r) => ({ r: r.r, title: `${r.m.date} ${r.home ? '主' : '客'} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}${r.m.awarded ? '（判负）' : ''}`, href: matchHref(r.m, teamId) }))} />
      </div>
    </div>
  )
}

/** A chapter opened from the radar (its own radar sits beside the five above): the chapter's head, then every section. */
function ChapterView({ lg, team, axis, filter, setFilter, focus, jump }: {
  lg: League; team: TeamFile; axis: Axis; filter: Filter; setFilter: (f: Filter) => void; focus: string | null; jump: number
}) {
  const chapter = axis.chapter
  return (
    <>
      <Head title={CHAPTER_ZH[chapter]} extra={<FilterSeg filter={filter} setFilter={setFilter} />}>
        <span className="rd-head-rank t-numeric">{rankText(axis)}</span>
        <span className="t-caption">{`${axis.reading} ${axis.display}${axis.unit ? ` ${axis.unit}` : ''}${axis.note ? ` · ${axis.note}` : ''}`}</span>
      </Head>
      {sections(lg, chapter).map((s) => (
        <SectionBlock
          key={`${team.id}-${chapter}-${s.key}`} lg={lg} team={team} filter={filter} chapter={chapter} section={s}
          focus={s.metrics.some((m) => m.key === focus) ? focus : null} jump={jump}
        />
      ))}
    </>
  )
}

/** 怎么踢: possession across, pressing up (PPDA turned over: fewer opponent passes per defensive action is higher). */
function StyleMap({ lg, teamId, width }: { lg: League; teamId: string; width: number }) {
  const pts: QPoint[] = styleOf(lg)
    .filter((r) => r.possession != null && r.ppda != null)
    .map((r) => ({ id: r.id, x: r.possession! * 100, y: -r.ppda!, name: r.name, team: lg.nameZh, hl: r.id === teamId }))
  return (
    <Quadrant
      points={pts} selected={teamId} width={width} height={mapHeight(width)} small={width < 380}
      xLabel="控球率" yLabel="压迫强度" xShort="控球" yShort="压迫" xWords={['多', '少']} yWords={['强', '弱']}
      xMed={median(pts.map((p) => p.x))} yMed={median(pts.map((p) => p.y))}
      fmtX={(v) => `${Math.round(v)}%`} fmtY={(v) => (-v).toFixed(1)}
    />
  )
}

function sections(lg: League, chapter: string) {
  const out: { key: string; title: string; question: string | null; metrics: LeagueMetric[] }[] = []
  for (const m of lg.metrics) {
    if (m.chapter !== chapter) continue
    let s = out.find((x) => x.key === m.section)
    if (!s) out.push((s = { key: m.section, title: m.sectionTitle, question: m.question, metrics: [] }))
    s.metrics.push(m)
  }
  return out
}

function SectionBlock({ lg, team, filter, chapter, section, focus, jump }: {
  lg: League; team: TeamFile; filter: Filter; chapter: string; section: { key: string; title: string; question: string | null; metrics: LeagueMetric[] }
  focus: string | null; jump: number
}) {
  const [sel, setSel] = useState(focus ?? section.metrics.find((m) => m.format === 'int')?.key ?? section.metrics[0].key)
  const [pick, setPick] = useState<number | null>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focus) return
    setSel(focus)
    box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focus, jump])
  const m = section.metrics.find((x) => x.key === sel)!
  const one = (v: number) => (m.format === 'int' ? `${Math.round(v)}` : fmt(v, m.format))
  const byId = new Map(lg.matches.map((x) => [x.id, x]))
  const games = team.matches.map((id) => byId.get(id)!)
  const labels = games.map((g) => {
    const home = g.homeId === team.id
    return `${shortDate(g.date)} ${home ? '主' : '客'} ${lg.teams[home ? g.awayId : g.homeId].nameZh} ${home ? g.score[0] : g.score[1]}–${home ? g.score[1] : g.score[0]}`
  })
  const keep = kept(lg, team, filter)
  const picked = pick != null ? games[pick] : null
  const href = picked ? matchHref(picked, team.id, chapter) : null
  const league = ranked(lg, sel, filter).map((r) => ({ id: r.teamId, v: r.v, name: r.name }))
  return (
    <section ref={box} className={`tm-section${focus ? ' is-focus' : ''}`}>
      <div className="tm-sec-head">
        <h2 className="t-title">{section.title}<Info text={section.question} /></h2>
      </div>
      <div className="tm-sec-body">
        <div className="tm-chart">
          <div className="t-label">{`${m.label} · 每场`}<Info text="横线是联赛平均；点一根柱子看是哪一场；柱子上方的点是有视频的场次。" /></div>
          <MatchBars
            values={team.series[sel] ?? []}
            labels={labels}
            mean={leagueMean(lg, sel, filter)}
            meanLabel={fmt(leagueMean(lg, sel, filter), m.format)}
            keep={keep}
            video={games.map((g) => g.video)}
            selected={pick}
            onPick={(i) => setPick(pick === i ? null : i)}
            format={one}
          />
          {picked && (
            <p className="t-caption">
              {`${labels[pick!]}：${team.series[sel]?.[pick!] == null ? '—' : one(team.series[sel][pick!]!)}　`}
              {href && <a href={href}>{`打开这场 →`}</a>}
            </p>
          )}
          <div className="t-label rd-swarm-label">{`${lg.nameZh}每支队`}</div>
          <Swarm rows={league} me={team.id} median={median(league.map((r) => r.v))} fmt={(v) => fmt(v, m.format)} />
        </div>
        <div>
          <table className="tm-metrics">
            <thead>
              <tr>
                <th />
                <th className="t-label">{filter === 'all' ? '场均 / 整季' : FILTERS.find(([k]) => k === filter)![1]}</th>
                <th className="t-label" title="按数值从多到少排">排名</th>
                <th className="t-label">联赛位置</th>
                <th className="t-label">对手</th>
              </tr>
            </thead>
            <tbody>
              {section.metrics.map((x) => {
                const v = value(lg, team.id, x.key, filter)
                const rk = rankOf(lg, team.id, x.key, filter)
                return (
                  <tr key={x.key} className={sel === x.key ? 'is-selected' : ''} onClick={() => { setSel(x.key); setPick(null) }}>
                    <th><div className="t-body"><Defined label={x.label} hint={x.hint} /></div></th>
                    <td className="t-figure">{fmt(v, x.format)}</td>
                    <td className="t-numeric">{v == null ? '—' : `${rk.rank}/${rk.of}`}</td>
                    <td><Strip rows={ranked(lg, x.key, filter)} highlight={team.id} mean={leagueMean(lg, x.key, filter)} label={(y) => fmt(y, x.format)} width={150} /></td>
                    <td className="t-numeric tm-opp">{fmt(value(lg, team.id, x.key, filter, 'opp'), x.format)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <WhoMost lg={lg} team={team} chapter={chapter} metric={m} filter={filter} />
        </div>
      </div>
    </section>
  )
}

/** Who did most of the picked reading for the team in these matches: the top three and their part of the team's
 *  count. A shot after a set piece counts for the taker, so those show no part of the team's shots. */
function WhoMost({ lg, team, chapter, metric, filter }: { lg: League; team: TeamFile; chapter: string; metric: LeagueMetric; filter: Filter }) {
  const top = team.who?.[filter]?.[metric.key]
  if (!top?.length) return null
  const total = lg.season[filter]?.[team.id]?.[metric.key]?.[0] ?? 0
  const name = new Map(team.squad.map((p) => [p.id, p.nameZh]))
  const taker = metric.key.startsWith('set-pieces.') && /shots(_after)?$/.test(metric.key)
  return (
    <p className="pt-who">
      <span className="t-label">谁做得最多{taker && <Info text="按主罚的人算" />}</span>
      {top.map(([pid, n]) => (
        <a key={pid} href={playerHref(pid, { tab: 'data', chapter, focus: metric.key })}>
          <span className="t-body">{name.get(pid) ?? ''}</span>
          <span className="t-numeric">{` ${n}`}</span>
          {total > 0 && !taker && <span className="t-caption">{`（${Math.round((n / total) * 100)}%）`}</span>}
        </a>
      ))}
    </p>
  )
}

function Schedule({ lg, teamId }: { lg: League; teamId: string }) {
  const rs = results(lg, teamId)
  const stages = [...new Set(rs.map((r) => r.m.stage))]
  return (
    <div className="tm-schedule">
      {stages.map((st) => (
        <table key={st} className="tm-table">
          <caption className="t-label">{st}</caption>
          <thead>
            <tr>{['轮次', '日期', '分组', '对手', '主客', '比分', '', '视频', ''].map((c, i) => <th key={i} className="t-label">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rs.filter((r) => r.m.stage === st).map((r) => {
              const href = matchHref(r.m, teamId)
              return (
                <tr key={r.m.id}>
                  <td className="t-numeric">{r.m.week ?? ''}</td>
                  <td className="t-numeric">{shortDate(r.m.date)}</td>
                  <td className="t-caption">{r.m.group ?? ''}</td>
                  <td><a href={teamHref(r.oppId)}>{lg.teams[r.oppId].nameZh}</a></td>
                  <td>{r.home ? '主' : '客'}</td>
                  <td className="t-numeric">{`${r.gf}–${r.ga}`}</td>
                  <td><span className={`tm-res r-${r.r}`}>{r.r}</span></td>
                  <td>{r.m.video ? <span className="tm-has-video">有视频</span> : ''}</td>
                  <td>{href ? <a href={href}>比赛分析 →</a> : r.m.awarded ? <span className="t-caption">{r.m.awarded}</span> : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ))}
    </div>
  )
}

/** 阵容: who played where for the team (minutes per position), then everyone who played, most minutes first. */
function Lineup({ lg, team }: { lg: League; team: TeamFile }) {
  const groups = [...new Set(team.squad.map((p) => p.group))]
  return (
    <div className="pt-lineup">
      <Head
        title="阵容"
        info="整季在每个位置上踢了多少分钟：一个位置列前 3 人（踢满 45 分钟才算），全队不到 270 分钟的位置不列。从左到右是从本方球门到对方球门，上面是左路。"
        extra={
          <span className="pt-lineup-links t-caption">
            {['门将', '中卫', '边后卫', '中场', '边路', '前锋'].filter((g) => groups.includes(g)).map((g) => (
              <a key={g} href={playersHref({ league: lg.slug, group: g, hl: team.id })}>{g}</a>
            ))}
          </span>
        }
      />
      <DepthChart places={lg.places} rows={team.squad.map((p) => ({ id: p.id, name: p.nameZh, places: p.places }))} href={(id) => playerHref(id)} />
      <table className="tm-table pt-roster">
        <thead>
          <tr>{['号码', '球员', '位置组', '主要位置', '年龄', '身高', '出场', '首发', '分钟', '进球', '助攻'].map((c) => <th key={c} className="t-label">{c}</th>)}</tr>
        </thead>
        <tbody>
          {team.squad.map((p) => (
            <tr key={p.id}>
              <td className="t-numeric">{p.number ?? ''}</td>
              <td>
                <a href={playerHref(p.id)}>{p.nameZh}</a>
                {p.moved && <span className="t-caption">{p.moved === 'in' ? '（赛季中转来）' : '（后来转走）'}</span>}
              </td>
              <td className="t-caption">{p.group}</td>
              <td className="t-caption">{Object.keys(p.places)[0] ?? ''}</td>
              <td className="t-numeric">{p.age ?? ''}</td>
              <td className="t-numeric">{p.height ?? ''}</td>
              <td className="t-numeric">{p.apps}</td>
              <td className="t-numeric">{p.starts}</td>
              <td className="t-numeric">{fmtInt(p.minutes)}</td>
              <td className="t-numeric">{p.goals || ''}</td>
              <td className="t-numeric">{p.assists || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
