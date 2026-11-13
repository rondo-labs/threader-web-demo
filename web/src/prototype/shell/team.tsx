// PROTOTYPE: three variants of the team season page, switchable via ?variant=, on the throwaway route
// /prototype/team/?team=<contestant id>. Without ?team= it shows the 球队 entry (one version: league tabs and
// standings by stage). Question: how should one team's whole season read, with every number set in its league?
// Data: pipeline/prototype/build_site_shell.py (every 2026 match of the three leagues, summed per team).
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/newsreader/latin-500.css'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles/tokens.css'
import '../../match-analysis/match-analysis.css'
import './shell.css'
import { PrototypeSwitcher } from '../PrototypeSwitcher'
import { FEILU, LEAGUES, leagueOf, loadAll, type League } from './data'
import { TeamA } from './TeamA'
import { TeamB } from './TeamB'
import { TeamC } from './TeamC'
import { TeamIndex } from './TeamIndex'

const VARIANTS = [
  { key: 'A', name: '仪表盘 + 章节' },
  { key: 'B', name: '赛季长文' },
  { key: 'C', name: '联赛坐标' },
]

function setParam(key: string, value: string | null) {
  const url = new URL(location.href)
  if (value == null) url.searchParams.delete(key)
  else url.searchParams.set(key, value)
  history.replaceState(null, '', url)
}

function App() {
  const params = new URLSearchParams(location.search)
  const [all, setAll] = useState<League[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(params.get('team'))
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [league, setLeague] = useState(params.get('league') ?? LEAGUES[0].slug)
  useEffect(() => { loadAll().then(setAll).catch((e) => setError(String(e))) }, [])
  useEffect(() => {
    if (!all || !teamId) return
    const lg = leagueOf(all, teamId)
    document.title = `原型 · ${lg?.teams[teamId].nameZh ?? '球队'}`
  }, [all, teamId])

  if (error) return <p className="boot">{`数据没有加载出来（${error}）。先在 web/ 下运行 pnpm prototype:shell。`}</p>
  if (!all) return <p className="boot">加载中…</p>
  const change = (key: string) => {
    setVariant(key)
    setParam('variant', key)
  }
  const onTeam = (id: string) => {
    setTeamId(id)
    setParam('team', id)
    window.scrollTo(0, 0)
  }
  if (!teamId) {
    return (
      <>
        <TeamIndex all={all} slug={league} variant={params.get('variant')} onLeague={(s) => { setLeague(s); setParam('league', s) }} />
        <PrototypeSwitcher variants={[{ key: '—', name: '球队入口（只有一版）· 点一支队看 A/B/C' }]} current="—" onChange={() => onTeam(FEILU)} />
      </>
    )
  }
  const lg = leagueOf(all, teamId)
  if (!lg) return <p className="boot">没有这支队。<a href="/prototype/team/">回到球队</a></p>
  const props = { all, lg, teamId, onTeam }
  return (
    <>
      {variant === 'B' ? <TeamB key={teamId} {...props} /> : variant === 'C' ? <TeamC {...props} /> : <TeamA key={teamId} {...props} initialTab={params.get('tab') ?? params.get('chapter')} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={change} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
