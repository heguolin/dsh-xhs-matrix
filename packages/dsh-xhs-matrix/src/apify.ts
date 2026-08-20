/** Apify Actor Run/Dataset 的 Host 适配器。 */

import { normalizeApifyItem, type CollectionResult, type TrendProvider, type TrendProviderRequest } from './trends.ts'

export interface ApifyConfig {
  actorId: string
  apiToken: string
  maxItems: number
  requestTimeoutMs: number
  maxPolls: number
}

export interface ApifyClientOptions { fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void> }

/** 通过 Apify API 搜索公开趋势样本；凭据只在 Host 端使用。 */
export class ApifyTrendProvider implements TrendProvider {
  private readonly fetcher: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  constructor(private readonly config: ApifyConfig, options: ApifyClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.sleep = options.sleep ?? (async ms => new Promise(resolve => setTimeout(resolve, ms)))
  }

  async search(request: TrendProviderRequest): Promise<CollectionResult> {
    if (this.config.actorId.trim() === '' || this.config.apiToken.trim() === '') return { samples: [], status: 'failed', error: 'Apify actorId 和 apiToken 必填' }
    const limit = Math.min(request.maxItems, this.config.maxItems)
    const headers = { Authorization: `Bearer ${this.config.apiToken}`, 'content-type': 'application/json' }
    try {
      const runResponse = await this.fetcher(`https://api.apify.com/v2/acts/${encodeURIComponent(this.config.actorId)}/runs?token=${encodeURIComponent(this.config.apiToken)}`, {
        method: 'POST', headers, body: JSON.stringify({ query: request.query, maxItems: limit }), signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      })
      if (!runResponse.ok) return { samples: [], status: 'failed', error: `Apify Run HTTP ${runResponse.status}` }
      const run = await runResponse.json() as { data?: { id?: string; defaultDatasetId?: string; status?: string } }
      const runId = run.data?.id
      const datasetId = run.data?.defaultDatasetId
      if (runId === undefined || datasetId === undefined) return { samples: [], status: 'failed', error: 'Apify Run 响应缺少 id 或 Dataset' }
      let status = run.data?.status
      for (let poll = 0; poll < this.config.maxPolls && status !== 'SUCCEEDED'; poll += 1) {
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') return { samples: [], status: 'failed', error: `Apify Run ${status}` }
        await this.sleep(250)
        const stateResponse = await this.fetcher(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(this.config.apiToken)}`, { headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) })
        if (!stateResponse.ok) return { samples: [], status: 'failed', error: `Apify 状态 HTTP ${stateResponse.status}` }
        status = (await stateResponse.json() as { data?: { status?: string } }).data?.status
      }
      if (status !== 'SUCCEEDED') return { samples: [], status: 'failed', error: 'Apify Run 等待超时' }
      const datasetResponse = await this.fetcher(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${limit}&token=${encodeURIComponent(this.config.apiToken)}`, { headers, signal: AbortSignal.timeout(this.config.requestTimeoutMs) })
      if (!datasetResponse.ok) return { samples: [], status: 'failed', error: `Apify Dataset HTTP ${datasetResponse.status}` }
      const items = await datasetResponse.json() as unknown
      if (!Array.isArray(items)) return { samples: [], status: 'failed', error: 'Apify Dataset 不是数组' }
      return { samples: items.slice(0, limit).map(item => normalizeApifyItem(item, this.config.actorId)), status: 'success' }
    } catch (error) {
      return { samples: [], status: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
  }
}
