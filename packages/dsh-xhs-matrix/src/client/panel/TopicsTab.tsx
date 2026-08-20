import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface RankedTrend { title: string; score: number; reasons: string[] }
interface TopicRow { id: string; title: string; status: string; createdAt: string }

/**
 * 趋势选题（设计稿 content/detail-surfaces.html）：
 * 左栏 Apify 趋势候选（推荐分 + 可解释匹配理由），右栏账号选题标准；
 * 下部保留选题池管理（手动添加 / 批量导入 / 状态过滤）。
 */
export function TopicsTab({ api, accountId }: { api: XhsApi; accountId: string }) {
  const [candidates, setCandidates] = useState<RankedTrend[]>([])
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [persona, setPersona] = useState<{
    expertise?: string; contentDirections?: string; topicCriteria?: string
    hookStyles?: string[]; defaultHashtags?: string[]
  } | undefined>(undefined)
  const [filter, setFilter] = useState('')
  const [title, setTitle] = useState('')
  const [bulk, setBulk] = useState('')
  const [error, setError] = useState('')
  const [collecting, setCollecting] = useState(false)
  // Apify 配置弹窗状态
  const [configOpen, setConfigOpen] = useState(false)
  const [apifyConfigured, setApifyConfigured] = useState(false)
  const [actorId, setActorId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [maxItems, setMaxItems] = useState('10')
  const [savingConfig, setSavingConfig] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [topicList, accountList, personaList] = await Promise.all([api.listTopics(), api.listAccounts(), api.listPersonas()])
      setTopics(topicList)
      const account = accountList.find(item => item.id === accountId)
      setPersona(personaList.find(p => p.id === account?.personaId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId])

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

  const collect = async (): Promise<void> => {
    if (accountId === '') { setError('请先在左侧选择账号'); return }
    setCollecting(true)
    try {
      const ranked = await api.collectTrends(accountId, undefined, 10)
      setCandidates(ranked)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCollecting(false)
    }
  }

  const add = async (): Promise<void> => {
    if (title.trim() === '') return
    try {
      await api.addTopic(title)
      setTitle('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const doImport = async (): Promise<void> => {
    const titles = bulk.split('\n').map(t => t.trim()).filter(t => t !== '')
    if (titles.length === 0) return
    try {
      await api.importTopics(titles)
      setBulk('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const retire = async (id: string): Promise<void> => {
    try {
      await api.retireTopic(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const visible = filter === '' ? topics : topics.filter(t => t.status === filter)

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}

      <div className={css.topicLayout}>
        {/* 左：Apify 趋势候选 */}
        <section className={css.panel}>
          <div className={css.panelTitle}>
            <span>Apify 趋势候选</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {!apifyConfigured && <span className={css.badgeWarn}>未配置数据源</span>}
              <button className={css.ghostBtn} onClick={openConfig}>配置 Apify</button>
              <button className={css.primary} onClick={() => void collect()} disabled={collecting}>
                {collecting ? '采集中…' : '开始采集'}
              </button>
            </div>
          </div>
          {candidates.length === 0 && (
            <div className={css.muted}>
              尚未采集。点击「开始采集」拉取外部趋势并按当前人设与知识库权重排序；
              {!apifyConfigured && ' 先点击「配置 Apify」填写 Actor ID 与 API Token。'}
            </div>
          )}
          {candidates.map((candidate, index) => (
            <div key={`${candidate.title}-${index}`} className={css.topicItem}>
              <span className={css.topicTitle}>{candidate.title}</span>
              <div className={css.topicReason}>
                匹配：{candidate.reasons.length > 0 ? candidate.reasons.join(' · ') : '人设相关'}
              </div>
              <span className={css.score}>推荐分 {candidate.score} · 来源：Apify</span>
            </div>
          ))}
        </section>

        {/* 右：账号选题标准 */}
        <section className={css.panel}>
          <div className={css.panelTitle}><span>账号选题标准</span></div>
          {persona === undefined && <div className={css.muted}>该账号尚未分配人设，请先到「人设配置」创建并分配。</div>}
          {persona !== undefined && (
            <>
              <div className={css.contextLine}><b style={{ display: 'block', color: 'var(--xhs-text)', marginBottom: 4 }}>领域</b>{persona.expertise || '—'}</div>
              <div className={css.contextLine}><b style={{ display: 'block', color: 'var(--xhs-text)', marginBottom: 4 }}>必须满足</b>{persona.topicCriteria || '—'}</div>
              <div className={css.contextLine}><b style={{ display: 'block', color: 'var(--xhs-text)', marginBottom: 4 }}>优先方向</b>{persona.contentDirections || '—'}</div>
              <div className={css.contextLine}><b style={{ display: 'block', color: 'var(--xhs-text)', marginBottom: 4 }}>钩子风格</b>{persona.hookStyles?.join('、') || '—'}</div>
              <div className={css.contextLine}><b style={{ display: 'block', color: 'var(--xhs-text)', marginBottom: 4 }}>默认话题</b>{persona.defaultHashtags?.join('、') || '—'}</div>
            </>
          )}
        </section>
      </div>

      {/* 下：选题池管理 */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <section className={css.panel}>
          <div className={css.panelTitle}><span>选题池</span></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input className={css.input} style={{ flex: 1 }} value={title} onChange={e => setTitle(e.target.value)} placeholder="单个选题" />
            <button className={css.primary} onClick={() => void add()}>添加</button>
          </div>
          <div className={css.field}>
            <label>批量导入（每行一个）</label>
            <textarea className={css.textarea} rows={3} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'通勤穿搭\n秋季护肤'} />
            <button className={css.button} onClick={() => void doImport()}>批量导入</button>
          </div>
        </section>
        <section className={css.panel}>
          <div className={css.panelTitle}><span>选题列表</span></div>
          <div className={css.field}>
            <select className={css.input} value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="">全部</option>
              <option value="open">open（可用）</option>
              <option value="used">used（已用）</option>
              <option value="retired">retired（弃用）</option>
            </select>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {visible.length === 0 && <div className={css.muted}>暂无选题。</div>}
            {visible.map(topic => (
              <div key={topic.id} className={css.dialogRow}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
                {topic.status === 'open' ? <span className={css.badgeGreen}>可用</span>
                  : topic.status === 'used' ? <span className={css.badgeGray}>已用</span>
                  : <span className={css.badgeGray}>弃用</span>}
                {topic.status === 'open' && <button className={css.ghostBtn} onClick={() => void retire(topic.id)}>弃用</button>}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Apify 数据源配置弹窗 */}
      {configOpen && (
        <div className={css.overlay} onClick={() => setConfigOpen(false)}>
          <div className={css.dialog} onClick={e => e.stopPropagation()}>
            <button className={css.dialogClose} onClick={() => setConfigOpen(false)} aria-label="关闭">×</button>
            <h3>配置 Apify 趋势数据源</h3>
            <div className={css.muted} style={{ marginBottom: 12, lineHeight: 1.7 }}>
              <b>如何获取：</b>
              <br />1. 打开 <a href="https://apify.com" target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>apify.com</a> 注册账号（免费额度可用）。
              <br />2. <b>API Token</b>：登录后进入 <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>Settings → Integrations</a>，复制 API token（形如 <code>apify_api_xxx</code>）。
              <br />3. <b>Actor ID</b>：在 <a href="https://apify.com/store?q=xiaohongshu" target="_blank" rel="noreferrer" style={{ color: 'var(--xhs-red)' }}>Apify Store</a> 搜索小红书相关 Actor（如 <code>kuaima/xiaohongshu-search</code>），Actor ID 即「用户名/Actor名」，取自 Actor 页面地址。
              <br />4. 保存配置后点「开始采集」。采集消耗 Apify 平台额度，请按需使用。
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
