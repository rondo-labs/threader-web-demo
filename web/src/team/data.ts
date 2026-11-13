// A league's season and one team's matches (pipeline/threader_demo/season.py), and the helpers the team pages
// share: a reading's season value under a filter, its rank in the league, how far it sits from the league.

export type Format = 'int' | 'pct' | 'share' | 'ratio' | 'meters'
export type Filter = 'all' | 'home' | 'away' | 'last5'
export const FILTERS: [Filter, string][] = [['all', '全部'], ['home', '主场'], ['away', '客场'], ['last5', '最近 5 场']]

export interface LeagueMetric {
  key: string; chapter: string; section: string; sectionTitle: string; question: string | null
  label: string; format: Format; hint: string | null
}
export interface LeagueMatch {
  id: string; date: string; week: number | null; stage: string; group: string | null
  homeId: string; awayId: string; score: [number, number]; video: boolean; page: boolean
  /** Set when the result was awarded without the match being played. */
  awarded?: string
}
export interface StandingRow { teamId: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; rank: number }
export interface Group { name: string | null; rows: StandingRow[]; history: Record<string, [number, number, number][]> }
export interface Stage { name: string; note?: string; groups: Group[] }
export interface League {
  slug: string; nameZh: string
  teams: Record<string, { id: string; nameZh: string; nameEn: string }>
  matches: LeagueMatch[]
  stages: Stage[]
  metrics: LeagueMetric[]
  /** filter → team → reading → [team numerator, denominator, opponents' numerator, denominator] */
  season: Record<Filter, Record<string, Record<string, [number, number, number, number]>>>
}
export interface PlayerRow {
  id: string; nameZh: string; number: number | null; position: string
  apps: number; starts: number; minutes: number; goals: number; touches: number; keyActions: number
}
export interface TeamFile {
  id: string; league: string
  /** The matches the team played (with events), in date order: the order of every series. */
  matches: string[]
  series: Record<string, (number | null)[]>
  players: PlayerRow[]
}
export interface SiteIndex {
  leagues: { slug: string; nameZh: string; teams: number; matches: number; video: number }[]
  focusTeams: { id: string; nameZh: string; league: string }[]
}

const cache = new Map<string, Promise<unknown>>()
function get<T>(url: string): Promise<T> {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? '没有找到' : `HTTP ${r.status}`)
        return r.json()
      }),
    )
  return cache.get(url) as Promise<T>
}
export const loadIndex = () => get<SiteIndex>('/data/index.json')
export const loadLeague = (slug: string) => get<League>(`/data/leagues/${slug}.json`)
export const loadTeam = (id: string) => get<TeamFile>(`/data/teams/${encodeURIComponent(id)}.json`)

/* ------------------------------------------------------------------ readings */

export function value(lg: League, teamId: string, key: string, filter: Filter = 'all', side: 'team' | 'opp' = 'team'): number | null {
  const s = lg.season[filter]?.[teamId]?.[key]
  if (!s) return null
  const [a, b] = side === 'team' ? [s[0], s[1]] : [s[2], s[3]]
  return b ? a / b : null
}
export function ranked(lg: League, key: string, filter: Filter = 'all') {
  return Object.keys(lg.teams)
    .map((teamId) => ({ teamId, v: value(lg, teamId, key, filter), name: lg.teams[teamId].nameZh }))
    .filter((r): r is { teamId: string; v: number; name: string } => r.v != null)
    .sort((a, b) => b.v - a.v)
}
export function rankOf(lg: League, teamId: string, key: string, filter: Filter = 'all') {
  const rows = ranked(lg, key, filter)
  return { rank: rows.findIndex((r) => r.teamId === teamId) + 1, of: rows.length }
}
export function leagueMean(lg: League, key: string, filter: Filter = 'all') {
  const rows = ranked(lg, key, filter)
  return rows.reduce((s, r) => s + r.v, 0) / Math.max(1, rows.length)
}
function zscore(lg: League, teamId: string, key: string) {
  const rows = ranked(lg, key)
  const mean = rows.reduce((s, r) => s + r.v, 0) / rows.length
  const sd = Math.sqrt(rows.reduce((s, r) => s + (r.v - mean) ** 2, 0) / rows.length)
  const v = value(lg, teamId, key)
  return v == null || !sd ? 0 : (v - mean) / sd
}
/** One reading per label (the timeline repeats a few), leaving out events too rare to compare. */
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
/** The team's readings furthest from the league's middle, either way, over the whole season. */
export function distinct(lg: League, teamId: string, n = 5) {
  return comparable(lg)
    .map((m) => ({ m, z: zscore(lg, teamId, m.key) }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, n)
}

export function fmt(v: number | null, format: Format): string {
  if (v == null) return '—'
  if (format === 'pct' || format === 'share') return `${Math.round(v * 100)}%`
  if (format === 'ratio') return v.toFixed(1)
  if (format === 'meters') return `${Math.round(v)} 米`
  return v.toFixed(1)
}

/* ------------------------------------------------------------------ teams and matches */

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
/** Which of the team's analysed matches a filter keeps, in the order of the team's series. */
export function kept(lg: League, team: TeamFile, filter: Filter): boolean[] {
  const byId = new Map(lg.matches.map((m) => [m.id, m]))
  return team.matches.map((id, i) => {
    const m = byId.get(id)!
    if (filter === 'home') return m.homeId === team.id
    if (filter === 'away') return m.awayId === team.id
    if (filter === 'last5') return i >= team.matches.length - 5
    return true
  })
}
export function standings(lg: League, teamId: string) {
  return lg.stages.flatMap((st) =>
    st.groups
      .filter((g) => g.rows.some((r) => r.teamId === teamId))
      .map((g) => ({ stage: st.name, group: g, row: g.rows.find((r) => r.teamId === teamId)! })),
  )
}
export function standingLine(lg: League, teamId: string) {
  return standings(lg, teamId)
    .map((s) => `${s.group.name ?? s.stage} 第 ${s.row.rank}`)
    .join(' · ')
}
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
export const teamHref = (teamId: string, tab?: string) => `/team/${teamId}/${tab ? `?tab=${tab}` : ''}`
export const matchHref = (m: LeagueMatch, teamId: string, chapter?: string) =>
  m.page ? `/match/${m.id}/?team=${teamId}${chapter ? `&chapter=${chapter}` : ''}` : null
