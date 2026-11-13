// PROTOTYPE · Team A「仪表盘 + 章节」: a dense header (standing, record, form), then the five readings where the
// team is furthest from the league, then tabs that mirror the match page: the six chapters for the whole season,
// plus fixtures and squad. Inside a chapter each section keeps the match page's rule: the table is the filter,
// the chart shows the picked row match by match.
import { useEffect, useRef, useState } from 'react'
import { MatchBars, Form, Strip } from './charts'
import {
  distinct, fmt, leagueMean, matchHref, rankOf, ranked, results, value, type League, type LeagueMetric,
} from './data'
import { Nav } from './parts'
import { CHAPTER_KEYS, CHAPTER_ZH, PlayersTable, ScheduleTable, TeamPicker, matchLabels, record, sectionsOf, standingLine } from './teamParts'

type Tab = string // a chapter key, 'schedule' or 'players'

export function TeamA({ all, lg, teamId, onTeam, initialTab }: { all: League[]; lg: League; teamId: string; onTeam: (id: string) => void; initialTab: string | null }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview')
  const [focus, setFocus] = useState<string | null>(null)
  const team = lg.teams[teamId]
  const rec = record(lg, teamId)
  const rs = results(lg, teamId)
  const odd = distinct(lg, teamId, 5)
  return (
    <div className="sh-page ta">
      <Nav active="teams" />
      <header className="ta-head">
        <div className="ta-id">
          <div className="t-caption">{`${lg.nameZh} · 2026 赛季`}</div>
          <h1 className="t-display">{team.nameZh}</h1>
          <div className="t-lead">{standingLine(lg, teamId)}</div>
        </div>
        <dl className="ta-record">
          <div><dt className="t-label">场次</dt><dd className="t-figure">{rec.n}</dd></div>
          <div><dt className="t-label">胜 平 负</dt><dd className="t-figure">{`${rec.w} ${rec.d} ${rec.l}`}</dd></div>
          <div><dt className="t-label">进 失</dt><dd className="t-figure">{`${rec.gf} ${rec.ga}`}</dd></div>
          <div><dt className="t-label">最近 6 场</dt><dd><Form list={rs.slice(-6).map((r) => ({ r: r.r, title: `${r.m.date} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}`, href: matchHref(r.m, teamId) }))} /></dd></div>
          <div><dt className="t-label">视频</dt><dd className="t-figure">{rec.video}</dd></div>
        </dl>
        <TeamPicker all={all} lg={lg} teamId={teamId} onPick={onTeam} />
      </header>

      <section className="ta-odd">
        <div className="t-label">和{lg.nameZh}其他队最不一样的 5 项</div>
        <div className="ta-tiles">
          {odd.map(({ m, z }) => {
            const rk = rankOf(lg, teamId, m.key)
            return (
              <button key={m.key} className="ta-tile" onClick={() => { setTab(m.chapter); setFocus(m.key) }}>
                <span className="t-caption">{`${CHAPTER_ZH[m.chapter]} · ${m.sectionTitle}`}</span>
                <span className="t-heading">{m.label}</span>
                <span className="t-figure">{fmt(value(lg, teamId, m.key), m.format)}</span>
                <span className="t-caption">{`${z > 0 ? '偏多' : '偏少'} · 第 ${rk.rank}/${rk.of} · 联赛 ${fmt(leagueMean(lg, m.key), m.format)}`}</span>
                <Strip rows={ranked(lg, m.key).map((r) => ({ ...r, name: lg.teams[r.teamId].nameZh }))} highlight={teamId} mean={leagueMean(lg, m.key)} label={(v) => fmt(v, m.format)} width={170} />
              </button>
            )
          })}
        </div>
      </section>

      <nav className="tabs ta-tabs">
        {CHAPTER_KEYS.map((c) => (
          <button key={c} aria-current={tab === c} onClick={() => { setTab(c); setFocus(null) }}>{CHAPTER_ZH[c]}</button>
        ))}
        <span className="ta-tab-gap" />
        <button aria-current={tab === 'schedule'} onClick={() => setTab('schedule')}>赛程</button>
        <button aria-current={tab === 'players'} onClick={() => setTab('players')}>球员</button>
      </nav>

      <main className="ta-main">
        {tab === 'schedule' ? (
          <ScheduleTable lg={lg} teamId={teamId} />
        ) : tab === 'players' ? (
          <PlayersTable lg={lg} teamId={teamId} />
        ) : (
          sectionsOf(lg, tab).map((s) => (
            <SectionA key={`${teamId}-${s.key}`} lg={lg} teamId={teamId} chapter={tab} title={s.title} question={s.question} metrics={s.metrics}
              initial={s.metrics.find((m) => m.key === focus)?.key} />
          ))
        )}
      </main>
    </div>
  )
}

function SectionA({ lg, teamId, chapter, title, question, metrics, initial }: {
  lg: League; teamId: string; chapter: string; title: string; question: string | null; metrics: LeagueMetric[]; initial?: string
}) {
  const playable = metrics.filter((m) => m.format === 'int')
  const [sel, setSel] = useState(initial ?? playable[0]?.key ?? metrics[0].key)
  const [match, setMatch] = useState<number | null>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!initial) return
    setSel(initial)
    box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [initial])
  const m = metrics.find((x) => x.key === sel)!
  const series = lg.series[teamId]?.[sel]
  const rs = results(lg, teamId)
  const labels = matchLabels(lg, teamId)
  const picked = match != null ? rs[match] : null
  return (
    <section ref={box} className={`ta-section${initial ? ' is-focus' : ''}`}>
      <div className="ta-sec-head">
        <h2 className="t-title">{title}</h2>
        {question && <p className="t-lead">{question}</p>}
      </div>
      <div className="ta-sec-body">
        <div className="ta-chart">
          <div className="t-label">{`${m.label} · 每场`}</div>
          {series ? (
            <MatchBars values={series} labels={labels} mean={leagueMean(lg, sel)} selected={match} onPick={setMatch} marks={rs.map((r) => r.m.video)} width={520} />
          ) : (
            <p className="t-caption">比率类的读数只看整季，不拆到每场。</p>
          )}
          <p className="t-caption">
            {picked
              ? <>{`${labels[match!]}：${series?.[match!] ?? '—'}。`}{matchHref(picked.m, teamId, chapter) ? <a href={matchHref(picked.m, teamId, chapter)!}>{`打开这场的${CHAPTER_ZH[chapter]} →`}</a> : '这场没有比赛页（原型只生成了厦门飞鹭的）。'}</>
              : '横线是联赛场均；点一根柱子看是哪一场。绿点：有视频的场次。'}
          </p>
        </div>
        <table className="ta-metrics">
          <thead>
            <tr>
              <th />
              <th className="t-label">场均</th>
              <th className="t-label" title="按场均从多到少排">排名（多→少）</th>
              <th className="t-label">对手场均</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((x) => {
              const rk = rankOf(lg, teamId, x.key)
              return (
                <tr key={x.key} className={`${sel === x.key ? 'is-selected' : ''}${x.format === 'int' ? '' : ' is-readonly'}`} onClick={() => { setSel(x.key); setMatch(null) }}>
                  <th>
                    <div className="t-body">{x.label}</div>
                    {x.hint && <div className="t-caption">{x.hint}</div>}
                  </th>
                  <td className="t-figure">{fmt(value(lg, teamId, x.key), x.format)}</td>
                  <td className="t-numeric">{`${rk.rank}/${rk.of}`}</td>
                  <td className="t-numeric ta-opp">{fmt(value(lg, teamId, x.key, 'opp'), x.format)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
