import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface StudioMessageRow { id: string; role: string; content: string; receivedAt: string }
interface StudioEvidence { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }

/** 矩阵专属创作台：账号级对话、模式切换、证据展示、保存草稿。 */
export function StudioTab({ api, accountId, onOpenDraft }: { api: XhsApi; accountId: string; onOpenDraft: (draftId?: string) => void }) {
  const [messages, setMessages] = useState<StudioMessageRow[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'creative' | 'full'>('creative')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [evidence, setEvidence] = useState<StudioEvidence | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      setMessages(await api.listStudioMessages(accountId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId])

  useEffect(() => { void refresh() }, [refresh])

  const send = async (): Promise<void> => {
    if (input.trim() === '') return
    setSending(true)
    try {
      const result = await api.studioSend(accountId, input.trim(), mode)
      setEvidence(result.evidence)
      setInput('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const saveLastAsDraft = async (): Promise<void> => {
    const last = [...messages].reverse().find(m => m.role === 'assistant')
    if (last === undefined) { setError('还没有生成结果可保存'); return }
    const topicId = window.prompt('请输入或粘贴一个选题标题，将先加入选题池再保存草稿：', '')
    if (topicId === null || topicId.trim() === '') return
    try {
      await api.addTopic(topicId.trim())
      const topics = await api.listTopics()
      const created = topics.filter(t => t.title === topicId.trim()).at(-1)
      if (created === undefined) { setError('选题创建失败'); return }
      await api.studioSaveDraft(accountId, created.id, last.content, '')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {accountId === '' && <div className={css.empty}>请先在「账号」Tab 创建账号，再从「总览」打开创作台。</div>}
      {error !== '' && <div className={css.danger}>{error}</div>}
      {messages.length === 0 && accountId !== '' && <div className={css.muted}>这是当前账号的专属创作台。输入指令后，仅注入该账号的人设、知识库与外部趋势。</div>}
      {messages.map(message => (
        <div key={message.id} className={css.card} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <span className={message.role === 'user' ? css.badge : css.badgeGreen}>{message.role === 'user' ? '我' : '创作助手'}</span>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, width: '100%' }}>{message.content}</div>
        </div>
      ))}
      {evidence !== undefined && evidence.reasons.length > 0 && (
        <div className={css.field}>
          <label>本次生成依据</label>
          <div className={css.muted}>{evidence.reasons.join('；')}{evidence.persona !== undefined && evidence.persona !== '' ? `（人设：${evidence.persona}）` : ''}</div>
        </div>
      )}
      <div className={css.tabs} style={{ marginTop: 12 }}>
        <button className={mode === 'creative' ? css.tabActive : css.tab} onClick={() => setMode('creative')}>创作模式</button>
        <button className={mode === 'full' ? css.tabActive : css.tab} onClick={() => setMode('full')}>完整知识库</button>
      </div>
      <div className={css.field}>
        <textarea className={css.textarea} rows={3} value={input} onChange={e => setInput(e.target.value)} placeholder="输入创作指令：写一篇、分析选题、改开头……" />
      </div>
      <button className={css.primary} onClick={() => void send()} disabled={sending}>{sending ? '生成中…' : '发送'}</button>
      <button className={css.button} style={{ marginLeft: 8 }} onClick={() => void saveLastAsDraft()}>保存最近结果为草稿</button>
      <button className={css.button} style={{ marginLeft: 8 }} onClick={() => onOpenDraft()}>打开草稿箱</button>
    </div>
  )
}
