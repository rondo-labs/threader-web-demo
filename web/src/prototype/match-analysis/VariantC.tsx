// PROTOTYPE variant C: the figures are the page. Each section is a comparison table, every row carries
// its own small pitch (small multiples), and a click opens a large player in the middle of the screen.
import { ChapterTabs, Leaders, Legend, MatchHeading, Readings, TeamToggle, ValueButton, sides, type VariantProps } from './common'
import { SectionChart } from './Pitch'
import { Player, usePlaylist } from './Playlist'

export function VariantC(props: VariantProps) {
  const { data, teamId } = props
  const { team, opp } = sides(data, teamId)
  const { playlist, open, close, go } = usePlaylist(data)
  return (
    <div className="vc">
      <header className="vc-head">
        <div className="vc-head-row">
          <MatchHeading data={data} open={open} />
          <TeamToggle {...props} />
        </div>
        <ChapterTabs />
      </header>
      <main className="vc-main">
        {data.sections[teamId].map((s) => (
          <section key={s.key} className="vc-section">
            <div className="vc-section-head">
              <h2 className="t-title">{s.title}</h2>
              <p className="t-lead">{s.question}</p>
              <Legend section={s} />
            </div>
            <table className="vc-table">
              <thead>
                <tr>
                  <th className="t-label">指标</th>
                  <th className="t-label num">{team.nameZh}</th>
                  <th className="t-label num">{opp.nameZh}</th>
                  <th className="t-label">{`${team.nameZh}在哪里`}</th>
                </tr>
              </thead>
              <tbody>
                {s.metrics.map((m) => {
                  const title = `${team.nameZh} · ${m.label}`
                  return (
                    <tr key={m.key}>
                      <th>
                        <div className="t-body">{m.label}</div>
                        {m.hint && <div className="t-caption">{m.hint}</div>}
                      </th>
                      <td className="num">
                        <ValueButton {...m.team} format={m.format} size="lg" open={open} title={title} />
                      </td>
                      <td className="num">
                        {m.opp ? (
                          <ValueButton {...m.opp} format={m.format} size="md" muted open={open} title={`${opp.nameZh} · ${m.label}`} />
                        ) : (
                          <span className="t-caption">—</span>
                        )}
                      </td>
                      <td className="vc-mini">
                        <button
                          className="mini-btn"
                          disabled={!m.team.eids.length}
                          onClick={() => open(title, m.team.eids)}
                          aria-label={`${title}，点开看视频`}
                        >
                          <SectionChart data={data} section={s} teamName={team.nameZh} focus={null} open={open} only={new Set(m.team.eids)} mini />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="vc-foot">
              <Leaders data={data} section={s} teamName={team.nameZh} open={open} />
              <Readings section={s} />
            </div>
          </section>
        ))}
      </main>
      {playlist && (
        <div className="vc-modal" role="dialog" aria-modal="true" aria-label={playlist.title} onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="vc-dialog">
            <Player data={data} playlist={playlist} go={go} close={close} layout="modal" />
          </div>
        </div>
      )}
    </div>
  )
}
