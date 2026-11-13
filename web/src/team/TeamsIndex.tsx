// /teams/?league=<slug>: the 球队 entry. A tab per league, the standings stage by stage (中乙: 预赛 in two zones,
// then the 决赛阶段 with points carried over); every row opens that team's page.
import { useEffect, useState } from 'react'
import { Nav } from '../app/Nav'
import { Form } from './charts'
import { loadIndex, loadLeague, results, shortDate, teamHref, type League, type SiteIndex } from './data'

export function TeamsIndex() {
  const [index, setIndex] = useState<SiteIndex | null>(null)
  const [lg, setLg] = useState<League | null>(null)
  const [slug, setSlug] = useState(() => new URLSearchParams(location.search).get('league'))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = '球队 · Threader'
    loadIndex().then(setIndex).catch((e: Error) => setError(e.message))
  }, [])
  const current = index ? (index.leagues.find((l) => l.slug === slug) ?? index.leagues[0]) : null
  useEffect(() => {
    if (!current) return
    setLg(null)
    loadLeague(current.slug).then(setLg).catch((e: Error) => setError(e.message))
  }, [current?.slug])

  const pick = (s: string) => {
    setSlug(s)
    const url = new URL(location.href)
    url.searchParams.set('league', s)
    history.replaceState(null, '', url)
  }
  if (error) return <p className="boot">{`球队没有加载出来（${error}）。`}</p>
  return (
    <div className="tm">
      <Nav active="teams" />
      <main className="ti">
        <div className="ti-head">
          <h1 className="t-display">球队</h1>
          {index && (
            <div className="seg" role="tablist" aria-label="联赛">
              {index.leagues.map((l) => (
                <button key={l.slug} aria-pressed={l.slug === current?.slug} onClick={() => pick(l.slug)}>{l.nameZh}</button>
              ))}
            </div>
          )}
        </div>
        {!lg ? (
          <p className="boot">加载中…</p>
        ) : (
          <>
            {lg.stages.map((st) => (
              <section key={st.name} className="ti-stage">
                <h2 className="t-title">{st.name}{st.note && <span className="t-caption ti-note">{st.note}</span>}</h2>
                <div className="ti-groups">
                  {st.groups.map((g, gi) => (
                    <table key={gi} className="tm-table ti-table">
                      {g.name && <caption className="t-label">{g.name}</caption>}
                      <thead>
                        <tr>{['', '球队', '场', '胜', '平', '负', '进', '失', '积分', '最近 5 场', ''].map((c, i) => <th key={i} className="t-label">{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => {
                          const rs = results(lg, r.teamId)
                          const recent = rs.filter((x) => (g.name ? x.m.group === g.name : x.m.stage === st.name)).slice(-5)
                          const video = rs.filter((x) => x.m.video).length
                          return (
                            <tr key={r.teamId} onClick={() => location.assign(teamHref(r.teamId))}>
                              <td className="t-numeric">{r.rank}</td>
                              <th className="t-body"><a href={teamHref(r.teamId)}>{lg.teams[r.teamId].nameZh}</a></th>
                              {[r.p, r.w, r.d, r.l, r.gf, r.ga].map((v, i) => <td key={i} className="t-numeric">{v}</td>)}
                              <td className="t-numeric ti-pts">{r.pts}</td>
                              <td><Form list={recent.map((x) => ({ r: x.r, title: `${x.m.date} ${lg.teams[x.oppId].nameZh} ${x.gf}–${x.ga}` }))} /></td>
                              <td>{video ? <span className="tm-has-video">{`${video} 场有视频`}</span> : ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ))}
                </div>
              </section>
            ))}
            <Notes lg={lg} />
          </>
        )}
      </main>
    </div>
  )
}

function Notes({ lg }: { lg: League }) {
  const awarded = lg.matches.filter((m) => m.awarded)
  const multi = lg.stages.length > 1
  if (!awarded.length && !multi) return null
  return (
    <div className="ti-notes t-caption">
      {multi && <p>同分时先比相互间比赛的积分、净胜球、进球，再比全部比赛的净胜球、进球。</p>}
      {awarded.map((m) => (
        <p key={m.id}>{`${shortDate(m.date)} ${lg.teams[m.homeId].nameZh} ${m.score[0]}–${m.score[1]} ${lg.teams[m.awayId].nameZh}：${m.awarded}。这场没有比赛，只计入积分。`}</p>
      ))}
    </div>
  )
}
