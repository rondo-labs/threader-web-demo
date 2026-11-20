// PROTOTYPE: the team season page (web/src/team/TeamPage.tsx) with the two links into the players: every section
// says who did most of the picked reading (the top three and their part of the team's count, each name opening
// that player's same section), and the 球员 tab becomes 阵容 — who played where, by minutes, and the squad table.
import { useEffect, useRef, useState } from 'react'
import { CHAPTERS } from '../../match-analysis/common'
import { Form, MatchBars, RankLine, Strip } from '../../team/charts'
import {
  FILTERS, fmt, kept, leagueMean, loadLeague, loadTeam, matchHref, rankOf, ranked, results, shortDate, standingLine,
  standings, value, type Filter, type League, type LeagueMetric, type TeamFile,
} from '../../team/data'
import { DepthChart } from './charts'
import { fmtInt, indexHref, loadPlayers, mainPlace, nameOf, playerHref, reading, teamHref, type Season } from './data'
import { ProtoNav } from './parts'

const CHAPTER_ZH: Record<string, string> = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.zh]))
const TABS = [...CHAPTERS.map((c) => c.key as string), 'schedule', 'lineup']

function readUrl() {
  const q = new URLSearchParams(location.search)
  const tab = q.get('tab')
  const filter = q.get('filter') as Filter | null
  return {
    tab: tab && TABS.includes(tab) ? tab : 'overview',
    filter: filter && FILTERS.some(([k]) => k === filter) ? filter : ('all' as Filter),
    focus: q.get('focus'),
  }
}

