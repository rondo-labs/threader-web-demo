// The match-analysis page: one long page per chapter, each section a chart on the left and its figures
// table on the right. The table is the filter; the player opens inside the section that started it.
import { useEffect, useRef, type ReactNode } from 'react'
import { Nav } from '../app/Nav'
import { playerLabel, type Clip } from './clips'
import { ChapterTabs, MatchHeading, TeamToggle, ValueButton, sides, type ChapterKey } from './common'
import { inScope, scopedSpans, scopedValue, statesSeen, type GameState, type Half, type Scope } from './filters'
import type { Focus, Open } from './Pitch'
import { Player, usePlaylist, type Playlist } from './Playlist'
import type { MatchData, OverviewSection, Section, Team } from './types'

export interface Ctx {
  data: MatchData
  team: Team
  opp: Team
  /** The match has video: numbers and marks play, otherwise they are only read. */
  playable: boolean
  /** Opens a playlist owned by this section. */
  open: Open
  openSpans: (title: string, spans: Clip[]) => void
  /** Highlight state, only for the section that owns the playlist. */
  focus: Focus | null
  playlist: Playlist | null
  sectionKey: string
  go: (index: number) => void
  close: () => void
}
export const HALF_ZH: Record<Half, string> = { all: '全场', '1': '上半场', '2': '下半场' }
export const STATE_ZH: Record<GameState, string> = { all: '全部', lead: '领先', draw: '打平', trail: '落后' }
export const scopeLabel = (s: Scope) => [s.half !== 'all' ? HALF_ZH[s.half] : '', s.state !== 'all' ? `${STATE_ZH[s.state]}时` : ''].filter(Boolean).join(' · ')

// Where the header's goal chips play in each chapter.
const GOALS_OWNER: Record<ChapterKey, string> = {
  overview: 'goals',
  attack: 'shots',
  defence: 'opp_access',
  'attack-transition': 'counter',
  'defence-transition': 'counterpress',
  'set-pieces': 'free_kicks',
}

interface ReportProps {
  data: MatchData
  teamId: string
  setTeamId: (id: string) => void
  chapter: ChapterKey
  setChapter: (c: ChapterKey) => void
  renderSection: (s: OverviewSection, ctx: Ctx) => ReactNode
}

export function Report({ data, teamId, setTeamId, chapter, setChapter, renderSection }: ReportProps) {
  const { team, opp } = sides(data, teamId)
  const pl = usePlaylist(data)
  const playable = data.video.available
  // Switching team or chapter is a new reading: close the clips; the sections below remount with their defaults.
  const { close } = pl
  useEffect(() => close(), [teamId, chapter, close])
  const owner = (key: string) => ({
    open: ((title, eids, start) => (playable ? pl.open(title, eids, start, key) : undefined)) as Open,
    openSpans: (title: string, spans: Clip[]) => (playable ? pl.openSpans(title, spans, key) : undefined),
  })
  const chapters: Record<ChapterKey, Record<string, OverviewSection[]>> = {
    overview: data.overview,
    attack: data.sections,
    defence: data.defence,
    'attack-transition': data.attackTransition,
    'defence-transition': data.defenceTransition,
    'set-pieces': data.setpieces,
  }
  return (
    <div className="va">
      <Nav active="teams" />
      <header className="va-head">
        <div className="va-head-row">
          <MatchHeading data={data} teamId={teamId} open={owner(GOALS_OWNER[chapter]).open} />
          <TeamToggle data={data} teamId={teamId} setTeamId={setTeamId} />
        </div>
        <ChapterTabs current={chapter} onChange={setChapter} />
      </header>
      <main className="va-main">
        {!playable && <p className="no-video t-caption">这场比赛没有视频：数字和图照常可看，点开不会播放。</p>}
        {chapters[chapter][teamId].map((s) => {
          const ctx: Ctx = {
            data,
            team,
            opp,
            playable,
            ...owner(s.key),
            focus: pl.playlist?.owner === s.key ? pl.focus : null,
            playlist: pl.playlist,
            sectionKey: s.key,
            go: pl.go,
            close: pl.close,
          }
          return (
            <section key={`${teamId}-${chapter}-${s.key}`} className="va-section">
              <div className="va-section-head">
                <h2 className="t-title">{s.title}</h2>
                <p className="t-lead">{s.question}</p>
              </div>
              {renderSection(s, ctx)}
            </section>
          )
        })}
      </main>
    </div>
  )
}

/** The player opened by this section, shown inside it above the table. */
export function InlinePlayer({ ctx }: { ctx: Ctx }) {
  const here = ctx.playlist?.owner === ctx.sectionKey
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (here) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [here, ctx.playlist?.opened])
  if (!here || !ctx.playlist) return null
  return (
    <div className="inline-player" ref={box}>
      <Player data={ctx.data} playlist={ctx.playlist} go={ctx.go} close={ctx.close} />
    </div>
  )
}

