import type { Account, Persona, PublishedNote } from '../types.ts'
import type { NormalizedViral, RankedViral } from './provider.ts'

export function rankViralItems(account: Account, persona: Persona, notes: PublishedNote[], items: NormalizedViral[]): RankedViral[] {
  const terms = [persona.name, persona.positioning, persona.expertise, persona.contentDirections, persona.topicCriteria, persona.hookStyles?.join(' ')]
    .filter((item): item is string => Boolean(item)).join(' ').toLowerCase()
  return items.map(item => {
    const haystack = `${item.title} ${item.body ?? ''}`.toLowerCase()
    const reasons: string[] = []
    let score = 0
    if (terms !== '' && terms.split(/[,，、\s]+/).some(term => term.length > 1 && haystack.includes(term))) { score += 35; reasons.push(`匹配${account.name}的人设方向`) }
    const highWeight = notes.some(note => note.accountId === account.id && note.weight >= 4 && (haystack.includes(note.title.toLowerCase()) || (note.topic !== undefined && haystack.includes(note.topic.toLowerCase()))))
    if (highWeight) { score += 30; reasons.push('与账号高权重历史内容相近') }
    const engagement = (item.likes ?? 0) + (item.comments ?? 0)
    if (engagement > 0) { score += Math.min(25, Math.log10(engagement + 1) * 8); reasons.push('存在公开互动信号') }
    if (item.publishedAt !== undefined && Date.now() - Date.parse(item.publishedAt) < 7 * 86400000) { score += 10; reasons.push('近期趋势') }
    return { ...item, score: Math.round(score), reasons }
  }).sort((a, b) => b.score - a.score)
}
