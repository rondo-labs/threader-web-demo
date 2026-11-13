// The bodies of an answer's cards, and its clips on the match video. Goal moves and clips load the match's page
// data and reuse the match page's chart and player.
import { useEffect, useState } from 'react'
import { Markings, X, Y } from '../match-analysis/Pitch'
import { GoalChart } from '../match-analysis/overviewCharts'
import { Player, usePlaylist } from '../match-analysis/Playlist'
import type { GoalsSection, MatchData } from '../match-analysis/types'
import type { Card, Clips } from './types'

const matches = new Map<string, Promise<MatchData>>()
function loadMatch(id: string) {
  if (!matches.has(id)) matches.set(id, fetch(`/data/matches/${id}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))))
  return matches.get(id)!
}
function useMatch(id: string) {
  const [data, setData] = useState<MatchData | null>(null)
  useEffect(() => {
    loadMatch(id).then(setData).catch(() => setData(null))
  }, [id])
  return data
}

export const cardTitle = (c: Card) => (c.kind === 'figures' ? '' : c.title)

export function CardBody({ card, big, onOpen }: { card: Card; big?: boolean; onOpen?: () => void }) {
  switch (card.kind) {
    case 'figures':
      return (
        <div className="ak-figs">
          {card.items.map((f) => (
            <div key={f.label} className="ak-fig">
              <div className="t-label">{f.label}</div>
              <div className={big ? 't-score' : 't-figure'}>{f.value}</div>
              {f.sub && <div className="t-caption">{f.sub}</div>}
            </div>
          ))}
        </div>
      )
    case 'ranking': {
      const rows = big ? card.rows : card.rows.slice(0, 8)
      const top = Math.max(...card.rows.map((r) => r.v), 1)
      return (
        <ol className="ak-hbars">
          {rows.map((r, i) => (
            <li key={r.key} className={r.mark ? 'is-mark' : ''}>
              <span className="t-numeric ak-rank">{i + 1}</span>
              {r.href ? <a href={r.href} className="ak-hb-label">{r.label}</a> : <span className="ak-hb-label">{r.label}</span>}
              <span className="ak-hb-track"><span className="ak-hb-bar" style={{ width: `${(r.v / top) * 100}%` }} /></span>
              <span className="t-numeric">{r.v}</span>
              <span className="t-caption ak-hb-sub">{r.sub ?? ''}</span>
            </li>
          ))}
        </ol>
      )
    }
    case 'dots':
      return (
        <figure className="ak-pitch" onClick={onOpen}>
          <svg viewBox={`${X(50) - 1} -2.5 ${X(100) - X(50) + 4.5} 73`} className={`pz pz-full${big ? ' is-big' : ''}`} role="img" aria-label={card.title}>
            <Markings />
            {card.dots.map((d, i) => (
              <circle key={i} cx={X(d.x)} cy={Y(d.y)} r={0.95} className="ak-dot"><title>{d.label}</title></circle>
            ))}
          </svg>
          <figcaption className="t-caption">{card.caption}</figcaption>
        </figure>
      )
    case 'table':
      return (
        <table className="ak-table">
          <thead>
            <tr>{card.columns.map((c) => <th key={c} className="t-label">{c}</th>)}</tr>
          </thead>
          <tbody>
            {card.rows.map((r, i) => (
              <tr key={i}>
                {r.cells.map((c, j) => (
                  <td key={j} className={j > 2 ? 't-numeric' : ''}>{j === 0 && r.href ? <a href={r.href}>{c}</a> : c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'goals':
      return <Goals matchId={card.matchId} teamId={card.teamId} big={big} onOpen={onOpen} />
  }
}

function Goals({ matchId, teamId, big, onOpen }: { matchId: string; teamId: string; big?: boolean; onOpen?: () => void }) {
  const data = useMatch(matchId)
  if (!data) return <p className="t-caption">加载中…</p>
  const sec = data.overview[teamId]?.find((s) => s.key === 'goals') as GoalsSection | undefined
  const items = sec?.items.filter((it) => it.side === 'team') ?? []
  return (
    <div className={`ak-goals${big ? ' is-big' : ''}`}>
      {items.map((it) => (
        <figure key={it.goalEid} onClick={onOpen}>
          <GoalChart data={data} item={it} focus={null} open={() => onOpen?.()} title="" />
          <figcaption className="t-caption">{`${it.clock} · ${it.source}`}</figcaption>
        </figure>
      ))}
    </div>
  )
}

/** The answer's clips, played on the match video with the match page's player. */
export function ClipPlayer({ clips, onClose }: { clips: Clips; onClose?: () => void }) {
  const data = useMatch(clips.matchId)
  return data ? <Clipped data={data} clips={clips} onClose={onClose} /> : <p className="t-caption">加载中…</p>
}

function Clipped({ data, clips, onClose }: { data: MatchData; clips: Clips; onClose?: () => void }) {
  const pl = usePlaylist(data)
  const { open, openSpans } = pl
  useEffect(() => {
    if (clips.spans) openSpans(clips.title, clips.spans, 'ask')
    else open(clips.title, clips.eids ?? [], undefined, 'ask')
  }, [clips, open, openSpans])
  if (!pl.playlist) return null
  return (
    <Player
      data={data}
      playlist={pl.playlist}
      go={pl.go}
      close={() => {
        pl.close()
        onClose?.()
      }}
    />
  )
}
