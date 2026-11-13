// PROTOTYPE: turn event ids into playable clips.
import type { ClipKind, Ev, MatchData } from './types'

/** Seconds before / after the event. Shots and goals get a longer run-up so the move is visible. */
export const WINDOWS: Record<ClipKind, [number, number]> = {
  goal: [8, 5],
  shot: [6, 4],
  cross: [4, 4],
  pass: [4, 3],
}
const MERGE_GAP = 2

export interface Clip { start: number; end: number; eids: string[] }

export function buildClips(eids: string[], data: MatchData): Clip[] {
  const evs = eids.map((id) => data.events[id]).filter((e): e is Ev => !!e && e.vt != null)
  evs.sort((a, b) => a.vt! - b.vt!)
  const clips: Clip[] = []
  for (const e of evs) {
    const [pre, post] = WINDOWS[e.kind]
    const start = Math.max(0, e.vt! - pre)
    const end = e.vt! + post
    const last = clips[clips.length - 1]
    if (last && start - last.end < MERGE_GAP) {
      last.end = Math.max(last.end, end)
      last.eids.push(e.id)
    } else {
      clips.push({ start, end, eids: [e.id] })
    }
  }
  return clips
}

export function playerName(data: MatchData, playerId: string | null): string {
  if (!playerId) return ''
  const p = data.players[playerId]
  return p ? p.nameZh || p.nameEn : ''
}

export function playerLabel(data: MatchData, playerId: string | null): string {
  if (!playerId) return ''
  const p = data.players[playerId]
  if (!p) return ''
  return `${p.number != null ? `#${p.number} ` : ''}${p.nameZh || p.nameEn}`
}

export function eventLine(data: MatchData, ev: Ev | undefined): string {
  if (!ev) return ''
  return [ev.clock, playerLabel(data, ev.playerId), ev.label].filter(Boolean).join(' · ')
}
