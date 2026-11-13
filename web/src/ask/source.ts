// Where answers come from. The Q&A backend is not connected yet, so the home page answers its example questions
// from site-data/ask/examples.json and says so for anything else. The backend will replace `ask`.
import type { Answer, Example } from './types'

let examples: Promise<Example[]> | null = null
export function loadExamples(): Promise<Example[]> {
  examples ??= fetch('/data/ask/examples.json')
    .then((r) => (r.ok ? r.json() : { examples: [] }))
    .then((d: { examples: Example[] }) => d.examples)
    .catch(() => [])
  return examples
}

const norm = (s: string) => s.replace(/[\s，。？！、,.?!]/g, '')

export async function ask(question: string): Promise<Answer> {
  const list = await loadExamples()
  const hit = list.find((e) => norm(e.question) === norm(question))
  if (hit) return { ...hit.answer, question, example: true }
  return {
    question,
    subject: null,
    scope: '',
    steps: [],
    paragraphs: [
      '问答还在接入中，现在只能回答下面几个示例问题。',
      '接上之后，回答里的数字、球场图和视频片段都由查询直接生成，模型只负责听懂问题和组织语言。',
    ],
    cards: [],
    clips: null,
    videoNote: '',
    links: [{ label: '先去看球队', href: '/teams/' }],
    followUps: list.map((e) => e.question),
    unanswered: true,
  }
}