export function TeamPlus({ teamId }: { teamId: string }) {
  const [data, setData] = useState<{ lg: League; team: TeamFile; S: Season } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(() => readUrl().tab)
  const [filter, setFilter] = useState<Filter>(() => readUrl().filter)
  const [focus, setFocus] = useState<string | null>(() => readUrl().focus)

  useEffect(() => {
    loadTeam(teamId)
      .then((team) => Promise.all([loadLeague(team.league), loadPlayers(team.league)]).then(([lg, S]) => setData({ lg, team, S })))
      .catch((e: Error) => setError(e.message))
  }, [teamId])
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('tab', tab)
    if (filter === 'all') url.searchParams.delete('filter')
    else url.searchParams.set('filter', filter)
    if (focus) url.searchParams.set('focus', focus)
    else url.searchParams.delete('focus')
    history.replaceState(null, '', url)
    if (data) document.title = `原型 · ${data.lg.teams[teamId].nameZh}`
  }, [tab, filter, focus, data, teamId])

  if (error) return <p className="boot">{`球队没有加载出来（${error}）。`}</p>
  if (!data) return <p className="boot">加载中…</p>
  const { lg, team, S } = data
  const rs = results(lg, teamId)
  const rec = {
    w: rs.filter((r) => r.r === '胜').length, d: rs.filter((r) => r.r === '平').length, l: rs.filter((r) => r.r === '负').length,
    gf: rs.reduce((s, r) => s + r.gf, 0), ga: rs.reduce((s, r) => s + r.ga, 0), video: rs.filter((r) => r.m.video).length,
  }
  const isChapter = CHAPTERS.some((c) => c.key === tab)
  return (
    <div className="tm">
      <ProtoNav />
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
          <select value={teamId} onChange={(e) => location.assign(teamHref(e.target.value, { tab }))} aria-label="分析对象">
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
        <button aria-current={tab === 'lineup'} onClick={() => setTab('lineup')}>阵容</button>
      </nav>

      <main className="tm-main">
        {tab === 'schedule' ? (
          <Schedule lg={lg} teamId={teamId} />
        ) : tab === 'lineup' ? (
          <Lineup S={S} teamId={teamId} />
        ) : (
          <>
            {tab === 'overview' && <RankBlock lg={lg} teamId={teamId} />}
            {sections(lg, tab).map((s) => (
              <SectionBlock key={`${teamId}-${tab}-${s.key}`} lg={lg} team={team} S={S} filter={filter} chapter={tab} section={s} focus={s.metrics.some((m) => m.key === focus) ? focus : null} />
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
      <RankLine parts={standings(lg, teamId).map((s) => ({ label: s.group.name ?? s.stage, size: s.group.rows.length, points: s.group.history[teamId] ?? [] }))} width={760} />
      <div className="tm-results">
        <Form list={rs.map((r) => ({ r: r.r, title: `${r.m.date} ${r.home ? '主' : '客'} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}${r.m.awarded ? '（判负）' : ''}`, href: matchHref(r.m, teamId) }))} />
      </div>
    </section>
  )
}

/** Who did most of the reading for the team in these matches: the top three and their part of the team's count. */
function WhoMost({ S, lg, teamId, chapter, metric, filter }: { S: Season; lg: League; teamId: string; chapter: string; metric: LeagueMetric; filter: Filter }) {
  const i = S.idx[metric.key]
  if (i == null || S.lg.metrics[i].format !== 'int') return null
  const pm = S.lg.metrics[i]
  const f = filter === 'last5' ? 'tlast5' : filter
  const total = lg.season[filter]?.[teamId]?.[metric.key]?.[0] ?? 0
  const top = (S.teamStints.get(teamId) ?? [])
    .map((s) => ({ s, n: reading(s.f[f], i, pm).total }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
  if (!top.length) return null
  const after = metric.key.startsWith('set-pieces.') && metric.key.endsWith('shots') || metric.key.endsWith('shots_after')
  return (
    <p className="pt-who">
      <span className="t-label">{`${metric.label} · 谁做得最多`}</span>
      {top.map(({ s, n }) => (
        <a key={s.p} href={playerHref(s.p, S.lg.slug, { tab: chapter, focus: metric.key })}>
          <span className="t-body">{nameOf(S.lg.players[s.p])}</span>
          <span className="t-numeric">{` ${n}`}</span>
          {total > 0 && !after && <span className="t-caption">{`（${Math.round((n / total) * 100)}%）`}</span>}
        </a>
      ))}
      {after && <span className="t-caption">按主罚的人算</span>}
    </p>
  )
}

function SectionBlock({ lg, team, S, filter, chapter, section, focus }: {
  lg: League; team: TeamFile; S: Season; filter: Filter; chapter: string; section: { key: string; title: string; question: string | null; metrics: LeagueMetric[] }; focus: string | null
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
            values={team.series[sel] ?? []} labels={labels} mean={leagueMean(lg, sel, filter)} meanLabel={fmt(leagueMean(lg, sel, filter), m.format)}
            keep={keep} video={games.map((g) => g.video)} selected={pick} onPick={setPick} format={one}
          />
          <p className="t-caption">
            {picked ? (
              <>
                {`${labels[pick!]}：${team.series[sel]?.[pick!] == null ? '—' : one(team.series[sel][pick!]!)}。`}
                {href ? <a href={href}>{`打开这场的${CHAPTER_ZH[chapter]} →`}</a> : '这场还没有比赛页。'}
              </>
            ) : '横线是联赛平均；点一根柱子看是哪一场。柱子上方的点：有视频的场次。'}
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
          <WhoMost S={S} lg={lg} teamId={team.id} chapter={chapter} metric={m} filter={filter} />
        </div>
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
                  <td><a href={teamHref(r.oppId, { tab: 'schedule' })}>{lg.teams[r.oppId].nameZh}</a></td>
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
function Lineup({ S, teamId }: { S: Season; teamId: string }) {
  const rows = (S.teamStints.get(teamId) ?? []).filter((s) => s.f.all[0] > 0).sort((a, b) => b.f.all[0] - a.f.all[0])
  const goals = S.idx['overview.personal.goals'], assists = S.idx['overview.personal.assists']
  const groups = [...new Set(rows.map((s) => S.lg.players[s.p].group))]
  return (
    <div className="pt-lineup">
      <div className="pt-lineup-head">
        <div>
          <h2 className="t-title">谁在哪个位置踢</h2>
          <p className="t-lead">整季在每个位置上踢了多少分钟：一个位置列前 3 人（踢满 45 分钟才算），全队不到 270 分钟的位置不列。从左到右是从本方球门到对方球门，上面是左路。</p>
        </div>
        <div className="pt-lineup-links t-caption">
          {'在联赛里看这些人：'}
          {S.lg.groups.filter((g) => groups.includes(g)).map((g) => (
            <a key={g} href={indexHref({ league: S.lg.slug, group: g, hl: teamId })}>{g}</a>
          ))}
        </div>
      </div>
      <DepthChart places={S.lg.places} rows={rows.map((s) => ({ id: s.p, pos: s.pos }))} nameOf={(id) => nameOf(S.lg.players[id])} href={(id) => playerHref(id, S.lg.slug)} />
      <table className="tm-table pt-roster">
        <thead>
          <tr>{['号码', '球员', '位置', '主要位置', '年龄', '身高', '出场', '首发', '分钟', '进球', '助攻'].map((c) => <th key={c} className="t-label">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const p = S.lg.players[s.p]
            const all = s.f.all
            return (
              <tr key={s.p}>
                <td className="t-numeric">{p.number ?? ''}</td>
                <td><a href={playerHref(s.p, S.lg.slug)}>{nameOf(p)}</a>{p.teams.length > 1 && <span className="t-caption">{p.teams[0] === teamId ? '（后来转走）' : '（赛季中转来）'}</span>}</td>
                <td className="t-caption">{p.group}</td>
                <td className="t-caption">{mainPlace(s.pos)}</td>
                <td className="t-numeric">{p.age ?? ''}</td>
                <td className="t-numeric">{p.height ?? ''}</td>
                <td className="t-numeric">{all[1]}</td>
                <td className="t-numeric">{all[2]}</td>
                <td className="t-numeric">{fmtInt(all[0])}</td>
                <td className="t-numeric">{(all[3][goals] as number) || ''}</td>
                <td className="t-numeric">{(all[3][assists] as number) || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The prototype's five: the readings furthest from the league's middle, either way. The production team page
 *  replaced this with a fixed five (web/src/team/data.ts FIVE, 2026-11-20); kept here so the prototype still runs. */
function distinct(lg: League, teamId: string, n = 5) {
  const seen = new Set<string>()
  const comparable = lg.metrics.filter((m) => {
    if ((m.chapter === 'overview' && m.section === 'timeline') || seen.has(m.label)) return false
    if (m.format === 'int' && leagueMean(lg, m.key) < 0.6) return false
    seen.add(m.label)
    return true
  })
  const z = (key: string) => {
    const rows = ranked(lg, key)
    const mean = rows.reduce((s, r) => s + r.v, 0) / rows.length
    const sd = Math.sqrt(rows.reduce((s, r) => s + (r.v - mean) ** 2, 0) / rows.length)
    const v = value(lg, teamId, key)
    return v == null || !sd ? 0 : (v - mean) / sd
  }
  return comparable
    .map((m) => ({ m, z: z(m.key) }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, n)
}
