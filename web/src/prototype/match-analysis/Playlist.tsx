// PROTOTYPE: one playlist state and one player, shared by the three layouts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildClips, playerLabel, type Clip } from './clips'
import { EventThumb, type Focus } from './Pitch'
import type { MatchData } from './types'

export interface Playlist {
  title: string
  clips: Clip[]
  index: number
  all: Set<string>
  opened: number
  /** The section the playlist was opened from (round 2), so only its chart highlights and it can host the player. */
  owner?: string
  /** Ready-made spans (whole moves), not single actions merged by the 2-second rule. */
  spans?: boolean
}

export function usePlaylist(data: MatchData) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const open = useCallback(
    (title: string, eids: string[], startEid?: string, owner?: string) => {
      const clips = buildClips(eids, data)
      if (!clips.length) return
      const start = startEid ? clips.findIndex((c) => c.eids.includes(startEid)) : 0
      setPlaylist({ title, clips, index: Math.max(0, start), all: new Set(eids), opened: Date.now(), owner })
    },
    [data],
  )
  /** Ready-made spans, e.g. a goal's whole move from its first touch to just after the goal. */
  const openSpans = useCallback((title: string, spans: Clip[], owner?: string) => {
    if (!spans.length) return
    setPlaylist({ title, clips: spans, index: 0, all: new Set(spans.flatMap((c) => c.eids)), opened: Date.now(), owner, spans: true })
  }, [])
  const close = useCallback(() => setPlaylist(null), [])
  const go = useCallback(
    (index: number) => setPlaylist((p) => (p && index >= 0 && index < p.clips.length ? { ...p, index } : p)),
    [],
  )
  const focus: Focus | null = useMemo(
    () => (playlist ? { all: playlist.all, current: new Set(playlist.clips[playlist.index]?.eids ?? []) } : null),
    [playlist],
  )
  useEffect(() => {
    if (!playlist) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playlist, close])
  return { playlist, open, openSpans, close, go, focus }
}

function caption(p: Playlist): string {
  const actions = p.clips.reduce((n, c) => n + c.eids.length, 0)
  const base = `第 ${p.index + 1} 段，共 ${p.clips.length} 段`
  if (p.spans) return `${base}，每段是一整个回合`
  return actions === p.clips.length ? base : `${base}（${actions} 个动作，相隔不到 2 秒的合成一段）`
}

interface PlayerProps {
  data: MatchData
  playlist: Playlist | null
  go: (index: number) => void
  close?: () => void
  layout: 'drawer' | 'dock' | 'modal' | 'inline'
}

export function Player({ data, playlist, go, close, layout }: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const [auto, setAuto] = useState(true)
  // Inside a section the list stays folded so the figures table below remains in view.
  const [showList, setShowList] = useState(layout !== 'inline')
  const clip = playlist?.clips[playlist.index]

  useEffect(() => {
    const v = video.current
    if (!v || !clip) return
    const seek = () => {
      v.currentTime = clip.start
      void v.play().catch(() => {})
    }
    if (v.readyState >= 1) {
      seek()
      return
    }
    v.addEventListener('loadedmetadata', seek, { once: true })
    return () => v.removeEventListener('loadedmetadata', seek)
  }, [clip])

  useEffect(() => {
    list.current?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' })
  }, [playlist?.index, playlist?.opened])

  const onTime = () => {
    const v = video.current
    if (!v || !clip || !playlist) return
    // Only react when playback runs past the clip end, not when someone drags far away.
    if (v.currentTime >= clip.end && v.currentTime < clip.end + 1.5) {
      if (auto && playlist.index < playlist.clips.length - 1) go(playlist.index + 1)
      else v.pause()
    }
  }
  const replay = () => {
    const v = video.current
    if (v && clip) {
      v.currentTime = clip.start
      void v.play()
    }
  }
  const first = clip ? data.events[clip.eids[0]] : undefined

  return (
    <div className={`player player-${layout}`}>
      <div className="player-head">
        <div>
          <div className="t-heading">{playlist?.title ?? '播放列表'}</div>
          <div className="t-caption">
            {playlist ? caption(playlist) : '点任何一个数字或图上的标记，这里就会播放它背后的片段'}
          </div>
        </div>
        {close && playlist && (
          <button className="btn-quiet" onClick={close}>
            关闭
          </button>
        )}
      </div>
      <div className="player-frame">
        <video ref={video} src={data.video.src} preload="metadata" controls playsInline onTimeUpdate={onTime} />
        {!playlist && <div className="player-empty t-caption">还没有选中任何片段</div>}
      </div>
      {playlist && (
        <div className="player-controls">
          <button className="btn" onClick={() => go(playlist.index - 1)} disabled={playlist.index === 0}>
            上一段
          </button>
          <button className="btn" onClick={replay}>
            重播
          </button>
          <button className="btn" onClick={() => go(playlist.index + 1)} disabled={playlist.index >= playlist.clips.length - 1}>
            下一段
          </button>
          {layout === 'inline' && (
            <button className="btn-quiet" onClick={() => setShowList(!showList)}>
              {showList ? '收起列表' : `列表（${playlist.clips.length} 段）`}
            </button>
          )}
          <label className="t-caption auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自动连播
          </label>
          {layout === 'inline' && first && (
            <div className="now-playing t-caption">{`正在播：${first.clock} · ${playerLabel(data, first.playerId)} · ${first.label}`}</div>
          )}
        </div>
      )}
      {layout === 'modal' && first && (
        <div className="player-thumb">
          <EventThumb ev={first} />
          <div className="t-caption">{`${first.clock} · ${playerLabel(data, first.playerId)} · ${first.label}`}</div>
        </div>
      )}
      <ol className="player-list" ref={list} hidden={!showList}>
        {playlist?.clips.map((c, i) => {
          const ev = data.events[c.eids[0]]
          return (
            <li key={`${playlist.opened}-${i}`}>
              <button className={`clip-row${i === playlist.index ? ' is-current' : ''}`} onClick={() => go(i)}>
                <span className="t-numeric idx">{i + 1}</span>
                <span className="t-numeric">{ev?.clock}</span>
                <span className="what">
                  {[playerLabel(data, ev?.playerId ?? null), ev?.label].filter(Boolean).join(' · ')}
                  {c.eids.length > 1 && <span className="t-caption"> 等 {c.eids.length} 个动作</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
