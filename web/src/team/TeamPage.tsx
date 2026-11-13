// /team/<id>/?tab=<chapter | schedule | players>&filter=<all | home | away | last5>: one team's season.
// A header (standing, record, form), the five readings where the team is furthest from its league, then tabs that
// mirror the match page: the six chapters over the season, fixtures and squad. Inside a chapter the table is the
// filter, as on the match page: the chart shows the picked row match by match. The filter picks which matches count.
import { useEffect, useRef, useState } from 'react'
import { Nav } from '../app/Nav'
import { CHAPTERS } from '../match-analysis/common'
import { Form, MatchBars, RankLine, Strip } from './charts'
import {
  FILTERS, distinct, fmt, kept, leagueMean, loadLeague, loadTeam, matchHref, rankOf, ranked, results, shortDate, standingLine,
  standings, teamHref, value, type Filter, type League, type LeagueMetric, type TeamFile,
} from './data'

const CHAPTER_ZH: Record<string, string> = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.zh]))
const TABS = [...CHAPTERS.map((c) => c.key as string), 'schedule', 'players']

function readUrl() {
  const q = new URLSearchParams(location.search)
  const tab = q.get('tab') ?? q.get('chapter')
  const filter = q.get('filter') as Filter | null
  return { tab: tab && TABS.includes(tab) ? tab : 'overview', filter: filter && FILTERS.some(([k]) => k === filter) ? filter : 'all' }
}

