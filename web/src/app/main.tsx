// The site's single page app. Routes: / the Q&A, /teams/ the 球队 entry, /team/<id>/ a team's season,
// /match/<id>/ a match's analysis, /players/ and /review/ (not built yet). The static server keeps a copy of
// index.html at every one of these paths (site-data/pages.txt), so each address opens directly.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Latin type is served with the site: Google Fonts is not reachable from mainland China.
// Chinese falls back to the system's own fonts (tokens.css).
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/newsreader/latin-500.css'
import '../styles/tokens.css'
import '../match-analysis/match-analysis.css'
import '../team/team.css'
import '../ask/ask.css'
import './app.css'
import { AskHome } from '../ask/AskHome'
import { MatchPage } from '../match-analysis/MatchPage'
import { TeamPage } from '../team/TeamPage'
import { TeamsIndex } from '../team/TeamsIndex'
import { Nav } from './Nav'
import { Placeholder } from './Placeholder'

function App() {
  const path = location.pathname.replace(/index\.html$/, '')
  const match = /^\/match\/([^/]+)\/?$/.exec(path)
  if (match) return <MatchPage matchId={decodeURIComponent(match[1])} />
  const team = /^\/team\/([^/]+)\/?$/.exec(path)
  if (team) return <TeamPage teamId={decodeURIComponent(team[1])} />
  if (/^\/teams\/?$/.test(path)) return <TeamsIndex />
  if (/^\/players\/?$/.test(path)) return <Placeholder section="players" />
  if (/^\/review\/?$/.test(path)) return <Placeholder section="review" />
  if (path === '/') return <AskHome />
  return (
    <div className="site-page">
      <Nav />
      <p className="boot">
        没有这个页面。<a href="/">回到首页</a>
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
