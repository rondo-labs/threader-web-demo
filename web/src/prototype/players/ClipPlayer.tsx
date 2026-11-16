// PROTOTYPE: the match page's inline player, for a season: a playlist can hold clips from several matches, so each
// clip carries its own video file. Clips are the player's actions with video, a few seconds either side; actions
// less than 2 seconds apart merge into one clip, as on the match page.
import { useEffect, useRef, useState } from 'react'
import { WINDOWS } from '../../match-analysis/clips'
import { shortDate, type PlayerDetail, type PlayersLeague } from './data'

export interface PClip { src: string; start: number; end: number; evs: number[] }
export interface PPlaylist { title: string; clips: PClip[]; index: number; owner: string; opened: number }
const KINDS = ['pass', 'cross', 'shot', 'goal'] as const

export function buildClips(detail: PlayerDetail, evIdx: number[]): PClip[] {
  const evs = evIdx
    .map((i) => ({ i, e: detail.events[i] }))
    .filter(({ e }) => e[8] != null && detail.apps[e[4]].src)
    .sort((a, b) => a.e[4] - b.e[4] || a.e[8]! - b.e[8]!)
  const clips: PClip[] = []
  for (const { i, e } of evs) {
    const [pre, post] = WINDOWS[KINDS[e[9]]]
    const src = detail.apps[e[4]].src!
    const start = Math.max(0, e[8]! - pre), end = e[8]! + post
    const last = clips.at(-1)
    if (last && last.src === src && start - last.end < 2) {
      last.end = Math.max(last.end, end)
      last.evs.push(i)
    } else clips.push({ src, start, end, evs: [i] })
  }
  return clips
}

export function ClipPlayer({ detail, lg, playlist, go, close }: {
  detail: PlayerDetail; lg: PlayersLeague; playlist: PPlaylist; go: (i: number) => void; close: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [auto, setAuto] = useState(true)
  const [showList, setShowList] = useState(false)
  const clip = playlist.clips[playlist.index]

  useEffect(() => {
    const v = video.current
    if (!v || !clip) return
    const seek = () => {
      v.currentTime = clip.start
      void v.play().catch(() => {})
    }
    if (!v.src.endsWith(encodeURI(clip.src))) v.src = clip.src
    else if (v.readyState >= 1) {
      seek()
      return
    }
    v.addEventListener('loadedmetadata', seek, { once: true })
    return () => v.removeEventListener('loadedmetadata', seek)
  }, [clip])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const onTime = () => {
    const v = video.current
    if (!v || !clip) return
    if (v.currentTime >= clip.end && v.currentTime < clip.end + 1.5) {
      if (auto && playlist.index < playlist.clips.length - 1) go(playlist.index + 1)
      else v.pause()
    }
  }
  const line = (c: PClip) => {
    const e = detail.events[c.evs[0]]
    const a = detail.apps[e[4]]
    return `${shortDate(a.d)} ${a.h ? '主' : '客'} ${lg.teams[a.o]?.nameZh ?? ''} · ${e[7]} · ${detail.labels[e[6]]}`
  }
  const actions = playlist.clips.reduce((n, c) => n + c.evs.length, 0)
  return (
    <div className="player pp-player">
      <div className="player-head">
        <div>
          <div className="t-heading">{playlist.title}</div>
          <div className="t-caption">
            {`第 ${playlist.index + 1} 段，共 ${playlist.clips.length} 段`}
            {actions > playlist.clips.length ? `（${actions} 个动作，相隔不到 2 秒的合成一段）` : ''}
          </div>
        </div>
        <button className="btn-quiet" onClick={close}>关闭</button>
      </div>
      <div className="player-frame">
        <video ref={video} preload="metadata" controls playsInline onTimeUpdate={onTime} />
      </div>
      <div className="player-controls">
        <button className="btn" onClick={() => go(playlist.index - 1)} disabled={playlist.index === 0}>上一段</button>
        <button className="btn" onClick={() => { const v = video.current; if (v && clip) { v.currentTime = clip.start; void v.play() } }}>重播</button>
        <button className="btn" onClick={() => go(playlist.index + 1)} disabled={playlist.index >= playlist.clips.length - 1}>下一段</button>
        <button className="btn-quiet" onClick={() => setShowList(!showList)}>{showList ? '收起列表' : `列表（${playlist.clips.length} 段）`}</button>
        <label className="t-caption auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自动连播</label>
        {clip && <div className="now-playing t-caption">{`正在播：${line(clip)}`}</div>}
      </div>
      <ol className="player-list" hidden={!showList}>
        {playlist.clips.map((c, i) => (
          <li key={`${playlist.opened}-${i}`}>
            <button className={`clip-row pp-clip-row${i === playlist.index ? ' is-current' : ''}`} onClick={() => go(i)}>
              <span className="t-numeric idx">{i + 1}</span>
              <span className="what">{line(c)}{c.evs.length > 1 && <span className="t-caption">{` 等 ${c.evs.length} 个动作`}</span>}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
