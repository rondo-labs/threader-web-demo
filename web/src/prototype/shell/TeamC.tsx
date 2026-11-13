// PROTOTYPE · Team C「联赛坐标」: the league is the frame. The standings stay on the left and switch the
// analysis object in place; the middle is every reading of one chapter as a matrix against the league (value,
// rank, spread, opponents), filtered by which matches count (all, home, away, last 5, a stage); the right pane
// shows the picked row match by match.
import { useState } from 'react'
import { MatchBars, Strip } from './charts'
import { fmt, leagueMean, matchHref, results, value, type League, type LeagueMetric } from './data'
import { Nav } from './parts'
import { CHAPTER_KEYS, CHAPTER_ZH, TeamPicker, matchLabels, record, sectionsOf, standingLine } from './teamParts'

type Filter = string // 'all' | 'home' | 'away' | 'last5' | a stage name

function picked(lg: League, teamId: string, f: Filter) {
  const rs = results(lg, teamId)
  return rs.map((r, i) =>
    f === 'all' ? true : f === 'home' ? r.home : f === 'away' ? !r.home : f === 'last5' ? i >= rs.length - 5 : r.m.stage === f,
  )
}
/** Season value under a filter: counts are averaged over the picked matches; rates only exist for the whole season. */
function fvalue(lg: League, teamId: string, m: LeagueMetric, f: Filter): number | null {
  if (f === 'all') return value(lg, teamId, m.key)
  if (m.format !== 'int') return null
  const s = lg.series[teamId]?.[m.key]
  if (!s) return null
  const keep = picked(lg, teamId, f)
  const vs = s.filter((v, i) => keep[i] && v != null) as number[]
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
}
function franked(lg: League, m: LeagueMetric, f: Filter) {
  return Object.keys(lg.teams)
    .map((teamId) => ({ teamId, v: fvalue(lg, teamId, m, f), name: lg.teams[teamId].nameZh }))
    .filter((r): r is { teamId: string; v: number; name: string } => r.v != null)
    .sort((a, b) => b.v - a.v)
}

