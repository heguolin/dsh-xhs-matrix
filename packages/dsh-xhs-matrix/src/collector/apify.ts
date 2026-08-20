/** Apify Actor Run/Dataset 的 Host 适配器（v3 爆款采集）。 */

import { normalizeApifyItem, type NormalizedViral, type ViralCollectionResult, type ViralProvider, type ViralProviderRequest } from './provider.ts'

export interface ApifyConfig {
  actorId: string
  apiToken: string
  maxItems: number
  requestTimeoutMs: number
  maxPolls: number
}

export interface ApifyClientOptions { fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void> }

/** 通过 Apify API 搜索公开爆款样本；凭据只在 Host 端使用。 */
export class ApifyViralProvider implements ViralProvider {
  private readonly fetcher: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  constructor(private readonly config: ApifyConfig, options: ApifyClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.sleep = options.sleep ?? (async ms => new Promise(resolve => setTimeout(resolve, ms)))
  }

  async search(request: ViralProviderRequest): Promise<ViralCollectionResult> {
    if (this.config.actorId.trim() === '' || this.config.apiToken.trim() === '') return { items: [], status: 'failed', error: 'Apify actorId 和 apiToken 必填' }
    const limit = Math.min(request.maxItems, this.config.maxItems)
    const headers = { Authorization: `Bearer ${this.config.apiToken}`, 'content-type': 'application/json' }
    try {
      const runResponse = await this.fetcher(`https://api.apify.com/v2/acts/${encodeURIComponent(this.config.actorId)}/runs?token=${encodeURIComponent(this.config.apiToken)}`, {
        method: 'POST', headers,
        // 输入字段做多键兼容：不同 Actor 对搜索词字段命名不一
        // （query / searchKeyword / keyword / search），一并携带以提高命中；
        // socialdatax 类小红书 Actor：operation 合法值为 search_notes 等枚举，
        // 搜索词取顶层 keyword，条数限制字段为 max_items（下划线）。
        body: JSON.stringify({
          query: request.query,
          searchKeyword: request.query,
          keyword: request.query,
          search: request.query,
          operation: 'search_notes',
          max_items: limit,
          maxItems: limit,
          maxResults: limit,
        }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      })
      if (!runResponse.ok) {
        // 400/422 通常是输入校验失败：把 Apify 返回的具体错误带给用户，
        // 而不是只有 HTTP 状态码。
        let detail = ''
        try {
          const errorBody = await runResponse.json() as { error?: { message?: string } }
          detail = errorBody.error?.message ?? ''
        } catch {
          // 响应体非 JSON 时忽略详情。
        }
        const suffix = detail !== '' ? `：${detail}` : ''
        return { items: [], status: 'failed', error: `Apify Run HTTP ${runResponse.status}${suffix}` }
      }
      const run = await runResponse.json() as { data?: { id?: string; defaultDatasetId?: string; defaultKeyValueStoreId?: string; status?: string } }
      const runId = run.data?.id
      const datasetId = run.data?.defaultDatasetId
      const kvStoreId = run.data?.defaultKeyValueStoreId
      if (runId === undefined || datasetId === undefined) return { items: [], status: 'failed', error: 'Apify Run 响应缺少 id 或 Dataset' }
      let status = run.data?.status
      for (let poll = 0; poll < this.config.maxPolls && status !== 'SUCCEEDED'; poll += 1) {
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') return { items: [], status: 'failed', error: `Apify Run ${status}` }
        await this.sleep(250)
        const stateResponse = await this.fetcher(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.config.apiToken)}`, { headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) })
        if (!stateResponse.ok) return { items: [], status: 'failed', error: `Apify 状态 HTTP ${stateResponse.status}` }
        status = (await stateResponse.json() as { data?: { status?: string } }).data?.status
      }
      if (status !== 'SUCCEEDED') return { items: [], status: 'failed', error: 'Apify Run 等待超时' }
      // Run 成功但 Actor 可能在 OUTPUT 记录里给出警告（如免费计划额度
      // 用尽、要求付费计划）：把 warnings 透传给用户，避免“空结果”无解释。
      if (kvStoreId !== undefined) {
        try {
          const outputResponse = await this.fetcher(`https://api.apify.com/v2/key-value-stores/${encodeURIComponent(kvStoreId)}/records/OUTPUT?token=${encodeURIComponent(this.config.apiToken)}`, { headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) })
          if (outputResponse.ok) {
            const output = await outputResponse.json() as { warnings?: unknown }
            const warnings = Array.isArray(output.warnings) ? output.warnings.filter((w): w is string => typeof w === 'string') : []
            if (warnings.length > 0) return { items: [], status: 'failed', error: warnings.join('；') }
          }
        } catch {
          // OUTPUT 读取失败不影响正常路径。
        }
      }
      const datasetResponse = await this.fetcher(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${limit}&token=${encodeURIComponent(this.config.apiToken)}`, { headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) })
      if (!datasetResponse.ok) return { items: [], status: 'failed', error: `Apify Dataset HTTP ${datasetResponse.status}` }
      const items = await datasetResponse.json() as unknown
      if (!Array.isArray(items)) return { items: [], status: 'failed', error: 'Apify Dataset 不是数组' }
      return { items: items.slice(0, limit).map(item => normalizeApifyItem(item)), status: 'success' }
    } catch (error) {
      return { items: [], status: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 按笔记链接抓详情（get_note_detail）；任何失败返回 undefined。 */
  async fetchNoteDetail(noteUrl: string): Promise<NormalizedViral | undefined> {
    if (this.config.actorId.trim() === '' || this.config.apiToken.trim() === '') return undefined
    const headers = { Authorization: `Bearer ${this.config.apiToken}`, 'content-type': 'application/json' }
    try {
      const runResponse = await this.fetcher(`https://api.apify.com/v2/acts/${encodeURIComponent(this.config.actorId)}/runs?token=${encodeURIComponent(this.config.apiToken)}`, {
        method: 'POST', headers,
        body: JSON.stringify({ operation: 'get_note_detail', note_url: noteUrl }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      })
      if (!runResponse.ok) return undefined
      const run = await runResponse.json() as { data?: { id?: string; defaultDatasetId?: string; status?: string } }
      const runId = run.data?.id
      const datasetId = run.data?.defaultDatasetId
      if (runId === undefined || datasetId === undefined) return undefined
      let status = run.data?.status
      for (let poll = 0; poll < this.config.maxPolls && status !== 'SUCCEEDED'; poll += 1) {
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') return undefined
        await this.sleep(250)
        const stateResponse = await this.fetcher(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.config.apiToken)}`, { headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) })
        if (!stateResponse.ok) return undefined
        status = (await stateResponse.json() as { data?: { status?: string } }).data?.status
      }
      if (status !== 'SUCCEEDED') return undefined
      const datasetResponse = await this.fetcher(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=1&token=${encodeURIComponent(this.config.apiToken)}`, { headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) })
      if (!datasetResponse.ok) return undefined
      const items = await datasetResponse.json() as unknown
      if (!Array.isArray(items) || items.length === 0) return undefined
      const normalized = normalizeApifyItem(items[0])
      return normalized.body !== undefined && normalized.body !== '' ? normalized : undefined
    } catch {
      return undefined
    }
  }
}
