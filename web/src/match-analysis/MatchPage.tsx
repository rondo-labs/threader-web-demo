// /match/<id>/?team=<contestant id>&chapter=<key>: the match-analysis page. Team and chapter live in the
// address so a link opens the same reading.
import { useEffect, useState } from 'react'
import { isChapter, type ChapterKey } from './common'
import { Report } from './Report'
import { SectionBlock } from './sections'
import type { MatchData } from './types'

function readUrl() {
  const q = new URLSearchParams(location.search)
  const chapter = q.get('chapter')
  return { team: q.get('team'), chapter: isChapter(chapter) ? chapter : 'overview' }
}

function writeUrl(team: string, chapter: ChapterKey) {
  const url = new URL(location.href)
  url.searchParams.set('team', team)
  url.searchParams.set('chapter', chapter)
  history.replaceState(null, '', url)
}

export function MatchPage({ matchId }: { matchId: string }) {
  const [data, setData] = useState<MatchData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [chapter, setChapter] = useState<ChapterKey>(() => readUrl().chapter)

  useEffect(() => {
    fetch(`/data/matches/${encodeURIComponent(matchId)}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? '没有这场比赛' : `HTTP ${r.status}`)
        return r.json() as Promise<MatchData>
      })
      .then((d) => {
        const wanted = readUrl().team
        setData(d)
        setTeamId(wanted && d.teams[wanted] ? wanted : (d.focusTeamId ?? d.match.homeId))
      })
      .catch((e: Error) => setError(e.message))
  }, [matchId])

  useEffect(() => {
    if (!data || !teamId) return
    writeUrl(teamId, chapter)
    const { match, teams } = data
    document.title = `${teams[match.homeId].nameZh} ${match.score[0]}–${match.score[1]} ${teams[match.awayId].nameZh} · Threader`
  }, [data, teamId, chapter])

  if (error)
    return (
      <p className="boot">
        {`比赛没有加载出来（${error}）。`}
        <a href="/">回到全部比赛</a>
      </p>
    )
  if (!data || !teamId) return <p className="boot">加载中…</p>
  return (
    <Report
      data={data}
      teamId={teamId}
      setTeamId={setTeamId}
      chapter={chapter}
      setChapter={(c) => {
        setChapter(c)
        window.scrollTo(0, 0)
      }}
      renderSection={(s, ctx) => <SectionBlock section={s} ctx={ctx} />}
    />
  )
}
