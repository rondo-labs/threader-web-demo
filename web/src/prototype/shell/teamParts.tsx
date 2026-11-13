// PROTOTYPE: content blocks the team-page variants share (the team picker, the fixtures and squad tables, the
// readings grouped by section). How they are laid out is up to each variant.
import { CHAPTERS } from '../../match-analysis/common'
import {
  LEAGUES, fmt, matchHref, results, shortDate, standings, teamHref, type League, type LeagueMetric,
} from './data'

export const CHAPTER_ZH: Record<string, string> = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.zh]))
export const CHAPTER_KEYS = CHAPTERS.map((c) => c.key as string)

/** A few readings that stand for each chapter in summaries. */
export const KEY_METRICS: Record<string, string[]> = {
  overview: ['overview.match.possession', 'overview.match.shots', 'overview.match.box', 'overview.match.recoveries'],
  attack: ['attack.shots.shots', 'attack.entries.entries', 'attack.entries.box', 'attack.crosses.crosses'],
  defence: ['defence.def_actions.all_actions', 'defence.pressing.ppda', 'defence.pressing.height', 'defence.opp_access.opp_shots'],
  'attack-transition': ['attack-transition.regains.all', 'attack-transition.regains.zone_front', 'attack-transition.counter.shots'],
  'defence-transition': ['defence-transition.losses.all', 'defence-transition.counterpress.won5', 'defence-transition.opp_after_loss.shots'],
  'set-pieces': ['set-pieces.corners.corners', 'set-pieces.corners.shots', 'set-pieces.free_kicks.all', 'set-pieces.throw_ins.all'],
}

export function sectionsOf(lg: League, chapter: string) {
  const out: { key: string; title: string; question: string | null; metrics: LeagueMetric[] }[] = []
  for (const m of lg.metrics) {
    if (m.chapter !== chapter) continue
    let s = out.find((x) => x.key === m.section)
    if (!s) out.push((s = { key: m.section, title: m.sectionTitle, question: m.question, metrics: [] }))
    s.metrics.push(m)
  }
  return out
}
export const metricOf = (lg: League, key: string) => lg.metrics.find((m) => m.key === key)!

export function TeamPicker({ all, lg, teamId, onPick }: { all: League[]; lg: League; teamId: string; onPick: (teamId: string) => void }) {
  return (
    <div className="sh-picker">
      <select
        value={lg.slug}
        onChange={(e) => {
          const next = all.find((l) => l.slug === e.target.value)!
          onPick(next.stages[0].groups[0].rows[0].teamId)
        }}
        aria-label="联赛"
      >
        {LEAGUES.map((l) => <option key={l.slug} value={l.slug}>{l.zh}</option>)}
      </select>
      <select value={teamId} onChange={(e) => onPick(e.target.value)} aria-label="分析对象">
        {Object.values(lg.teams)
          .sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh'))
          .map((t) => <option key={t.id} value={t.id}>{t.nameZh}</option>)}
      </select>
    </div>
  )
}

export function standingLine(lg: League, teamId: string) {
  return standings(lg, teamId)
    .map((s) => `${s.stage}${s.group.name ? ` ${s.group.name}` : ''}第 ${s.row.rank}`)
    .join(' · ')
}
export function record(lg: League, teamId: string) {
  const rs = results(lg, teamId)
  const w = rs.filter((r) => r.r === '胜').length, d = rs.filter((r) => r.r === '平').length
  return { n: rs.length, w, d, l: rs.length - w - d, gf: rs.reduce((s, r) => s + r.gf, 0), ga: rs.reduce((s, r) => s + r.ga, 0), video: rs.filter((r) => r.m.video).length }
}

export function ScheduleTable({ lg, teamId, chapter }: { lg: League; teamId: string; chapter?: string }) {
  const rs = results(lg, teamId)
  const stages = [...new Set(rs.map((r) => r.m.stage))]
  return (
    <div className="sh-schedule">
      {stages.map((st) => (
        <table key={st} className="sh-table">
          <caption className="t-label">{st}</caption>
          <thead>
            <tr>{['轮次', '日期', '对手', '主客', '比分', '', '视频', ''].map((c, i) => <th key={i} className="t-label">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rs.filter((r) => r.m.stage === st).map((r) => {
              const href = matchHref(r.m, teamId, chapter)
              return (
                <tr key={r.m.id}>
                  <td className="t-numeric">{r.m.week ?? ''}</td>
                  <td className="t-numeric">{shortDate(r.m.date)}</td>
                  <td><a href={teamHref(r.oppId)}>{lg.teams[r.oppId].nameZh}</a></td>
                  <td>{r.home ? '主' : '客'}</td>
                  <td className="t-numeric">{`${r.gf}–${r.ga}`}</td>
                  <td><span className={`sh-res r-${r.r}`}>{r.r}</span></td>
                  <td>{r.m.video ? <span className="sh-has-video">有视频</span> : ''}</td>
                  <td>{href ? <a href={href}>比赛分析 →</a> : <span className="t-caption" title="原型里只生成了厦门飞鹭 30 场的比赛页">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ))}
    </div>
  )
}

export function PlayersTable({ lg, teamId, limit }: { lg: League; teamId: string; limit?: number }) {
  const ps = (lg.players[teamId] ?? []).filter((p) => p.apps > 0).slice(0, limit)
  return (
    <table className="sh-table sh-players">
      <thead>
        <tr>{['球员', '位置', '出场', '首发', '分钟', '进球', '触球/90', '关键动作'].map((c) => <th key={c} className="t-label">{c}</th>)}</tr>
      </thead>
      <tbody>
        {ps.map((p) => (
          <tr key={p.id}>
            <td>{`${p.number != null ? `#${p.number} ` : ''}${p.nameZh}`}</td>
            <td className="t-caption">{p.position}</td>
            <td className="t-numeric">{p.apps}</td>
            <td className="t-numeric">{p.starts}</td>
            <td className="t-numeric">{p.minutes}</td>
            <td className="t-numeric">{p.goals || ''}</td>
            <td className="t-numeric">{p.minutes ? fmt((p.touches / p.minutes) * 90, 'int') : '—'}</td>
            <td className="t-numeric">{p.keyActions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The match labels for a team's per-match bars: "9/19 北京理工". */
export function matchLabels(lg: League, teamId: string) {
  return results(lg, teamId).map((r) => `${shortDate(r.m.date)} ${r.home ? '主' : '客'} ${lg.teams[r.oppId].nameZh} ${r.gf}–${r.ga}`)
}
