export interface NormalizedViral {
  title: string
  body?: string
  sourceUrl?: string
  source: 'apify' | 'manual'
  publishedAt?: string
  reads?: number
  likes?: number
  comments?: number
}
export interface RankedViral extends NormalizedViral { score: number; reasons: string[] }
export interface ViralProviderRequest { accountId: string; query: string; maxItems: number }
export interface ViralCollectionResult { items: NormalizedViral[]; status: 'success' | 'failed'; error?: string }
export interface ViralProvider { search(request: ViralProviderRequest): Promise<ViralCollectionResult> }

export function normalizeApifyItem(item: unknown): NormalizedViral {
  if (typeof item !== 'object' || item === null) throw new Error('Apify item 必须是对象')
  const value = item as Record<string, unknown>
  if (typeof value.title !== 'string' || value.title.trim() === '') throw new Error('Apify item 缺少 title')
  const num = (key: string): number | undefined => typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] as number : undefined
  const body = typeof value.body === 'string' ? value.body : typeof value.content === 'string' ? value.content : typeof value.desc === 'string' ? value.desc : typeof value.text === 'string' ? value.text : undefined
  const url = typeof value.url === 'string' ? value.url : typeof value.noteUrl === 'string' ? value.noteUrl : undefined
  return {
    title: value.title.trim(),
    body: body === undefined ? undefined : body.trim(),
    sourceUrl: url,
    source: 'apify',
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : undefined,
    reads: num('reads') ?? num('viewCount'), likes: num('likes') ?? num('likeCount'),
    comments: num('comments') ?? num('commentCount'),
  }
}
