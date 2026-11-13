// PROTOTYPE: shapes of pipeline/prototype/build_match_analysis.py's output.

export type Side = 'home' | 'away'
export type ClipKind = 'goal' | 'shot' | 'cross' | 'pass'

export interface Team { id: string; side: Side; nameEn: string; nameZh: string }
export interface Player { id: string; teamId: string; number: number | null; starter: boolean; nameEn: string; nameZh: string }
export interface Ev {
  id: string
  teamId: string
  playerId: string | null
  label: string
  period: number
  clock: string
  x: number
  y: number
  ex: number | null
  ey: number | null
  vt: number | null
  kind: ClipKind
  /** Score before the event: [home, away]. */
  score: [number, number]
  /** Minutes on a match timeline where the second half starts right after the first half's real length. */
  tx: number
}

/** A ready-made clip, e.g. from a regain to the shot it led to. */
export interface Span { start: number; end: number; eids: string[] }
export interface Count {
  value: number
  /** For span rows: one anchor event per row (the regain or the loss), which the half and score filters read. */
  eids: string[]
  /** Rows that play a whole move rather than single actions; same order as `eids`. */
  spans?: Span[]
  okEids?: string[]
  /** ratio metrics (PPDA): the events counted on top; `eids` are the ones counted below. */
  numEids?: string[]
}
export interface Metric {
  key: string
  label: string
  /** share: this team's part of both teams' events (possession estimated from passes). */
  format: 'int' | 'pct' | 'share' | 'ratio' | 'meters'
  hint: string | null
  team: Count
  opp: Count | null
  /** Only read, never played or drawn (hundreds of passes). */
  noPlay?: boolean
}
export interface Leader { playerId: string; value: number; eids: string[]; extra: string | null }

export interface ShotMark {
  kind: 'shot'; eid: string; x: number; y: number; period: number
  goal: boolean; onTarget: boolean; blocked: boolean; big: boolean; header: boolean; setPiece: boolean; fastBreak: boolean; inBox: boolean
}
export type LaneKey = 'left' | 'center' | 'right'
export type MarkSide = 'team' | 'opp'
export interface ArrowMark {
  kind: 'arrow'; eid: string; x: number; y: number; ex: number; ey: number; period: number
  /** Overview marks show both teams; the opponent's are already turned to attack leftwards. */
  side?: MarkSide
  ok: boolean
  /** Box entry (entries) or led to a shot (crosses): the one thing drawn in the thread colour. */
  key: boolean
  lane: LaneKey
  how: 'pass' | 'long' | 'through' | 'cross'
  /** Crosses the line into the final third (entries only). */
  entry: boolean
  /** Corners: where the delivery really landed, from the attacking side. */
  zone?: 'left' | 'central' | 'right' | 'outside' | 'short_left' | 'short_right'
  cornerSide?: 'left' | 'right'
}
export interface DotMark {
  kind: 'dot'; eid: string; x: number; y: number; period: number; side: MarkSide; goal: boolean; ok?: boolean
  /** The move this regain or loss started ended in a shot: drawn in the thread colour. */
  key?: boolean
}
export interface NodeMark { kind: 'node'; playerId: string; x: number; y: number; count: number; eids: string[] }
export interface EdgeMark { kind: 'edge'; a: string; b: string; count: number; eids: string[] }
export type Mark = ShotMark | ArrowMark | DotMark | NodeMark | EdgeMark

export interface Lane { lane: 'left' | 'center' | 'right'; label: string; value: number; eids: string[] }
export type LegendKey = 'goal' | 'on' | 'off' | 'blocked' | 'big' | 'ok' | 'fail' | 'key' | 'node' | 'edge' | 'us' | 'them' | 'act_ok' | 'act_fail' | 'them_pass' | 'them_shot' | 'key_dot'

export interface Section {
  key: 'shots' | 'entries' | 'network' | 'crosses' | 'build_up' | 'match' | 'def_actions' | 'pressing' | 'opp_access' | 'box_defence' | 'corners' | 'free_kicks' | 'throw_ins'
    | 'regains' | 'first_action' | 'counter' | 'losses' | 'opp_after_loss' | 'counterpress'
  title: string
  question: string
  pitch: 'half' | 'full' | 'final-third' | 'half-own'
  marks: Mark[]
  /** What the thread-coloured arrows mean in this section. */
  keyLabel?: string | null
  /** Overview: the table rows and the chart cover both teams. */
  bothTeams?: boolean
  legendText?: Record<string, string>
  /** The default reading: a summary drawn instead of single marks, and the row each band drills into. */
  summary?: { kind: 'lanes' | 'lanes-defending' | 'thirds' | 'corners'; metrics: string[]; drill: Record<string, string>; badge?: string; okLabel?: string }
  /** Vertical reference lines (x in Opta units); `metric` lines follow that metric's events in the current filter. */
  lines?: { x: number; label: string; key?: boolean; metric?: string }[]
  /** Funnel sections draw bars instead of a pitch: each group is a set of rows measured against its base row. */
  funnel?: { groups: { title: string; base: string; rows: string[]; side?: 'opp' }[] }
  /** What the two columns mean when it is not obvious. */
  tableNote?: string
  lanes?: Lane[]
  note?: string | null
  metrics: Metric[]
  leadersLabel: string
  leaders: Leader[]
  readings: string[]
  legend: LegendKey[]
}

export interface Goal { eid: string; teamId: string; playerId: string | null; clock: string; ownGoal: boolean }

export interface TickMark { kind: 'tick'; eid: string; side: MarkSide; tx: number; type: 'goal' | 'shot' | 'box' | 'card' | 'sub'; card: 'yellow' | 'red' | null }
export interface TimelineSection {
  key: 'timeline'; kind: 'timeline'; title: string; question: string
  h1: number; end: number
  bins: { start: number; end: number; team: number; opp: number }[]
  marks: TickMark[]; metrics: Metric[]; legendText: Record<string, string>; readings: string[]
}
export interface LineupRow {
  playerId: string; starter: boolean; slot: number; position: string | null; positionZh: string
  slotX: number | null; slotY: number | null; avgX: number | null; avgY: number | null
  minutes: number; on: number | null; touches: Count; keyActions: Count
}
export interface LineupSection {
  key: 'lineup'; kind: 'lineup'; title: string; question: string
  shape: string; changes: { clock: string; shape: string }[]; rows: LineupRow[]; readings: string[]
}
export interface GoalItem {
  goalEid: string; side: MarkSide; teamId: string; scorerId: string | null; clock: string; source: string
  passes: number; seconds: number; startZone: string; eids: string[]; marks: Mark[]
  span: { start: number; end: number } | null
}
export interface GoalsSection { key: 'goals'; kind: 'goals'; title: string; question: string; items: GoalItem[]; readings: string[] }
export type OverviewSection = Section | TimelineSection | LineupSection | GoalsSection

export interface MatchData {
  match: { id: string; date: string; competition: string; stage: string; homeId: string; awayId: string; score: [number, number] }
  teams: Record<string, Team>
  players: Record<string, Player>
  events: Record<string, Ev>
  goals: Goal[]
  sections: Record<string, Section[]>
  overview: Record<string, OverviewSection[]>
  defence: Record<string, Section[]>
  setpieces: Record<string, Section[]>
  attackTransition: Record<string, Section[]>
  defenceTransition: Record<string, Section[]>
  video: { src: string; available: boolean }
}
