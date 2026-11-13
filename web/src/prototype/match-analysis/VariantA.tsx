// PROTOTYPE variant A: one long report, chart and figures side by side; the playlist slides in from the right
// over the figures, so the chart stays visible and shows which mark is playing.
import { ChapterTabs, Leaders, Legend, MatchHeading, Readings, TeamToggle, ValueButton, sides, type VariantProps } from './common'
import { SectionChart } from './Pitch'
import { Player, usePlaylist } from './Playlist'

export function VariantA(props: VariantProps) {
  const { data, teamId } = props
  const { team, opp } = sides(data, teamId)
  const { playlist, open, close, go, focus } = usePlaylist(data)
  return (
    <div className="va">
      <header className="va-head">
        <div className="va-head-row">
          <MatchHeading data={data} open={open} />
          <TeamToggle {...props} />
        </div>
        <ChapterTabs />
      </header>
      <main className="va-main">
        {data.sections[teamId].map((s) => (
          <section key={s.key} className="va-section">
            <div className="va-section-head">
              <h2 className="t-title">{s.title}</h2>
              <p className="t-lead">{s.question}</p>
            </div>
            <div className="va-grid">
              <figure className="va-chart">
                <SectionChart data={data} section={s} teamName={team.nameZh} focus={focus} open={open} />
                <figcaption>
                  <Legend section={s} />
                </figcaption>
              </figure>
              <div className="va-data">
                <table className="va-metrics">
                  <thead>
                    <tr>
                      <th />
                      <th className="t-label">{team.nameZh}</th>
                      <th className="t-label">{opp.nameZh}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.metrics.map((m) => (
                      <tr key={m.key}>
                        <th>
                          <div className="t-body">{m.label}</div>
                          {m.hint && <div className="t-caption">{m.hint}</div>}
                        </th>
                        <td>
                          <ValueButton {...m.team} format={m.format} size="lg" open={open} title={`${team.nameZh} · ${m.label}`} />
                        </td>
                        <td>
                          {m.opp ? (
                            <ValueButton {...m.opp} format={m.format} size="md" muted open={open} title={`${opp.nameZh} · ${m.label}`} />
                          ) : (
                            <span className="t-caption">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Leaders data={data} section={s} teamName={team.nameZh} open={open} />
                <Readings section={s} />
              </div>
            </div>
          </section>
        ))}
      </main>
      <aside className={`va-drawer${playlist ? ' is-open' : ''}`} aria-hidden={!playlist}>
        {playlist && <Player data={data} playlist={playlist} go={go} close={close} layout="drawer" />}
      </aside>
    </div>
  )
}
