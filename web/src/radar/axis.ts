// A radar corner, the same for a team's and a player's radars (team/radar.ts, players/radar.ts): one reading, the
// subject's value, and its place among the league's teams or the position group's players. How far out the corner is
// drawn = the share of the others the subject is ahead of, so the middle of the group is the same ring on every corner
// and "further out" always means "more of this" (for a reading where fewer is better: fewer).

export interface Axis {
  /** The reading behind the corner (for a rate made of two counts, its numerator: the row to pick in a table). */
  key: string
  chapter: string
  /** The section the reading sits in. */
  section?: string
  /** On the chart: a chapter, a section, an ability or a reading. */
  label: string
  /** The reading that measures it. */
  reading: string
  value: number | null
  display: string
  unit: string
  rank: number | null
  of: number
  /** Share of the others the subject is ahead of, 0–1; null when there is no value to place. */
  pct: number | null
  /** Fewer is better: the rank counts from the fewest and the corner grows as the reading falls. */
  fewer: boolean
  median: number | null
  /** Why there is no point on this corner (too few attempts). */
  missing: string | null
  /** Everyone placed on this reading, for the swarm. */
  rows: { id: string; v: number; name: string }[]
  fmt: (v: number) => string
  /** The team's set-piece corner is a difference: both sides per match and the season's goals. */
  note?: string
}

const EPS = 1e-9
/** Place among the rows, those level sharing the better place; and the share of the others the subject is ahead of. */
export function place(rows: { v: number }[], mine: number, fewer: boolean) {
  const rank = 1 + rows.filter((r) => (fewer ? r.v < mine - EPS : r.v > mine + EPS)).length
  const of = rows.length
  return { rank, of, pct: of > 1 ? (of - rank) / (of - 1) : 0.5 }
}

export const rankText = (a: { rank: number | null; of: number; fewer: boolean; missing: string | null }) =>
  a.missing ?? (a.rank == null ? '—' : `第 ${a.rank}${a.fewer ? ' 少' : ''}/${a.of}`)
