// What an answer holds. The numbers, points and clips always come from queries; only the sentences are worded
// by the model. Today the answers are the examples built by pipeline/threader_demo/ask_examples.py.

export interface Fig { label: string; value: string; sub?: string }
export type Card =
  | { kind: 'figures'; items: Fig[] }
  | { kind: 'ranking'; title: string; rows: { key: string; label: string; v: number; sub?: string; mark?: boolean; href?: string }[] }
  | { kind: 'dots'; title: string; dots: { x: number; y: number; label: string }[]; caption: string }
  | { kind: 'table'; title: string; columns: string[]; rows: { cells: string[]; href?: string | null }[] }
  /** One match's goal moves, drawn from that match's page data. */
  | { kind: 'goals'; title: string; matchId: string; teamId: string }

/** Clips on one match's video: single events (merged by the 2-second rule) or ready-made spans. */
export interface Clips { title: string; matchId: string; eids?: string[]; spans?: { start: number; end: number; eids: string[] }[]; count: number }

export interface Answer {
  question: string
  /** The analysis object (分析对象) of this answer, when it has one. */
  subject: string | null
  scope: string
  steps: string[]
  paragraphs: string[]
  cards: Card[]
  clips: Clips | null
  /** Said plainly when the matches have no video. */
  videoNote: string
  links: { label: string; href: string }[]
  followUps: string[]
  /** An example answer, shown before the Q&A is connected. */
  example?: boolean
  /** No answer: the Q&A could not take this question. */
  unanswered?: boolean
}

export interface Example { kind: string; question: string; answer: Answer }
