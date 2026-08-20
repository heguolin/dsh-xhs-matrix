import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { ViralBatch, ViralItem, ViralStatus } from '../../types.ts'
import css from './panel.module.css'

/** 正文摘要的截断长度（字符）。 */
const BODY_PREVIEW_LENGTH = 120

/** 审核操作回调；status 限定为待审核条目可选的两种结果。 */
type ReviewAction = 'accepted' | 'ignored'

/** 单条爆款的展示行：标题、正文摘要、来源链接、推荐分、匹配理由、状态与审核按钮。 */
function ViralRow({ item, busy, onReview }: {
  item: ViralItem
  busy: boolean
  onReview: (itemId: string, status: ReviewAction) => void
}) {
  const bodyPreview = item.body.length > BODY_PREVIEW_LENGTH
    ? `${item.body.slice(0, BODY_PREVIEW_LENGTH)}…`
    : item.body
  return (
    <div className={css.topicItem}>
      <span className={css.topicTitle}>{item.title}</span>
      <div className={css.topicReason}>
        {bodyPreview === '' ? <span className={css.muted}>（无正文摘要）</span> : bodyPreview}
      </div>
      {item.sourceUrl !== undefined && (
        <div className={css.topicReason} style={{ marginTop: 4 }}>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>来源链接 ↗</a>
        </div>
      )}
      <div className={css.topicReason} style={{ marginTop: 4 }}>
        匹配：{item.reasons.length > 0 ? item.reasons.join(' · ') : '未说明'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <span className={item.score >= 60 ? css.score : `${css.score} ${css.scoreLow}`}>推荐分 {item.score}</span>
        {item.status === 'pending' && <span className={css.badgeWarn}>待审核</span>}
        {item.status === 'accepted' && <span className={css.badgeGreen}>已采纳（创作参考）</span>}
        {item.status === 'ignored' && <span className={css.badgeGray}>已忽略</span>}
        <span style={{ flex: 1 }} />
        {item.status === 'pending' && (
          <>
            <button className={css.primary} disabled={busy} onClick={() => onReview(item.id, 'accepted')}>采纳</button>
            <button className={css.ghostBtn} disabled={busy} onClick={() => onReview(item.id, 'ignored')}>忽略</button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 爆款池（v3 取代趋势选题页）：
 * 顶部为状态筛选与「采集爆款」「配置 Apify」操作；列表按账号展示爆款条目，
 * 待审核条目可「采纳 / 忽略」，采集与审核后自动刷新。
 */
export function ViralTab({ api, accountId }: { api: XhsApi; accountId: string }) {
  const [batches, setBatches] = useState<Array<ViralBatch & { items: ViralItem[] }>>([])
  const [filter, setFilter] = useState<'' | ViralStatus>('')
  const [error, setError] = useState('')
  const [collecting, setCollecting] = useState(false)
  const [reviewingId, setReviewingId] = useState('')
  // Apify 数据源配置弹窗状态
  const [configOpen, setConfigOpen] = useState(false)
  const [apifyConfigured, setApifyConfigured] = useState(false)
  const [actorId, setActorId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [maxItems, setMaxItems] = useState('10')
  const [savingConfig, setSavingConfig] = useState(false)

  /** 按账号与当前筛选状态重新拉取爆款池（按采集批次分组）。 */
  const refresh = useCallback(async () => {
    try {
      setBatches(await api.listViralBatches(accountId, filter === '' ? undefined : filter))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId, filter])

  useEffect(() => { void refresh() }, [refresh])

  // 启动时读取 Apify 配置，判断是否已配置数据源。
  useEffect(() => {
    api.getApifyConfig()
      .then(config => {
        setApifyConfigured(config.actorId !== '' && config.apiToken !== '')
        setActorId(config.actorId)
        setApiToken(config.apiToken)
        setMaxItems(String(config.maxItems ?? 10))
      })
      .catch(() => { /* 读取失败保持未配置态 */ })
  }, [api])

  /** 打开配置弹窗，先回填当前配置。 */
  const openConfig = (): void => {
    void api.getApifyConfig().then(config => {
      setActorId(config.actorId)
      setApiToken(config.apiToken)
      setMaxItems(String(config.maxItems ?? 10))
      setConfigOpen(true)
    }).catch(() => setConfigOpen(true))
  }

  const saveConfig = async (): Promise<void> => {
    if (actorId.trim() === '' || apiToken.trim() === '') { setError('Actor ID 与 API Token 必填'); return }
    if (!actorId.includes('/')) { setError('Actor ID 格式应为「用户名/Actor名」，如 kuaima/xiaohongshu-search（不是 Apify User ID）'); return }
    setSavingConfig(true)
    try {
      await api.updateApifyConfig({
        actorId: actorId.trim(),
        apiToken: apiToken.trim(),
        maxItems: Number(maxItems) > 0 ? Number(maxItems) : 10,
      })
      setApifyConfigured(true)
      setConfigOpen(false)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingConfig(false)
    }
  }

  /** 采集爆款入库（query/maxItems 由后端按人设方向降级），完成后刷新列表。 */
  const collect = async (): Promise<void> => {
    if (accountId === '') { setError('请先在左侧选择账号'); return }
    setCollecting(true)
    try {
      await api.collectViral(accountId)
      setError('')
      await refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Apify 认证失败：给用户可操作的指引。
      if (/\b401\b|\b403\b/.test(message)) {
        setError(`${message}。API Token 无效或已过期：请打开 apify.com → Settings → API & Integrations，点击 API token 右侧的「复制」按钮（不要复制掩码星号），回到「配置 Apify」重新粘贴后重试。`)
      } else if (/未配置/.test(message)) {
        setError(`${message}。请先点击「配置 Apify」填写 Actor ID 与 API Token。`)
      } else if (/尚未分配人设/.test(message)) {
        setError(`${message}。请先到「人设配置」为该账号绑定人设后再采集。`)
      } else {
        setError(message)
      }
    } finally {
      setCollecting(false)
    }
  }

  /** 审核条目为 accepted / ignored，完成后刷新列表。 */
  const review = async (itemId: string, status: ReviewAction): Promise<void> => {
    setReviewingId(itemId)
    try {
      await api.reviewViralItem(accountId, itemId, status)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReviewingId('')
    }
  }

  /** 删除整个采集批次（含已采纳条目），不影响其他批次。 */
  const deleteBatch = async (batchId: string): Promise<void> => {
    if (!window.confirm('确定删除这个采集批次？该批次的全部爆款（含已采纳）将被移除，不影响其他批次。')) return
    try {
      await api.deleteViralBatch(accountId, batchId)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}

      <section className={css.panel}>
        <div className={css.panelTitle}>
          <span>爆款池</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!apifyConfigured && <span className={css.badgeWarn}>未配置数据源</span>}
            <select className={css.input} style={{ width: 130 }} value={filter} onChange={e => setFilter(e.target.value as '' | ViralStatus)}>
              <option value="">全部</option>
              <option value="pending">待审核</option>
              <option value="accepted">已采纳</option>
              <option value="ignored">已忽略</option>
            </select>
            <button className={css.ghostBtn} onClick={openConfig}>配置 Apify</button>
            <button className={css.primary} onClick={() => void collect()} disabled={collecting}>
              {collecting ? '采集中…' : '采集爆款'}
            </button>
          </div>
        </div>

        {batches.length === 0 && (
          <div className={css.muted}>
            爆款池为空。点击「采集爆款」从外部数据源拉取内容并按当前人设与知识库排序；
            {!apifyConfigured && ' 先点击「配置 Apify」填写 Actor ID 与 API Token。'}
          </div>
        )}
        {batches.map(batch => (
          <div key={batch.id} className={css.panel} style={{ marginTop: 10 }}>
            <div className={css.panelTitle}>
              <span>批次 · {batch.collectedAt.slice(0, 16).replace('T', ' ')}{batch.id === 'legacy' ? '（历史）' : ''}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={css.muted}>{batch.itemCount} 条</span>
                <button className={css.dangerBtn} onClick={() => void deleteBatch(batch.id)}>删除该批次</button>
              </div>
            </div>
            {batch.items.length === 0 && <div className={css.muted}>该批次在当前筛选下没有条目。</div>}
            {batch.items.map(item => (
              <ViralRow key={item.id} item={item} busy={reviewingId === item.id} onReview={(id, status) => void review(id, status)} />
            ))}
          </div>
        ))}
      </section>

      {/* Apify 数据源配置弹窗 */}
      {configOpen && (
        <div className={css.overlay} onClick={() => setConfigOpen(false)}>
          <div className={css.dialog} onClick={e => e.stopPropagation()}>
            <button className={css.dialogClose} onClick={() => setConfigOpen(false)} aria-label="关闭">×</button>
            <h3>配置 Apify 爆款数据源</h3>
            <div className={css.muted} style={{ marginBottom: 12, lineHeight: 1.7 }}>
              <b>如何获取：</b>
              <br />1. 打开 <a href="https://apify.com" target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>apify.com</a> 注册账号（免费额度可用）。
              <br />2. <b>API Token</b>：登录后进入 <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>Settings → Integrations</a>，复制 API token（形如 <code>apify_api_xxx</code>）。
              <br />3. <b>Actor ID</b>：在 <a href="https://apify.com/store?q=xiaohongshu" target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>Apify Store</a> 搜索小红书相关 Actor（如 <code>kuaima/xiaohongshu-search</code>），Actor ID 即「用户名/Actor名」，取自 Actor 页面地址。
              <br />4. 保存配置后点「采集爆款」。采集消耗 Apify 平台额度，请按需使用。
            </div>
            <div className={css.field}>
              <label>Actor ID</label>
              <input className={css.input} value={actorId} onChange={e => setActorId(e.target.value)} placeholder="如 kuaima/xiaohongshu-search" />
            </div>
            <div className={css.field}>
              <label>API Token</label>
              <input className={css.input} type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="apify_api_..." />
            </div>
            <div className={css.field}>
              <label>单次最大候选数</label>
              <input className={css.input} type="number" min={1} value={maxItems} onChange={e => setMaxItems(e.target.value)} />
            </div>
            <div className={css.rowActions}>
              <button className={css.primary} onClick={() => void saveConfig()} disabled={savingConfig}>
                {savingConfig ? '保存中…' : '保存配置'}
              </button>
              <button className={css.ghostBtn} onClick={() => setConfigOpen(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