/** Half and score state, both read from the analysed team's side. States the team never was in are greyed out. */
export function ScopeBar({ scope, setScope, ctx }: { scope: Scope; setScope: (s: Scope) => void; ctx: Ctx }) {
  const seen = statesSeen(ctx.data, ctx.team.id)
  return (
    <div className="scope-bar">
      <div className="seg seg-sm" role="group" aria-label="时间">
        {(['all', '1', '2'] as const).map((h) => (
          <button key={h} aria-pressed={scope.half === h} onClick={() => setScope({ ...scope, half: h })}>
            {HALF_ZH[h]}
          </button>
        ))}
      </div>
      <div className="seg seg-sm" role="group" aria-label="比分">
        {(['all', 'lead', 'draw', 'trail'] as const).map((s) => (
          <button
            key={s}
            aria-pressed={scope.state === s}
            disabled={!seen.has(s)}
            title={seen.has(s) ? `${ctx.team.nameZh}${STATE_ZH[s]}的时候` : `${ctx.team.nameZh}这场没有${STATE_ZH[s]}过`}
            onClick={() => setScope({ ...scope, state: s })}
          >
            {STATE_ZH[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

interface TableProps {
  section: { metrics: Section['metrics']; tableNote?: string }
  ctx: Ctx
  scope: Scope
  selected?: string
  onSelect?: (key: string) => void
}

export function MetricsTable({ section, ctx, scope, selected, onSelect }: TableProps) {
  const { data, team, opp, open } = ctx
  const when = scopeLabel(scope)
  return (
    <table className={`va-metrics${onSelect ? ' is-selectable' : ''}`}>
      {section.tableNote && <caption className="t-caption">{section.tableNote}</caption>}
      <thead>
        <tr>
          <th className="t-caption">{when}</th>
          <th className="t-label">{team.nameZh}</th>
          <th className="t-label">{opp.nameZh}</th>
        </tr>
      </thead>
      <tbody>
        {section.metrics.map((m) => {
          const pickable = !!onSelect && !m.noPlay
          const ids = (side: 'team' | 'opp') => (m.noPlay ? [] : inScope(data, (side === 'team' ? m.team : m.opp)?.eids ?? [], scope, team.id))
          const fmt = m.format === 'share' ? 'pct' : m.format
          // Span rows play the whole move (regain to shot), not the single anchor action.
          const play =
            (side: 'team' | 'opp'): Open =>
            (title, eventIds) => {
              const c = side === 'team' ? m.team : m.opp
              if (c?.spans) ctx.openSpans(title, scopedSpans(data, c, scope, team.id))
              else open(title, eventIds)
            }
          const value = (side: 'team' | 'opp', size: 'lg' | 'md') => (
            <ValueButton
              value={scopedValue(data, m, side, scope, team.id)}
              eids={ids(side)}
              format={fmt}
              size={size}
              muted={side === 'opp'}
              playable={ctx.playable && !m.noPlay}
              open={play(side)}
              title={`${(side === 'team' ? team : opp).nameZh} · ${m.label}${when ? ` · ${when}` : ''}`}
            />
          )
          return (
            <tr
              key={m.key}
              className={`${selected === m.key ? 'is-selected' : ''}${m.noPlay ? ' is-readonly' : ''}`}
              onClick={pickable ? () => onSelect!(m.key) : undefined}
            >
              <th>
                <div className="t-body metric-label">
                  {onSelect && (
                    <span className="pick" aria-hidden>
                      {m.noPlay ? '' : selected === m.key ? '●' : '○'}
                    </span>
                  )}
                  {m.label}
                </div>
                {m.hint && <div className="t-caption">{m.hint}</div>}
              </th>
              <td>{value('team', 'lg')}</td>
              <td>{m.opp ? value('opp', 'md') : <span className="t-caption">—</span>}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Who did the things currently on the chart. */
export function LeadersFrom({ ctx, eids, label }: { ctx: Ctx; eids: string[]; label: string }) {
  const by = new Map<string, string[]>()
  for (const id of eids) {
    const pid = ctx.data.events[id]?.playerId
    if (pid) by.set(pid, [...(by.get(pid) ?? []), id])
  }
  const rows = [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5)
  if (!rows.length) return null
  return (
    <div className="leaders">
      <div className="t-label">{label}</div>
      <ol>
        {rows.map(([pid, ids]) => (
          <li key={pid}>
            <button className="leader-row" disabled={!ctx.playable} onClick={() => ctx.open(`${playerLabel(ctx.data, pid)} · ${label}`, ids)}>
              <span>{playerLabel(ctx.data, pid)}</span>
              <span />
              <span className="t-numeric">{ids.length}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
