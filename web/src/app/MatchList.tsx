// /: every match of the focus teams, newest first, so a visitor can pick one to read.
import { useEffect, useState } from 'react'
import type { MatchSummary, SiteIndex } from '../match-analysis/types'

function result(m: MatchSummary) {
  const us = m.focusTeamId === m.homeId ? 0 : 1
  const diff = m.score[us] - m.score[1 - us]
  return diff > 0 ? { label: '胜', cls: 'win' } : diff < 0 ? { label: '负', cls: 'loss' } : { label: '平', cls: 'draw' }
}

export function MatchList() {
  const [index, setIndex] = useState<SiteIndex | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Threader · 比赛分析'
    fetch('/data/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<SiteIndex>
      })
      .then(setIndex)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="boot">{`比赛列表没有加载出来（${error}）。`}</p>
  if (!index) return <p className="boot">加载中…</p>
  return (
    <div className="ml">
      <header className="ml-head">
        <div className="t-label">THREADER · 比赛分析</div>
      </header>
      <main className="ml-main">
        {index.focusTeams.map((team) => {
          const matches = index.matches.filter((m) => m.focusTeamId === team.id).sort((a, b) => b.date.localeCompare(a.date))
          const withVideo = matches.filter((m) => m.video).length
          return (
            <section key={team.id} className="ml-team">
              <div className="ml-team-head">
                <h1 className="t-display">{team.nameZh}</h1>
                <p className="t-lead">{`2026 赛季${team.competition}，${matches.length} 场比赛${withVideo ? `，其中 ${withVideo} 场有比赛视频` : ''}。`}</p>
              </div>
              <table className="ml-table">
                <thead>
                  <tr>
                    <th className="t-label">日期</th>
                    <th className="t-label">阶段</th>
                    <th className="t-label">对手</th>
                    <th className="t-label">主客</th>
                    <th className="t-label ml-score">比分</th>
                    <th className="t-label">结果</th>
                    <th className="t-label">视频</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const home = m.focusTeamId === m.homeId
                    const oppId = home ? m.awayId : m.homeId
                    const r = result(m)
                    const href = `/match/${m.id}/?team=${m.focusTeamId}`
                    return (
                      <tr key={m.id} onClick={() => location.assign(href)}>
                        <td className="t-numeric">{m.date}</td>
                        <td className="t-caption">{m.stage}</td>
                        <th className="t-body">
                          <a href={href}>{m.teams[oppId]}</a>
                        </th>
                        <td className="t-caption">{home ? '主场' : '客场'}</td>
                        <td className="t-numeric ml-score">{`${m.score[0]}–${m.score[1]}`}</td>
                        <td>
                          <span className={`ml-result ${r.cls}`}>{r.label}</span>
                        </td>
                        <td className="t-caption">{m.video ? <span className="ml-video">有视频</span> : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )
        })}
      </main>
    </div>
  )
}