export function TeamPage({ teamId }: { teamId: string }) {
  const [data, setData] = useState<{ lg: League; team: TeamFile } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(() => readUrl().tab)
  const [filter, setFilter] = useState<Filter>(() => readUrl().filter)
  const [focus, setFocus] = useState<string | null>(null)

  useEffect(() => {
    loadTeam(teamId)
      .then((team) => loadLeague(team.league).then((lg) => setData({ lg, team })))
      .catch((e: Error) => setError(e.message))
  }, [teamId])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('tab', tab)
    url.searchParams.delete('chapter')
    if (filter === 'all') url.searchParams.delete('filter')
    else url.searchParams.set('filter', filter)
    history.replaceState(null, '', url)
    if (data) document.title = `${data.lg.teams[teamId].nameZh} · Threader`
  }, [tab, filter, data, teamId])

  if (error) return <p className="boot">{`球队没有加载出来（${error}）。`}<a href="/teams/">回到球队</a></p>
  if (!data) return <p className="boot">加载中…</p>
  const { lg, team } = data
  const rs = results(lg, teamId)
  const rec = {
    w: rs.filter((r) => r.r === '胜').length, d: rs.filter((r) => r.r === '平').length, l: rs.filter((r) => r.r === '负').length,
    gf: rs.reduce((s, r) => s + r.gf, 0), ga: rs.reduce((s, r) => s + r.ga, 0), video: rs.filter((r) => r.m.video).length,
  }
  const isChapter = CHAPTERS.some((c) => c.key === tab)
  return (
    <div className="tm">
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
          <select value={teamId} onChange={(e) => location.assign(teamHref(e.target.value, tab))} aria-label="分析对象">
            {Object.values(lg.teams).sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh')).map((t) => <option key={t.id} value={t.id}>{t.nameZh}</option>)}
          </select>
          <a href={`/teams/?league=${lg.slug}`} className="t-caption">其他联赛 →</a>
        </div>
      </header>

      <section className="tm-odd">
        <div className="t-label">{`和${lg.nameZh}其他队最不一样的 5 项（整季）`}</div>
        <div className="tm-tiles">
          {distinct(lg, teamId).map(({ m, z }) => {
            const rk = rankOf(lg, teamId, m.key)
            return (
              <button key={m.key} className="tm-tile" onClick={() => { setTab(m.chapter); setFilter('all'); setFocus(m.key) }}>
                <span className="t-caption">{`${CHAPTER_ZH[m.chapter]} · ${m.sectionTitle}`}</span>
                <span className="t-heading">{m.label}</span>
                <span className="t-figure">{fmt(value(lg, teamId, m.key), m.format)}</span>
                <span className="t-caption">{`${z > 0 ? '偏多' : '偏少'} · 第 ${rk.rank}/${rk.of} · 联赛平均 ${fmt(leagueMean(lg, m.key), m.format)}`}</span>
                <Strip rows={ranked(lg, m.key)} highlight={teamId} mean={leagueMean(lg, m.key)} label={(v) => fmt(v, m.format)} width={170} />
              </button>
            )
          })}
        </div>
      </section>

      <nav className="tabs tm-tabs" aria-label="章">
        {CHAPTERS.map((c) => (
          <button key={c.key} aria-current={tab === c.key} onClick={() => { setTab(c.key); setFocus(null) }}>{c.zh}</button>
        ))}
        {isChapter && (
          <div className="seg seg-sm tm-filter" role="group" aria-label="哪些比赛">
            {FILTERS.map(([k, zh]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{zh}</button>)}
          </div>
        )}
        <span className="tm-tab-gap" />
        <button aria-current={tab === 'schedule'} onClick={() => setTab('schedule')}>赛程</button>
        <button aria-current={tab === 'players'} onClick={() => setTab('players')}>球员</button>
      </nav>

      <main className="tm-main">
        {tab === 'schedule' ? (
          <Schedule lg={lg} teamId={teamId} />
        ) : tab === 'players' ? (
          <Players team={team} />
        ) : (
          <>
            {tab === 'overview' && <RankBlock lg={lg} teamId={teamId} />}
            {sections(lg, tab).map((s) => (
              <SectionBlock key={`${teamId}-${tab}-${s.key}`} lg={lg} team={team} filter={filter} chapter={tab} section={s} focus={s.metrics.some((m) => m.key === focus) ? focus : null} />
            ))}
          </>
        )}
      </main>
    </div>
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

function RankBlock({ lg, teamId }: { lg: League; teamId: string }) {
  const rs = results(lg, teamId)
  return (
    <section className="tm-section">
      <div className="tm-sec-head">
        <h2 className="t-title">排名走势</h2>
        <p className="t-lead">{lg.stages.length > 1 ? '每轮之后在本组的名次；决赛阶段的积分含预赛带入。' : '每轮之后的名次。'}</p>
      </div>
      <RankLine
        parts={standings(lg, teamId).map((s) => ({ label: s.group.name ?? s.stage, size: s.group.rows.length, points: s.group.history[teamId] ?? [] }))}
        width={760}
      />
      <div className="tm-results">
        <Form list={rs.map((r) => ({ r: r.r, title: `${r.m.date} ${r.home ? '主' : '客'} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}${r.m.awarded ? '（判负）' : ''}`, href: matchHref(r.m, teamId) }))} />
      </div>
    </section>
  )
}

function SectionBlock({ lg, team, filter, chapter, section, focus }: {
  lg: League; team: TeamFile; filter: Filter; chapter: string; section: { key: string; title: string; question: string | null; metrics: LeagueMetric[] }; focus: string | null
}) {
  const [sel, setSel] = useState(focus ?? section.metrics.find((m) => m.format === 'int')?.key ?? section.metrics[0].key)
  const [pick, setPick] = useState<number | null>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focus) return
    setSel(focus)
    box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focus])
  const m = section.metrics.find((x) => x.key === sel)!
  const one = (v: number) => (m.format === 'int' ? `${Math.round(v)}` : fmt(v, m.format)) // one match: counts are whole
  const byId = new Map(lg.matches.map((x) => [x.id, x]))
  const games = team.matches.map((id) => byId.get(id)!)
  const labels = games.map((g) => {
    const home = g.homeId === team.id
    return `${shortDate(g.date)} ${home ? '主' : '客'} ${lg.teams[home ? g.awayId : g.homeId].nameZh} ${home ? g.score[0] : g.score[1]}–${home ? g.score[1] : g.score[0]}`
  })
  const keep = kept(lg, team, filter)
  const picked = pick != null ? games[pick] : null
  const href = picked ? matchHref(picked, team.id, chapter) : null
  return (
    <section ref={box} className={`tm-section${focus ? ' is-focus' : ''}`}>
      <div className="tm-sec-head">
        <h2 className="t-title">{section.title}</h2>
        {section.question && <p className="t-lead">{section.question}</p>}
      </div>
      <div className="tm-sec-body">
        <div className="tm-chart">
          <div className="t-label">{`${m.label} · 每场`}</div>
          <MatchBars
            values={team.series[sel] ?? []}
            labels={labels}
            mean={leagueMean(lg, sel, filter)}
            meanLabel={fmt(leagueMean(lg, sel, filter), m.format)}
            keep={keep}
            video={games.map((g) => g.video)}
            selected={pick}
            onPick={setPick}
            format={one}
          />
          <p className="t-caption">
            {picked ? (
              <>
                {`${labels[pick!]}：${team.series[sel]?.[pick!] == null ? '—' : one(team.series[sel][pick!]!)}。`}
                {href ? <a href={href}>{`打开这场的${CHAPTER_ZH[chapter]} →`}</a> : '这场还没有比赛页。'}
              </>
            ) : (
              '横线是联赛平均；点一根柱子看是哪一场。柱子上方的点：有视频的场次。'
            )}
          </p>
        </div>
        <table className="tm-metrics">
          <thead>
            <tr>
              <th />
              <th className="t-label">{filter === 'all' ? '场均 / 整季' : FILTERS.find(([k]) => k === filter)![1]}</th>
              <th className="t-label" title="按数值从多到少排">排名（多→少）</th>
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
                  <th>
                    <div className="t-body">{x.label}</div>
                    {x.hint && <div className="t-caption">{x.hint}</div>}
                  </th>
                  <td className="t-figure">{fmt(v, x.format)}</td>
                  <td className="t-numeric">{v == null ? '—' : `${rk.rank}/${rk.of}`}</td>
                  <td><Strip rows={ranked(lg, x.key, filter)} highlight={team.id} mean={leagueMean(lg, x.key, filter)} label={(y) => fmt(y, x.format)} width={150} /></td>
                  <td className="t-numeric tm-opp">{fmt(value(lg, team.id, x.key, filter, 'opp'), x.format)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
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

function Players({ team }: { team: TeamFile }) {
  return (
    <table className="tm-table tm-players">
      <thead>
        <tr>{['球员', '位置', '出场', '首发', '分钟', '进球', '触球 / 90 分钟', '关键动作'].map((c) => <th key={c} className="t-label">{c}</th>)}</tr>
      </thead>
      <tbody>
        {team.players.filter((p) => p.apps > 0).map((p) => (
          <tr key={p.id}>
            <td>{`${p.number != null ? `#${p.number} ` : ''}${p.nameZh}`}</td>
            <td className="t-caption">{p.position}</td>
            <td className="t-numeric">{p.apps}</td>
            <td className="t-numeric">{p.starts}</td>
            <td className="t-numeric">{p.minutes}</td>
            <td className="t-numeric">{p.goals || ''}</td>
            <td className="t-numeric">{p.minutes ? ((p.touches / p.minutes) * 90).toFixed(1) : '—'}</td>
            <td className="t-numeric">{p.keyActions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
