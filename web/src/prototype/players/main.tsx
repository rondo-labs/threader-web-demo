// PROTOTYPE: the 球员 entry, on the throwaway route /prototype/players/.
//   (no params)        /players/: one league's position group in a quadrant chart beside the ranking table
//   ?player=<id>       /player/<id>/: one player's season; ?variant=A|B|C|D switches each section's chart
//                      (A bars per match, B the season on a pitch, C both linked, D one place with a switch)
//   ?team=<id>         the team page with 阵容 and 谁做得最多, to try the links between teams and players
// Question: how should a player's season read, set among his teammates and the league's players in his position?
// Data: pipeline/prototype/build_players.py (pnpm prototype:players builds it and opens this page).
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/newsreader/latin-500.css'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles/tokens.css'
import '../../match-analysis/match-analysis.css'
import '../../team/team.css'
import '../../app/app.css'
import './players.css'
import { PrototypeSwitcher } from '../PrototypeSwitcher'
import { FOCUS_LEAGUE, loadSearch } from './data'
import { PlayersIndex } from './Index'
import { PlayerPage, type Variant } from './PlayerPage'
import { TeamPlus } from './TeamPlus'

const VARIANTS = [
  { key: 'A', name: '小节左图：按场次的柱子' },
  { key: 'B', name: '小节左图：整季画在场上' },
  { key: 'C', name: '两张都要：场上分布 + 按场次，联动' },
  { key: 'D', name: '两张都要：一个位置，切换' },
]

function PlayerRoute({ pid }: { pid: string }) {
  const q = new URLSearchParams(location.search)
  const [league, setLeague] = useState<string | null>(q.get('league'))
  const [variant, setVariant] = useState<Variant>(() => (['A', 'B', 'C', 'D'].includes(q.get('variant') ?? '') ? (q.get('variant') as Variant) : 'C'))
  useEffect(() => {
    if (league) return
    // No league in the link: the one he played most minutes in.
    loadSearch().then((rows) => {
      const mine = rows.filter((r) => r.id === pid).sort((a, b) => b.min - a.min)
      setLeague(mine[0]?.lg ?? FOCUS_LEAGUE)
    }).catch(() => setLeague(FOCUS_LEAGUE))
  }, [league, pid])
  if (!league) return <p className="boot">加载中…</p>
  const change = (k: string) => {
    setVariant(k as Variant)
    const url = new URL(location.href)
    url.searchParams.set('variant', k)
    history.replaceState(null, '', url)
  }
  return (
    <>
      <PlayerPage key={`${pid}-${variant}`} pid={pid} league={league} variant={variant} />
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={change} />
    </>
  )
}

function App() {
  const q = new URLSearchParams(location.search)
  const player = q.get('player')
  const team = q.get('team')
  if (player) return <PlayerRoute pid={player} />
  if (team) return <TeamPlus teamId={team} />
  return <PlayersIndex />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
