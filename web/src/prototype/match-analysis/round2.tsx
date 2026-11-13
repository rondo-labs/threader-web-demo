// PROTOTYPE round 2+: A's long report is the frame (picked by the user). The shell, table, filters and the
// in-section player below are shared on purpose; the variants differ in where a section's filter lives.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { playerLabel } from './clips'
import { ChapterTabs, MatchHeading, TeamToggle, ValueButton, sides, type VariantProps } from './common'
import { inScope, scopedSpans, scopedValue, statesSeen, type Facet, type GameState, type Half, type Option, type Scope, type Selection } from './filters'
import type { Focus, Open } from './Pitch'
import { Player, usePlaylist, type Playlist } from './Playlist'
import type { Clip } from './clips'
import type { MatchData, OverviewSection, Section, Team } from './types'

export interface Ctx {
  data: MatchData
  team: Team
  opp: Team
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

type Chapter = '概览' | '进攻' | '防守' | '进攻转换' | '防守转换' | '定位球'
// Where the header's goal chips play in each chapter.
const GOALS_OWNER: Record<Chapter, string> = { 概览: 'goals', 进攻: 'shots', 防守: 'opp_access', 进攻转换: 'counter', 防守转换: 'counterpress', 定位球: 'free_kicks' }

interface ReportProps {
  props: VariantProps
  renderSection: (s: Section, ctx: Ctx) => ReactNode
  /** Overview chapter sections; without it the report only has the attack chapter. */
  renderOverview?: (s: OverviewSection, ctx: Ctx) => ReactNode
  /** drawer: one player sliding in from the right; inline: the section that opened the playlist hosts the player. */
  playback?: 'drawer' | 'inline'
}

export function Report({ props, renderSection, renderOverview, playback = 'drawer' }: ReportProps) {
  const { data, teamId } = props
  const { team, opp } = sides(data, teamId)
  const pl = usePlaylist(data)
  const [chapter, setChapter] = useState<Chapter>(renderOverview ? '概览' : '进攻')
  // Switching team is a new reading: close the other team's clips; the sections below remount with their defaults.
  const { close } = pl
  useEffect(() => close(), [teamId, close])
  const owner = (key: string) => ({
    open: ((title, eids, start) => pl.open(title, eids, start, key)) as Open,
    openSpans: (title: string, spans: Clip[]) => pl.openSpans(title, spans, key),
  })
  const goalsOwner = owner(GOALS_OWNER[chapter])
  const chapters: Record<Chapter, Record<string, OverviewSection[]>> = {
    概览: data.overview, 进攻: data.sections, 防守: data.defence, 进攻转换: data.attackTransition, 防守转换: data.defenceTransition, 定位球: data.setpieces,
  }
  const list = chapters[chapter][teamId]
  return (
    <div className={`va va-${playback}`}>
      <header className="va-head">
        <div className="va-head-row">
          <MatchHeading data={data} open={goalsOwner.open} />
          <TeamToggle {...props} />
        </div>
        <ChapterTabs
          current={chapter}
          ready={renderOverview ? ['概览', '进攻', '防守', '进攻转换', '防守转换', '定位球'] : ['进攻']}
          onChange={(c) => {
            pl.close()
            setChapter(c as Chapter)
          }}
        />
      </header>
      <main className="va-main">
        {list.map((s) => {
          const ctx: Ctx = {
            data,
            team,
            opp,
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
              {chapter === '概览' && renderOverview ? renderOverview(s, ctx) : renderSection(s as Section, ctx)}
            </section>
          )
        })}
      </main>
      {playback === 'drawer' && (
        <aside className={`va-drawer${pl.playlist ? ' is-open' : ''}`} aria-hidden={!pl.playlist}>
          {pl.playlist && <Player data={data} playlist={pl.playlist} go={pl.go} close={pl.close} layout="drawer" />}
        </aside>
      )}
    </div>
  )
}

/** The player opened by this section, shown inside it above the table (variant G). */
export function InlinePlayer({ ctx }: { ctx: Ctx }) {
  const here = ctx.playlist?.owner === ctx.sectionKey
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (here) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [here, ctx.playlist?.opened])
  if (!here || !ctx.playlist) return null
  return (
    <div className="inline-player" ref={box}>
      <Player data={ctx.data} playlist={ctx.playlist} go={ctx.go} close={ctx.close} layout="inline" />
    </div>
  )
}

export function HalfToggle({ half, setHalf }: { half: Half; setHalf: (h: Half) => void }) {
  return (
    <div className="seg seg-sm" role="group" aria-label="时间">
      {(['all', '1', '2'] as const).map((h) => (
        <button key={h} aria-pressed={half === h} onClick={() => setHalf(h)}>
          {HALF_ZH[h]}
        </button>
      ))}
    </div>
  )
}

/** Half and score state, both read from the analysed team's side. States the team never was in are greyed out. */
export function ScopeBar({ scope, setScope, ctx }: { scope: Scope; setScope: (s: Scope) => void; ctx: Ctx }) {
  const seen = statesSeen(ctx.data, ctx.team.id)
  return (
    <div className="scope-bar">
      <HalfToggle half={scope.half} setHalf={(half) => setScope({ ...scope, half })} />
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

export function FacetBar({ facets, sel, setSel, count }: { facets: Facet[]; sel: Selection; setSel: (s: Selection) => void; count: (f: Facet, o: Option) => number }) {
  return (
    <div className="facet-bar">
      {facets.map((f) => (
        <div key={f.key} className="facet">
          <span className="t-label">{f.label}</span>
          <div className="chips">
            {f.options.map((o) => {
              const on = (sel[f.key] ?? 'all') === o.key
              const n = count(f, o)
              return (
                <button key={o.key} className="chip" aria-pressed={on} disabled={!on && n === 0} onClick={() => setSel({ ...sel, [f.key]: o.key })}>
                  {o.label} <span className="t-numeric">{n}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

interface TableProps { section: { metrics: Section['metrics']; tableNote?: string }; ctx: Ctx; scope: Scope; selected?: string; onSelect?: (key: string) => void }

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
          const play = (side: 'team' | 'opp'): Open => (title, eventIds) => {
            const c = side === 'team' ? m.team : m.opp
            if (c?.spans) ctx.openSpans(title, scopedSpans(data, c, scope, team.id))
            else open(title, eventIds)
          }
          return (
            <tr key={m.key} className={`${selected === m.key ? 'is-selected' : ''}${m.noPlay ? ' is-readonly' : ''}`} onClick={pickable ? () => onSelect!(m.key) : undefined}>
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
              <td>
                <ValueButton value={scopedValue(data, m, 'team', scope, team.id)} eids={ids('team')} format={fmt} size="lg" open={play('team')} title={`${team.nameZh} · ${m.label}${when ? ` · ${when}` : ''}`} />
              </td>
              <td>
                {m.opp ? (
                  <ValueButton value={scopedValue(data, m, 'opp', scope, team.id)} eids={ids('opp')} format={fmt} size="md" muted open={play('opp')} title={`${opp.nameZh} · ${m.label}${when ? ` · ${when}` : ''}`} />
                ) : (
                  <span className="t-caption">—</span>
                )}
              </td>
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
            <button className="leader-row" onClick={() => ctx.open(`${playerLabel(ctx.data, pid)} · ${label}`, ids)}>
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
