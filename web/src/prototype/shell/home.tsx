// PROTOTYPE: three variants of the home page (the Q&A, as a shell: no backend, example answers built from the
// real data), switchable via ?variant=, on the throwaway route /prototype/home/. Question: with a Claude-like
// Q&A as the home page, how should answers that carry numbers, charts, tables and video sit on the page?
// The conversation lives above the variants, so one set of questions can be compared across A, B and C.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/newsreader/latin-500.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles/tokens.css'
import '../../match-analysis/match-analysis.css'
import './shell.css'
import { PrototypeSwitcher } from '../PrototypeSwitcher'
import { HomeA } from './HomeA'
import { HomeB } from './HomeB'
import { HomeC } from './HomeC'
import { Placeholder, useConversation } from './parts'

const VARIANTS = [
  { key: 'A', name: '对话 + 侧边舞台' },
  { key: 'B', name: '对话 + 常驻画板' },
  { key: 'C', name: '检索 + 报告' },
]
const RENDER = { A: HomeA, B: HomeB, C: HomeC } as const

function App() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(() => params.get('variant') ?? 'A')
  const conv = useConversation()
  const page = params.get('page')
  if (page) return <Placeholder page={page} />
  const change = (key: string) => {
    setVariant(key)
    const url = new URL(location.href)
    url.searchParams.set('variant', key)
    url.searchParams.delete('q')
    history.replaceState(null, '', url)
  }
  const View = RENDER[variant as keyof typeof RENDER] ?? HomeA
  return (
    <>
      <View conv={conv} />
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={change} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
