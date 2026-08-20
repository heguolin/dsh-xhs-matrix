/** 外部趋势样本的统一模型、标准化和账号相关性排序。 */

import type { Account, Persona, PublishedNote, TrendSample } from './types.ts'

export interface NormalizedTrend {
  title: string
  summary?: string
  sourceUrl?: string
  source: 'apify' | 'manual'
  actorId?: string
  publishedAt?: string
  reads?: number
  likes?: number
  favorites?: number
  comments?: number
  keywords?: string[]
  contentType?: string
}

export interface RankedTrend extends NormalizedTrend {
  score: number
  reasons: string[]
}

/** 只保留 Apify 返回中可用于分析的公开字段。 */
export function normalizeApifyItem(item: unknown, actorId?: string): NormalizedTrend {
  if (typeof item !== 'object' || item === null) throw new Error('Apify item 必须是对象')
  const value = item as Record<string, unknown>
  if (typeof value.title !== 'string' || value.title.trim() === '') throw new Error('Apify item 缺少 title')
  const numberOf = (key: string): number | undefined => typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] as number : undefined
  const strings = (key: string): string[] | undefined => Array.isArray(value[key]) ? value[key].filter((entry): entry is string => typeof entry === 'string') : undefined
  return {
    title: value.title.trim(),
    summary: typeof value.summary === 'string' ? value.summary : typeof value.desc === 'string' ? value.desc : undefined,
    sourceUrl: typeof value.url === 'string' ? value.url : typeof value.noteUrl === 'string' ? value.noteUrl : undefined,
    source: 'apify', actorId,
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : undefined,
    reads: numberOf('reads') ?? numberOf('viewCount'), likes: numberOf('likes') ?? numberOf('likeCount'),
    favorites: numberOf('favorites') ?? numberOf('收藏'), comments: numberOf('comments') ?? numberOf('commentCount'),
    keywords: strings('keywords'), contentType: typeof value.contentType === 'string' ? value.contentType : undefined,
  }
}

/** 按当前账号人设、历史样本和公开互动信号排序，并返回解释。 */
export function rankTrends(account: Account, persona: Persona, notes: PublishedNote[], trends: NormalizedTrend[]): RankedTrend[] {
  const terms = [persona.positioning, persona.expertise, persona.contentDirections, persona.topicCriteria, persona.hookStyles?.join(' ')].filter((item): item is string => Boolean(item)).join(' ').toLowerCase()
  return trends.map(trend => {
    const haystack = `${trend.title} ${trend.summary ?? ''} ${(trend.keywords ?? []).join(' ')}`.toLowerCase()
    const reasons: string[] = []
    let score = 0
    if (terms !== '' && terms.split(/[,，、\s]+/).some(term => term.length > 1 && haystack.includes(term))) { score += 35; reasons.push(`匹配${account.name}的人设方向`) }
    const highWeight = notes.some(note => note.accountId === account.id && note.weight >= 4 && (haystack.includes(note.title.toLowerCase()) || note.topic !== undefined && haystack.includes(note.topic.toLowerCase())))
    if (highWeight) { score += 30; reasons.push('与账号高权重历史内容相近') }
    const engagement = (trend.likes ?? 0) + (trend.favorites ?? 0) + (trend.comments ?? 0)
    if (engagement > 0) { score += Math.min(25, Math.log10(engagement + 1) * 8); reasons.push('存在公开互动信号') }
    if (trend.publishedAt !== undefined && Date.now() - Date.parse(trend.publishedAt) < 7 * 86400000) { score += 10; reasons.push('近期趋势') }
    return { ...trend, score: Math.round(score), reasons }
  }).sort((a, b) => b.score - a.score)
}

export interface TrendProviderRequest { accountId: string; query: string; maxItems: number }
export interface CollectionResult { samples: NormalizedTrend[]; status: 'success' | 'failed'; error?: string }
export interface TrendProvider { search(request: TrendProviderRequest): Promise<CollectionResult> }