export function TeamC({ all, lg, teamId, onTeam }: { all: League[]; lg: League; teamId: string; onTeam: (id: string) => void }) {
  const [chapter, setChapter] = useState('attack')
  const [filter, setFilter] = useState<Filter>('all')
  const [stageIx, setStageIx] = useState(0)
  const [sel, setSel] = useState<string>('attack.shots.shots')
  const team = lg.teams[teamId]
  const rec = record(lg, teamId)
  const rs = results(lg, teamId)
  const stages = [...new Set(rs.map((r) => r.m.stage))]
  const filters: [Filter, string][] = [['all', '全部'], ['home', '主场'], ['away', '客场'], ['last5', '最近 5 场'], ...(stages.length > 1 ? stages.map((s) => [s, s] as [Filter, string]) : [])]
  const st = lg.stages[Math.min(stageIx, lg.stages.length - 1)]
  const metric = lg.metrics.find((m) => m.key === sel) ?? lg.metrics[0]
  const keep = picked(lg, teamId, filter)
  return (
    <div className="sh-page tc">
      <Nav active="teams" compact />
      <div className="tc-layout">
        <aside className="tc-league">
          <TeamPicker all={all} lg={lg} teamId={teamId} onPick={onTeam} />
          <div className="seg seg-sm tc-stages">
            {lg.stages.map((s, i) => <button key={s.name} aria-pressed={i === stageIx} onClick={() => setStageIx(i)}>{s.name}</button>)}
          </div>
          {st.groups.map((g, gi) => (
            <table key={gi} className="tc-standings">
              {g.name && <caption className="t-label">{g.name}</caption>}
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.teamId} className={r.teamId === teamId ? 'is-me' : ''} onClick={() => onTeam(r.teamId)}>
                    <td className="t-numeric">{r.rank}</td>
                    <td>{lg.teams[r.teamId].nameZh}</td>
                    <td className="t-numeric">{`${r.w}-${r.d}-${r.l}`}</td>
                    <td className="t-numeric tc-pts">{r.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <p className="t-caption">点一支队，右边换成它。</p>
        </aside>

        <main className="tc-main">
          <header className="tc-head">
            <div>
              <h1 className="t-title">{team.nameZh}</h1>
              <div className="t-caption">{`${lg.nameZh} · ${standingLine(lg, teamId)} · ${rec.w} 胜 ${rec.d} 平 ${rec.l} 负 · 进 ${rec.gf} 失 ${rec.ga}`}</div>
            </div>
            <div className="tc-strip" aria-label="每场结果">
              {rs.map((r, i) => {
                const href = matchHref(r.m, teamId, chapter)
                const cell = <span className={`tc-cell r-${r.r}${keep[i] ? '' : ' is-out'}`}>{r.m.video ? '●' : ''}</span>
                return href ? <a key={r.m.id} href={href} title={`${r.m.date} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}`}>{cell}</a> : <span key={r.m.id} title={`${r.m.date} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}`}>{cell}</span>
              })}
            </div>
          </header>
          <div className="tc-controls">
            <div className="tabs">
              {CHAPTER_KEYS.map((c) => <button key={c} aria-current={chapter === c} onClick={() => { setChapter(c); setSel(sectionsOf(lg, c)[0].metrics[0].key) }}>{CHAPTER_ZH[c]}</button>)}
            </div>
            <div className="seg seg-sm">
              {filters.map(([k, zh]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{zh}</button>)}
            </div>
          </div>
          <table className="tc-matrix">
            <thead>
              <tr>
                <th />
                <th className="t-label">{filter === 'all' ? '场均 / 整季' : '场均'}</th>
                <th className="t-label">排名</th>
                <th className="t-label">在联赛里的位置</th>
                <th className="t-label">对手</th>
              </tr>
            </thead>
            {sectionsOf(lg, chapter).map((s) => (
              <tbody key={s.key}>
                <tr className="tc-sec"><th colSpan={5} className="t-label">{s.title}</th></tr>
                {s.metrics.map((m) => {
                  const rows = franked(lg, m, filter)
                  const v = fvalue(lg, teamId, m, filter)
                  const rank = rows.findIndex((r) => r.teamId === teamId) + 1
                  const mean = rows.reduce((a, r) => a + r.v, 0) / Math.max(1, rows.length)
                  return (
                    <tr key={m.key} className={sel === m.key ? 'is-selected' : ''} onClick={() => setSel(m.key)}>
                      <th className="t-body">{m.label}</th>
                      <td className="t-numeric">{fmt(v, m.format)}</td>
                      <td className="t-numeric">{v == null ? '—' : `${rank}/${rows.length}`}</td>
                      <td>{v == null ? <span className="t-caption">比率只算全季</span> : <Strip rows={rows} highlight={teamId} mean={mean} label={(x) => fmt(x, m.format)} width={200} />}</td>
                      <td className="t-numeric tc-opp">{filter === 'all' ? fmt(value(lg, teamId, m.key, 'opp'), m.format) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </main>

        <aside className="tc-detail">
          <div className="t-caption">{`${CHAPTER_ZH[metric.chapter]} · ${metric.sectionTitle}`}</div>
          <h2 className="t-title">{metric.label}</h2>
          {metric.hint && <p className="t-caption">{metric.hint}</p>}
          <div className="tc-big">
            <span className="t-score">{fmt(fvalue(lg, teamId, metric, filter), metric.format)}</span>
            <span className="t-caption">{`联赛平均 ${fmt(leagueMean(lg, metric.key), metric.format)}`}</span>
          </div>
          {lg.series[teamId]?.[metric.key] ? (
            <>
              <MatchBars
                values={lg.series[teamId][metric.key].map((v, i) => (keep[i] ? v : null))}
                labels={matchLabels(lg, teamId)}
                mean={leagueMean(lg, metric.key)}
                width={330}
                height={110}
                marks={rs.map((r) => r.m.video)}
              />
              <div className="t-label">最多的 3 场</div>
              <ol className="tc-topmatches">
                {rs
                  .map((r, i) => ({ r, v: lg.series[teamId][metric.key][i] ?? 0, i }))
                  .filter((x) => keep[x.i])
                  .sort((a, b) => b.v - a.v)
                  .slice(0, 3)
                  .map(({ r, v }) => {
                    const href = matchHref(r.m, teamId, metric.chapter)
                    return (
                      <li key={r.m.id}>
                        <span className="t-numeric">{v}</span>
                        <span>{`${r.m.date.slice(5)} ${r.home ? '主' : '客'} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}`}</span>
                        {r.m.video ? <span className="sh-has-video">有视频</span> : null}
                        {href ? <a href={href}>打开 →</a> : null}
                      </li>
                    )
                  })}
              </ol>
            </>
          ) : (
            <p className="t-caption">比率类的读数没有拆到每场。</p>
          )}
          <p className="t-caption">{rec.video ? `有视频的场次（●）可以直接看这项读数背后的画面。` : '这支队的比赛没有视频。'}</p>
        </aside>
      </div>
    </div>
  )
}
