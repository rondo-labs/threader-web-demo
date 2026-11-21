// A league's season and one team's matches (pipeline/threader_demo/season.py), and the helpers the team pages
// share: a reading's season value under a filter, its rank in the league, the five readings under the header.

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
  /** position name → [x, y, group], for 阵容 (pipeline/threader_demo/players.py) */
  places: Record<string, [number, number, string]>
}
/** One player at the team (players.py): minutes per position, totals for this team only. */
export interface SquadRow {
  id: string; nameZh: string; number: number | null; group: string; places: Record<string, number>
  age: number | null; height: number | null; apps: number; starts: number; minutes: number; goals: number; assists: number
  /** He moved during the season: came from another team (in) or left for one (out). */
  moved: 'in' | 'out' | null
}
export interface TeamFile {
  id: string; league: string
  /** The matches the team played (with events), in date order: the order of every series. */
  matches: string[]
  series: Record<string, (number | null)[]>
  /** Everyone who played for the team, most minutes first. */
  squad: SquadRow[]
  /** filter → reading → the three players who did most of it for the team, [player, count] (counts only) */
  who: Record<Filter, Record<string, [string, number][]>>
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
/** A team's place in a list of values, teams level sharing the better place; 0 when it has no value. */
function placeIn(rows: { teamId: string; v: number }[], teamId: string, fewer = false): number {
  const me = rows.find((r) => r.teamId === teamId)
  if (!me) return 0
  return 1 + rows.filter((r) => (fewer ? r.v < me.v - 1e-9 : r.v > me.v + 1e-9)).length
}
export function rankOf(lg: League, teamId: string, key: string, filter: Filter = 'all') {
  const rows = ranked(lg, key, filter)
  return { rank: placeIn(rows, teamId), of: rows.length }
}
export function leagueMean(lg: League, key: string, filter: Filter = 'all') {
  const rows = ranked(lg, key, filter)
  return rows.reduce((s, r) => s + r.v, 0) / Math.max(1, rows.length)
}
/* ------------------------------------------------------------------ the five on the radar */

export interface FiveDef {
  /** The chapter the corner opens, and what it judges there. */
  chapter: string; ability: string
  key: string
  /** The reading's name where it shows outside its section (the chapter's head). */
  label: string
  /** Fewer is better: the rank counts from the fewest. */
  fewer?: boolean
  /** The team's figure minus its opponents', ranked by that difference. */
  vs?: boolean
}
/** The five readings a team is judged by, one per chapter after 概览, the same for every team and league
 *  (docs/team.md). Each was checked to be steady over a season and to go with the points won. */
export const FIVE: FiveDef[] = [
  { chapter: 'attack', ability: '创造机会', key: 'attack.shots.open_play_box', label: '运动战禁区内射门' },
  { chapter: 'defence', ability: '限制机会', key: 'defence.box_defence.shots_in_open', label: '对手运动战禁区内射门', fewer: true },
  { chapter: 'attack-transition', ability: '反击', key: 'attack-transition.counter.box_rate', label: '抢回后打进禁区' },
  { chapter: 'defence-transition', ability: '反抢', key: 'defence-transition.counterpress.won10_rate', label: '丢球后 10 秒内抢回' },
  { chapter: 'set-pieces', ability: '攻防', key: 'set-pieces.overall.shots', label: '定位球射门差', vs: true },
]
/** A difference per match, signed: +1.2, −0.3. */
export const fmtDiff = (v: number | null) => (v == null ? '—' : `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${Math.abs(v).toFixed(1)}`)

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
/** A team page: `tab` schedule | lineup (else the radar's 分析), `view` a chapter opened from the radar, `focus` a
 *  reading to land on. */
export const teamHref = (teamId: string, params?: { tab?: string; view?: string; focus?: string }) => {
  const q = new URLSearchParams(Object.entries(params ?? {}).filter((e): e is [string, string] => !!e[1])).toString()
  return `/team/${teamId}/${q ? `?${q}` : ''}`
}
export const matchHref = (m: LeagueMatch, teamId: string, chapter?: string) =>
  m.page ? `/match/${m.id}/?team=${teamId}${chapter ? `&chapter=${chapter}` : ''}` : null
