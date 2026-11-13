// PROTOTYPE · Team B「赛季长文」: one long page read top to bottom, like a season report, with a table of
// contents on the left: a one-line summary, the rank through the season, a profile against the league (every
// reading as a dot among the other teams, most unusual first), then a short block per chapter, fixtures, squad.
import { useState } from 'react'
import { Form, MatchBars, RankLine, Strip } from './charts'
import {
  comparable, distinct, fmt, leagueMean, matchHref, rankOf, ranked, results, standings, value, type League,
} from './data'
import { Nav } from './parts'
import { CHAPTER_KEYS, CHAPTER_ZH, KEY_METRICS, PlayersTable, ScheduleTable, TeamPicker, matchLabels, metricOf, record } from './teamParts'

export function TeamB({ all, lg, teamId, onTeam }: { all: League[]; lg: League; teamId: string; onTeam: (id: string) => void }) {
  const [more, setMore] = useState(false)
  const team = lg.teams[teamId]
  const rec = record(lg, teamId)
  const st = standings(lg, teamId)
  const rs = results(lg, teamId)
  const odd = distinct(lg, teamId, more ? 40 : 8)
  const toc = [['season', '赛季'], ['rank', '排名走势'], ['profile', '和联赛比'], ...CHAPTER_KEYS.map((c) => [c, CHAPTER_ZH[c]]), ['schedule', '赛程'], ['players', '球员']]
  const top = [...(lg.players[teamId] ?? [])].sort((a, b) => b.goals - a.goals)[0]
  return (
    <div className="sh-page tb">
      <Nav active="teams" />
      <div className="tb-layout">
        <nav className="tb-toc">
          {toc.map(([id, zh]) => <a key={id} href={`#${id}`}>{zh}</a>)}
          <div className="tb-toc-pick"><TeamPicker all={all} lg={lg} teamId={teamId} onPick={onTeam} /></div>
        </nav>
        <main className="tb-main">
          <section id="season" className="tb-hero">
            <div className="t-caption">{`${lg.nameZh} · 2026 赛季`}</div>
            <h1 className="tb-name">{team.nameZh}</h1>
            <p className="tb-summary">
              {`${st.map((s) => `${s.stage}${s.group.name ? s.group.name : ''}第 ${s.row.rank}`).join('，')}。${rec.n} 场 ${rec.w} 胜 ${rec.d} 平 ${rec.l} 负，进 ${rec.gf} 球、失 ${rec.ga} 球${top?.goals ? `；进球最多的是${top.nameZh}（${top.goals} 个）` : ''}。`}
            </p>
            <p className="t-caption">{rec.video ? `${rec.video} 场有比赛视频，那几场的读数可以直接看画面。` : '这支队的比赛没有视频，所有读数只看数据。'}</p>
          </section>

          <section id="rank" className="tb-block">
            <h2 className="t-title">排名走势</h2>
            <RankLine width={760} parts={st.map((s) => ({ stage: `${s.stage}${s.group.name ? ` ${s.group.name}` : ''}`, size: s.group.rows.length, points: s.group.history[teamId] ?? [] }))} />
            <div className="tb-results">
              <Form list={rs.map((r) => ({ r: r.r, title: `${r.m.date} ${r.home ? '主' : '客'} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}`, href: matchHref(r.m, teamId) }))} />
            </div>
          </section>

          <section id="profile" className="tb-block">
            <h2 className="t-title">和{lg.nameZh}比</h2>
            <p className="t-lead">每一行是一项读数：灰点是联赛其他队，绿点是{team.nameZh}，竖线是联赛平均。离平均最远的排在最前面。</p>
            <table className="tb-profile">
              <tbody>
                {odd.map(({ m }) => {
                  const rk = rankOf(lg, teamId, m.key)
                  return (
                    <tr key={m.key}>
                      <th>
                        <div className="t-body">{m.label}</div>
                        <div className="t-caption">{`${CHAPTER_ZH[m.chapter]} · ${m.sectionTitle}`}</div>
                      </th>
                      <td className="t-figure">{fmt(value(lg, teamId, m.key), m.format)}</td>
                      <td><Strip rows={ranked(lg, m.key).map((r) => ({ ...r, name: lg.teams[r.teamId].nameZh }))} highlight={teamId} mean={leagueMean(lg, m.key)} label={(v) => fmt(v, m.format)} width={340} /></td>
                      <td className="t-numeric">{`第 ${rk.rank}/${rk.of}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button className="sh-link-btn" onClick={() => setMore(!more)}>{more ? '只看最不一样的 8 项' : `看全部 ${comparable(lg).length} 项`}</button>
          </section>

          {CHAPTER_KEYS.map((c) => (
            <section key={c} id={c} className="tb-block">
              <h2 className="t-title">{CHAPTER_ZH[c]}</h2>
              <p className="tb-chapter-line">
                {KEY_METRICS[c].map((k) => {
                  const m = metricOf(lg, k)
                  const rk = rankOf(lg, teamId, k)
                  return `${m.label} ${fmt(value(lg, teamId, k), m.format)}（第 ${rk.rank}）`
                }).join('；')}
                。
              </p>
              <div className="tb-smalls">
                {KEY_METRICS[c].filter((k) => lg.series[teamId]?.[k]).slice(0, 3).map((k) => (
                  <figure key={k}>
                    <figcaption className="t-caption">{`${metricOf(lg, k).label} · 每场`}</figcaption>
                    <MatchBars values={lg.series[teamId][k]} labels={matchLabels(lg, teamId)} mean={leagueMean(lg, k)} width={240} height={64} marks={rs.map((r) => r.m.video)} />
                  </figure>
                ))}
              </div>
            </section>
          ))}

          <section id="schedule" className="tb-block">
            <h2 className="t-title">赛程</h2>
            <ScheduleTable lg={lg} teamId={teamId} />
          </section>
          <section id="players" className="tb-block">
            <h2 className="t-title">球员</h2>
            <PlayersTable lg={lg} teamId={teamId} />
          </section>
        </main>
      </div>
    </div>
  )
}
