// The site's single page: / is the match list, /match/<id> a match's analysis.
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
import './app.css'
import { MatchPage } from '../match-analysis/MatchPage'
import { MatchList } from './MatchList'

function App() {
  const match = /^\/match\/([^/]+)\/?$/.exec(location.pathname)
  if (match) return <MatchPage matchId={decodeURIComponent(match[1])} />
  if (location.pathname === '/' || location.pathname === '/index.html') return <MatchList />
  return (
    <p className="boot">
      没有这个页面。<a href="/">回到全部比赛</a>
    </p>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
