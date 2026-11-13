// Which part of the match a section's numbers and chart cover: 全场/上下半场 × 全部/领先/打平/落后.
// The score state is read from the analysed team's side.
import type { Count, MatchData, Metric, Section, Span } from './types'

export type Half = 'all' | '1' | '2'
export type GameState = 'all' | 'lead' | 'draw' | 'trail'
export interface Scope { half: Half; state: GameState }
export const FULL: Scope = { half: 'all', state: 'all' }

/** Metrics better read as the section's summary (lanes, thirds, corner zones) than as single marks. */
export const summaryMetric = (section: Section, metricKey: string) => !!section.summary?.metrics.includes(metricKey)

function stateOf(data: MatchData, eventId: string, teamId: string): GameState | null {
  const e = data.events[eventId]
  if (!e) return null
  const diff = teamId === data.match.homeId ? e.score[0] - e.score[1] : e.score[1] - e.score[0]
  return diff > 0 ? 'lead' : diff < 0 ? 'trail' : 'draw'
}

export function inScope(data: MatchData, eids: string[], scope: Scope, teamId: string): string[] {
  return eids.filter((id) => {
    const e = data.events[id]
    if (!e) return false
    if (scope.half !== 'all' && e.period !== Number(scope.half)) return false
    return scope.state === 'all' || stateOf(data, id, teamId) === scope.state
  })
}

/** A span row's clips in the current half and score state, read from each row's anchor event. */
export function scopedSpans(data: MatchData, c: Count | null, scope: Scope, teamId: string): Span[] {
  if (!c?.spans) return []
  const keep = new Set(inScope(data, c.eids, scope, teamId))
  return c.spans.filter((_, i) => keep.has(c.eids[i]))
}

export function scopedValue(data: MatchData, m: Metric, side: 'team' | 'opp', scope: Scope, teamId: string): number {
  const c = side === 'team' ? m.team : m.opp
  if (!c) return 0
  const n = (x: Count | null) => (x ? inScope(data, x.eids, scope, teamId).length : 0)
  if (m.format === 'ratio') return inScope(data, c.numEids ?? [], scope, teamId).length / Math.max(1, n(c))
  if (m.format === 'meters') {
    const ids = inScope(data, c.eids, scope, teamId)
    return ids.length ? (ids.reduce((sum, id) => sum + data.events[id].x, 0) / ids.length) * 1.05 : 0
  }
  if (m.format === 'share') {
    const total = n(m.team) + n(m.opp)
    return total ? n(c) / total : 0
  }
  if (m.format === 'pct') {
    const total = n(c)
    return total ? inScope(data, c.okEids ?? [], scope, teamId).length / total : 0
  }
  return n(c)
}

/** Whether the analysed team was ever leading / level / behind, so empty choices can be greyed out. */
export function statesSeen(data: MatchData, teamId: string): Set<GameState> {
  const seen = new Set<GameState>(['all'])
  for (const id of Object.keys(data.events)) {
    const s = stateOf(data, id, teamId)
    if (s) seen.add(s)
  }
  return seen
}
