// PROTOTYPE variant B: a workbench close to the desktop app, but with the figures leading.
// One section at a time: big figure tiles first, the chart under them, video always docked on the right.
import { useState } from 'react'
import { CHAPTERS, Leaders, Legend, MatchHeading, Readings, TeamToggle, ValueButton, sides, type VariantProps } from './common'
import { SectionChart } from './Pitch'
import { Player, usePlaylist } from './Playlist'

export function VariantB(props: VariantProps) {
  const { data, teamId } = props
  const { team, opp } = sides(data, teamId)
  const { playlist, open, close, go, focus } = usePlaylist(data)
  const sections = data.sections[teamId]
  const [active, setActive] = useState(0)
  const s = sections[active]
  return (
    <div className="vb">
      <nav className="vb-rail" aria-label="章与小节">
        {CHAPTERS.map((c) =>
          c === '进攻' ? (
            <div key={c} className="vb-chapter is-current">
              <div className="t-heading">进攻</div>
              <ol>
                {sections.map((x, i) => (
                  <li key={x.key}>
                    <button aria-current={i === active} onClick={() => setActive(i)}>
                      <span className="t-body">{x.title}</span>
                      <span className="t-caption">{x.question}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div key={c} className="vb-chapter is-disabled t-heading" title="原型只做了进攻这一章">
              {c}
            </div>
          ),
        )}
      </nav>
      <main className="vb-center">
        <div className="vb-top">
          <MatchHeading data={data} open={open} compact />
          <TeamToggle {...props} />
        </div>
        <div className="vb-section-head">
          <h2 className="t-title">{`进攻 · ${s.title}`}</h2>
          <p className="t-lead">{s.question}</p>
        </div>
        <div className="vb-tiles">
          {s.metrics.map((m) => (
            <div className="vb-tile" key={m.key}>
              <div className="t-label">{m.label}</div>
              <ValueButton {...m.team} format={m.format} size="xl" open={open} title={`${team.nameZh} · ${m.label}`} />
              {m.opp && (
                <div className="t-caption vb-vs">
                  {`${opp.nameZh} `}
                  <ValueButton {...m.opp} format={m.format} size="sm" muted open={open} title={`${opp.nameZh} · ${m.label}`} />
                </div>
              )}
            </div>
          ))}
        </div>
        <figure className="vb-chart">
          <SectionChart data={data} section={s} teamName={team.nameZh} focus={focus} open={open} />
          <figcaption>
            <Legend section={s} />
          </figcaption>
        </figure>
        <div className="vb-bottom">
          <Leaders data={data} section={s} teamName={team.nameZh} open={open} />
          <Readings section={s} />
        </div>
      </main>
      <aside className="vb-dock">
        <Player data={data} playlist={playlist} go={go} close={close} layout="dock" />
      </aside>
    </div>
  )
}
