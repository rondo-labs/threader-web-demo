// PROTOTYPE: three variants of the match-analysis page (attack chapter), switchable via ?variant=,
// on the throwaway route /prototype/match-analysis/. Question: how should the figures and the chart share
// the page, and where should the video playlist open, when every mark and number can be clicked?
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles/tokens.css'
import './prototype.css'
import { PrototypeSwitcher } from '../PrototypeSwitcher'
import type { MatchData } from './types'
import { VariantA } from './VariantA'
import { VariantB } from './VariantB'
import { VariantC } from './VariantC'
import { VariantD } from './VariantD'
import { VariantE } from './VariantE'
import { VariantF, VariantG } from './VariantF'

const MATCH_ID = '1p2hk9rohal69v3gav7y11nh0'
// Round 3: F was picked; G fixes F's drawer covering the table. A–E stay reachable by URL only.
const VARIANTS = [
  { key: 'G', name: 'F · 视频插在表格上方' },
  { key: 'F', name: 'F · 视频从右侧滑出（上一版）' },
]
const RENDER = { A: VariantA, B: VariantB, C: VariantC, D: VariantD, E: VariantE, F: VariantF, G: VariantG } as const

function App() {
  const [data, setData] = useState<MatchData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [variant, setVariant] = useState(() => new URLSearchParams(location.search).get('variant') ?? 'G')

  useEffect(() => {
    fetch(`/prototype-data/match-${MATCH_ID}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<MatchData>
      })
      .then((d) => {
        setData(d)
        setTeamId(d.match.homeId)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const change = (key: string) => {
    setVariant(key)
    const url = new URL(location.href)
    url.searchParams.set('variant', key)
    history.replaceState(null, '', url)
  }

  if (error) return <p className="boot">{`数据没有加载出来（${error}）。先在 web/ 下运行 pnpm prototype。`}</p>
  if (!data || !teamId) return <p className="boot">加载中…</p>
  const props = { data, teamId, setTeamId }
  const View = RENDER[variant as keyof typeof RENDER] ?? VariantG
  return (
    <>
      <View {...props} />
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={change} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
