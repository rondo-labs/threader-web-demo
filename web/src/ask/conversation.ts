// The visitor's conversation: kept in this browser only (nothing is stored on the server), and a shared link
// carries just the question (?q=), which is asked again when it opens.
import { useCallback, useEffect, useState } from 'react'
import { ask as fetchAnswer } from './source'
import type { Answer } from './types'

export interface Turn { id: string; question: string; answer: Answer | null; streamed: boolean }

const KEY = 'threader.ask.turns'
const KEEP = 30

function load(): Turn[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Turn[]
    return saved.filter((t) => t.answer).map((t) => ({ ...t, streamed: true }))
  } catch {
    return []
  }
}
function save(turns: Turn[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(turns.filter((t) => t.answer).slice(-KEEP)))
  } catch {
    // private windows and blocked storage: the conversation just isn't kept
  }
}

let askedFromLink = false

export function useConversation() {
  const [turns, setTurns] = useState<Turn[]>(load)
  useEffect(() => save(turns), [turns])

  const ask = useCallback((question: string) => {
    const q = question.trim()
    if (!q) return
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    setTurns((ts) => [...ts, { id, question: q, answer: null, streamed: false }])
    fetchAnswer(q).then((a) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, answer: a } : t))))
  }, [])
  const markStreamed = useCallback((id: string) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, streamed: true } : t))), [])

  useEffect(() => {
    const url = new URL(location.href)
    const q = url.searchParams.get('q')
    if (!q || askedFromLink) return
    askedFromLink = true
    url.searchParams.delete('q')
    history.replaceState(null, '', url)
    ask(q)
  }, [ask])

  return { turns, ask, markStreamed, reset: () => setTurns([]) }
}
export type Conversation = ReturnType<typeof useConversation>

export function shareLink(question: string) {
  return `${location.origin}/?q=${encodeURIComponent(question)}`
}

/** Steps first, then the text a few characters at a time, then the cards. Turns already shown appear at once. */
export function useStream(a: Answer | null, instant: boolean, onDone: () => void) {
  const [steps, setSteps] = useState(0)
  const [chars, setChars] = useState(0)
  const full = a ? a.paragraphs.join('\n') : ''
  useEffect(() => {
    if (!a) return
    if (instant) {
      setSteps(a.steps.length)
      setChars(full.length)
      return
    }
    setSteps(0)
    setChars(0)
    let s = 0, c = 0, alive = true, timer = 0
    const tick = () => {
      if (!alive) return
      if (s < a.steps.length) {
        setSteps(++s)
        timer = window.setTimeout(tick, 300)
      } else if (c < full.length) {
        c = Math.min(full.length, c + 4)
        setChars(c)
        timer = window.setTimeout(tick, 16)
      } else onDone()
    }
    timer = window.setTimeout(tick, 120)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [a, instant]) // restart only for a new answer
  const done = !!a && steps >= a.steps.length && chars >= full.length
  return { steps, paragraphs: full.slice(0, chars).split('\n'), done }
}
