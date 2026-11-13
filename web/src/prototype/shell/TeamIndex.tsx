// PROTOTYPE: the 球队 entry (decided, one version only): a tab per league, standings stage by stage; every row
// opens that team's page. Teams with video are marked.
import { LEAGUES, results, teamHref, type League } from './data'
import { Form } from './charts'
import { Nav } from './parts'

export function TeamIndex({ all, slug, variant, onLeague }: { all: League[]; slug: string; variant: string | null; onLeague: (slug: string) => void }) {
  const lg = all.find((l) => l.slug === slug) ?? all[0]
  return (
    <div className="sh-page">
      <Nav active="teams" />
      <main className="ti">
        <div className="ti-head">
          <h1 className="t-display">球队</h1>
          <div className="seg" role="tablist">
            {LEAGUES.map((l) => (
              <button key={l.slug} aria-pressed={l.slug === lg.slug} onClick={() => onLeague(l.slug)}>{l.zh}</button>
            ))}
          </div>
        </div>
        <p className="t-caption">按阶段分开列。中乙常规赛分两个组（组名数据里没有，按谁和谁踢推断）；每个阶段只算本阶段的比赛。</p>
        {lg.stages.map((st) => (
          <section key={st.name} className="ti-stage">
            <h2 className="t-title">{st.name}</h2>
            <div className="ti-groups">
              {st.groups.map((g, gi) => (
                <table key={gi} className="sh-table ti-table">
                  {g.name && <caption className="t-label">{g.name}</caption>}
                  <thead>
                    <tr>{['', '球队', '场', '胜', '平', '负', '进', '失', '积分', '最近 5 场', ''].map((c, i) => <th key={i} className="t-label">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const rs = results(lg, r.teamId)
                      const video = rs.filter((x) => x.m.video).length
                      return (
                        <tr key={r.teamId} onClick={() => location.assign(teamHref(r.teamId, variant))}>
                          <td className="t-numeric">{r.rank}</td>
                          <th className="t-body"><a href={teamHref(r.teamId, variant)}>{lg.teams[r.teamId].nameZh}</a></th>
                          {[r.p, r.w, r.d, r.l, r.gf, r.ga].map((v, i) => <td key={i} className="t-numeric">{v}</td>)}
                          <td className="t-numeric ti-pts">{r.pts}</td>
                          <td><Form list={rs.filter((x) => x.m.stage === st.name).slice(-5).map((x) => ({ r: x.r, title: `${x.m.date} ${lg.teams[x.oppId].nameZh} ${x.gf}–${x.ga}` }))} /></td>
                          <td>{video ? <span className="sh-has-video">{`${video} 场有视频`}</span> : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
