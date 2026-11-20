// /team/<id>/?tab=<chapter | schedule | lineup>&filter=<all | home | away | last5>&focus=<reading>: one team's season.
// A header (standing, record, form), the five readings every team is judged by (one per chapter), then tabs that
// mirror the match page: the six chapters over the season, fixtures and 阵容 (who played where). Inside a chapter the
// table is the filter, as on the match page: the chart shows the picked row match by match, and under the table the
// three players who did most of it open their own pages. The filter picks which matches count.
import { useEffect, useRef, useState } from 'react'
import { Nav } from '../app/Nav'
import { CHAPTERS } from '../match-analysis/common'
import { DepthChart } from '../players/charts'
import { fmtInt, playerHref, playersHref } from '../players/data'
import { Form, MatchBars, RankLine, Strip } from './charts'
import {
  FILTERS, fiveOf, fmt, fmtDiff, kept, leagueMean, loadLeague, loadTeam, matchHref, rankOf, ranked, results, shortDate, sideOf,
  standingLine, standings, teamHref, value, type FiveCard, type Filter, type League, type LeagueMetric, type TeamFile,
} from './data'

const CHAPTER_ZH: Record<string, string> = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.zh]))
const TABS = [...CHAPTERS.map((c) => c.key as string), 'schedule', 'lineup']

function readUrl() {
  const q = new URLSearchParams(location.search)
  const raw = q.get('tab') ?? q.get('chapter')
  const tab = raw === 'players' ? 'lineup' : raw // the tab was called 球员 before 阵容
  const filter = q.get('filter') as Filter | null
  return {
    tab: tab && TABS.includes(tab) ? tab : 'overview',
    filter: filter && FILTERS.some(([k]) => k === filter) ? filter : 'all',
    focus: q.get('focus'),
  }
}

export function TeamPage({ teamId }: { teamId: string }) {
  const [data, setData] = useState<{ lg: League; team: TeamFile } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(() => readUrl().tab)
  const [filter, setFilter] = useState<Filter>(() => readUrl().filter)
  const [focus, setFocus] = useState<string | null>(() => readUrl().focus)

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
    if (focus) url.searchParams.set('focus', focus)
    else url.searchParams.delete('focus')
    history.replaceState(null, '', url)
    if (data) document.title = `${data.lg.teams[teamId].nameZh} · Threader`
  }, [tab, filter, focus, data, teamId])

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
        <div className="t-label">{`最看重的 5 项（和${lg.nameZh}其他队比，整季）`}</div>
        <div className="tm-tiles">
          {fiveOf(lg, teamId).map((c) => (
            <FiveTile key={c.def.key} c={c} teamId={teamId} onPick={() => { setTab(c.def.chapter); setFilter('all'); setFocus(c.def.key) }} />
          ))}
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
        <button aria-current={tab === 'lineup'} onClick={() => setTab('lineup')}>阵容</button>
      </nav>

      <main className="tm-main">
        {tab === 'schedule' ? (
          <Schedule lg={lg} teamId={teamId} />
        ) : tab === 'lineup' ? (
          <Lineup lg={lg} team={team} />
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

/** One of the five: the team's figure, where it sits in the league, the league as a strip. The set-piece card is a
 *  difference (ours minus the opponents' per match), so it shows both sides and the season's goals instead of an average. */
function FiveTile({ c, teamId, onPick }: { c: FiveCard; teamId: string; onPick: () => void }) {
  const { def, m } = c
  const show = (v: number | null) => (def.vs ? fmtDiff(v) : fmt(v, m.format))
  const place = `第 ${c.rank}${def.fewer ? ' 少' : ''}/${c.of}`
  const where = c.value == null
    ? ''
    : def.vs
      ? `每场 ${fmt(c.us ?? null, m.format)} 比 ${fmt(c.them ?? null, m.format)} · ${place}`
      : `${sideOf(m.format, c.value, c.mean)} · ${place} · 联赛平均 ${fmt(c.mean, m.format)}`
  return (
    <button className="tm-tile" onClick={onPick} title={m.hint ?? undefined}>
      <span className="t-caption">{`${CHAPTER_ZH[def.chapter]} · ${def.ability}`}</span>
      <span className="t-heading">{def.label}</span>
      <span className="t-figure">{show(c.value)}</span>
      <span className="t-caption">{where}</span>
      <Strip rows={c.rows} highlight={teamId} mean={c.mean} label={show} width={170} />
      {c.goals && <span className="t-caption">{`整季定位球进 ${c.goals[0]} 个、失 ${c.goals[1]} 个`}</span>}
    </button>
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
        <div>
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
      <span className="t-label">{`${metric.label} · 谁做得最多`}</span>
      {top.map(([pid, n]) => (
        <a key={pid} href={playerHref(pid, { tab: chapter, focus: metric.key })}>
          <span className="t-body">{name.get(pid) ?? ''}</span>
          <span className="t-numeric">{` ${n}`}</span>
          {total > 0 && !taker && <span className="t-caption">{`（${Math.round((n / total) * 100)}%）`}</span>}
        </a>
      ))}
      {taker && <span className="t-caption">按主罚的人算</span>}
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
      <div className="pt-lineup-head">
        <div>
          <h2 className="t-title">谁在哪个位置踢</h2>
          <p className="t-lead">整季在每个位置上踢了多少分钟：一个位置列前 3 人（踢满 45 分钟才算），全队不到 270 分钟的位置不列。从左到右是从本方球门到对方球门，上面是左路。</p>
        </div>
        <div className="pt-lineup-links t-caption">
          {'在联赛里看这些人：'}
          {['门将', '中卫', '边后卫', '中场', '边路', '前锋'].filter((g) => groups.includes(g)).map((g) => (
            <a key={g} href={playersHref({ league: lg.slug, group: g, hl: team.id })}>{g}</a>
          ))}
        </div>
      </div>
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
