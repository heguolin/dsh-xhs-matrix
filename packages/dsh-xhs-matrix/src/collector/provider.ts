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
  const num = (key: string): number | undefined => typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] as number : undefined
  const firstString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      if (typeof value[key] === 'string' && value[key].trim() !== '') return value[key].trim()
    }
    return undefined
  }
  const body = firstString('body', 'content', 'desc', 'text', 'description')
  // 标题字段在不同 Actor 命名不一（title/note_title/title_text/name）；
  // 都没有时用正文首行兜底，避免整批采集因一条缺标题而失败。
  let title = firstString('title', 'note_title', 'title_text', 'name')
  if (title === undefined && body !== undefined) {
    const firstLine = body.split('\n')[0].trim()
    if (firstLine !== '') title = firstLine.slice(0, 60)
  }
  if (title === undefined || title === '') throw new Error('Apify item 缺少 title')
  const url = firstString('url', 'noteUrl', 'note_url', 'link')
  return {
    title,
    body,
    sourceUrl: url,
    source: 'apify',
    publishedAt: firstString('publishedAt', 'publish_time', 'created_at', 'time'),
    reads: num('reads') ?? num('viewCount') ?? num('view_count'),
    likes: num('likes') ?? num('likeCount') ?? num('like_count'),
    comments: num('comments') ?? num('commentCount') ?? num('comment_count'),
  }
}
