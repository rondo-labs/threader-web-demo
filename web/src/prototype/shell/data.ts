// PROTOTYPE: season data for the site-shell prototypes (pipeline/prototype/build_site_shell.py), and the few
// helpers every variant needs: a reading's season value, its league rank, and how unusual it is.
import type { MatchData } from '../../match-analysis/types'

export type Format = 'int' | 'pct' | 'share' | 'ratio' | 'meters'
export interface LeagueMetric {
  key: string; chapter: string; section: string; sectionTitle: string; question: string | null
  label: string; format: Format; hint: string | null
}
export interface LeagueMatch {
  id: string; date: string; week: number | null; stage: string; group: number | null
  homeId: string; awayId: string; score: [number, number]; video: boolean; page: boolean
}
export interface StandingRow { teamId: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; rank: number }
export interface Group { name: string | null; rows: StandingRow[]; history: Record<string, [number, number, number][]> }
export interface Stage { name: string; groups: Group[] }
export interface PlayerRow {
  id: string; nameZh: string; number: number | null; position: string
  apps: number; starts: number; minutes: number; goals: number; touches: number; keyActions: number
}
export interface League {
  slug: string; nameZh: string
  teams: Record<string, { id: string; nameZh: string; nameEn: string }>
  matches: LeagueMatch[]
  stages: Stage[]
  chapters: { key: string; zh: string }[]
  metrics: LeagueMetric[]
  season: Record<string, Record<string, [number, number, number, number]>>
  series: Record<string, Record<string, (number | null)[]>>
  players: Record<string, PlayerRow[]>
}

export const LEAGUES = [
  { slug: 'chinese-super-league-2026', zh: '中超' },
  { slug: 'chinese-football-league-1-2026', zh: '中甲' },
  { slug: 'chinese-football-league-2-2026', zh: '中乙' },
]
export const FEILU = '4zx5qt414dn1x6nxpbtu2ni8k'
export const VIDEO_MATCH = '1p2hk9rohal69v3gav7y11nh0'

const cache = new Map<string, Promise<unknown>>()
function get<T>(url: string): Promise<T> {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
        return r.json()
      }),
    )
  return cache.get(url) as Promise<T>
}
export const loadLeague = (slug: string) => get<League>(`/prototype-data/league-${slug}.json`)
export const loadAll = () => Promise.all(LEAGUES.map((l) => loadLeague(l.slug)))
export const loadMatch = (id: string) => get<MatchData>(`/data/matches/${id}.json`)

/* ------------------------------------------------------------------ season readings */

export function value(lg: League, teamId: string, key: string, side: 'team' | 'opp' = 'team'): number | null {
  const s = lg.season[teamId]?.[key]
  if (!s) return null
  const [a, b] = side === 'team' ? [s[0], s[1]] : [s[2], s[3]]
  return b ? a / b : null
}
export const total = (lg: League, teamId: string, key: string) => lg.season[teamId]?.[key]?.[0] ?? 0
export const played = (lg: League, teamId: string) => lg.matches.filter((m) => m.homeId === teamId || m.awayId === teamId).length

export function ranked(lg: League, key: string, side: 'team' | 'opp' = 'team') {
  return Object.keys(lg.teams)
    .map((teamId) => ({ teamId, v: value(lg, teamId, key, side) }))
    .filter((r): r is { teamId: string; v: number } => r.v != null)
    .sort((a, b) => b.v - a.v)
}
export function rankOf(lg: League, teamId: string, key: string) {
  const rows = ranked(lg, key)
  return { rank: rows.findIndex((r) => r.teamId === teamId) + 1, of: rows.length }
}
export function leagueMean(lg: League, key: string) {
  const rows = ranked(lg, key)
  return rows.reduce((s, r) => s + r.v, 0) / Math.max(1, rows.length)
}
export function zscore(lg: League, teamId: string, key: string) {
  const rows = ranked(lg, key)
  const mean = rows.reduce((s, r) => s + r.v, 0) / rows.length
  const sd = Math.sqrt(rows.reduce((s, r) => s + (r.v - mean) ** 2, 0) / rows.length)
  const v = value(lg, teamId, key)
  return v == null || !sd ? 0 : (v - mean) / sd
}

/** Readings worth comparing across the league: one per label, skipping the timeline's repeats and rare events. */
export function comparable(lg: League): LeagueMetric[] {
  const seen = new Set<string>()
  return lg.metrics.filter((m) => {
    if (m.chapter === 'overview' && m.section === 'timeline') return false
    if (seen.has(m.label)) return false
    if (m.format === 'int' && leagueMean(lg, m.key) < 0.6) return false
    seen.add(m.label)
    return true
  })
}
/** The team's readings furthest from the league's middle, either way. */
export function distinct(lg: League, teamId: string, n = 5) {
  return comparable(lg)
    .map((m) => ({ m, z: zscore(lg, teamId, m.key) }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, n)
}

export function fmt(v: number | null, format: Format, perMatch = true): string {
  if (v == null) return '—'
  if (format === 'pct' || format === 'share') return `${Math.round(v * 100)}%`
  if (format === 'ratio') return v.toFixed(1)
  if (format === 'meters') return `${Math.round(v)} 米`
  return perMatch ? v.toFixed(1) : `${Math.round(v)}`
}
export const unitOf = (format: Format) => (format === 'int' ? '场均' : format === 'meters' ? '平均' : format === 'ratio' ? '整季' : '整季')

/* ------------------------------------------------------------------ teams and matches */

export function leagueOf(all: League[], teamId: string) {
  return all.find((lg) => lg.teams[teamId]) ?? null
}
export interface Result {
  m: LeagueMatch; home: boolean; oppId: string; gf: number; ga: number; r: '胜' | '平' | '负'
}
export function results(lg: League, teamId: string): Result[] {
  return lg.matches
    .filter((m) => m.homeId === teamId || m.awayId === teamId)
    .map((m) => {
      const home = m.homeId === teamId
      const [gf, ga] = home ? m.score : [m.score[1], m.score[0]]
      return { m, home, oppId: home ? m.awayId : m.homeId, gf, ga, r: gf > ga ? '胜' : gf < ga ? '负' : '平' } as Result
    })
}
/** Where the team stands in each stage it played. */
export function standings(lg: League, teamId: string) {
  return lg.stages.flatMap((st) =>
    st.groups
      .filter((g) => g.rows.some((r) => r.teamId === teamId))
      .map((g) => ({ stage: st.name, group: g, row: g.rows.find((r) => r.teamId === teamId)! })),
  )
}
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
export const matchHref = (m: LeagueMatch, teamId: string, chapter?: string) =>
  m.page ? `/match/${m.id}/?team=${teamId}${chapter ? `&chapter=${chapter}` : ''}` : null
export const teamHref = (teamId: string, variant?: string | null) => `/prototype/team/?team=${teamId}${variant ? `&variant=${variant}` : ''}`
