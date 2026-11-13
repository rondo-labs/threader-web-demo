// PROTOTYPE: the transition chapters' funnels. Each bar is a table row; picking one plays its moves.
import { scopedSpans, type Scope } from './filters'
import type { MatchData, Metric, Section, Span } from './types'

interface FunnelProps {
  data: MatchData
  section: Section
  teamId: string
  scope: Scope
  selected: string
  onPick: (m: Metric, spans: Span[]) => void
}

export function FunnelChart({ data, section, teamId, scope, selected, onPick }: FunnelProps) {
  const byKey = new Map(section.metrics.map((m) => [m.key, m]))
  const count = (key: string) => scopedSpans(data, byKey.get(key)?.team ?? null, scope, teamId)
  return (
    <div className="funnel" role="group" aria-label={section.readings[0]}>
      {section.funnel!.groups.map((g) => {
        const base = count(g.base).length
        return (
          <div key={g.title} className={`funnel-group${g.side === 'opp' ? ' is-opp' : ''}`}>
            <div className="t-label">{g.title}</div>
            {g.rows.map((key) => {
              const m = byKey.get(key)
              if (!m) return null
              const spans = count(key)
              const share = base ? spans.length / base : 0
              return (
                <button
                  key={key}
                  className={`funnel-row${selected === key ? ' is-selected' : ''}${key === g.base ? ' is-base' : ''}`}
                  disabled={!spans.length}
                  title={spans.length ? `${m.label} ${spans.length} 次，点开看这些回合` : `${m.label}：没有`}
                  onClick={() => onPick(m, spans)}
                >
                  <span className="funnel-label">{m.label}</span>
                  <span className="funnel-track">
                    <span className="funnel-bar" style={{ width: `${spans.length ? Math.max(1.5, share * 100) : 0}%` }} />
                  </span>
                  <span className="funnel-num t-numeric">{spans.length}</span>
                  <span className="funnel-share t-caption">{key === g.base ? '' : `${Math.round(share * 100)}%`}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
