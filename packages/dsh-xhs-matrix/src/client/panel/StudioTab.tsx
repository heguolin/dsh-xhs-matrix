import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface StudioMessageRow { id: string; role: string; content: string; receivedAt: string }
interface StudioEvidence { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }

/**
 * 专属创作台（设计稿 content/creative-studio.html）：
 * 对话区最大化 + 右侧本次创作上下文（人设/知识库/已采纳爆款参考/指标快照），
 * 上下文始终可见，生成结果通过人工操作保存为草稿。
 */
export function StudioTab({ api, accountId, onOpenDraft }: { api: XhsApi; accountId: string; onOpenDraft: () => void }) {
  const [messages, setMessages] = useState<StudioMessageRow[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'creative' | 'full'>('creative')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [evidence, setEvidence] = useState<StudioEvidence | undefined>(undefined)
  // 流式生成中的临时助手文本与最近一次封面提示词。
  const [streamText, setStreamText] = useState('')
  const [coverPrompt, setCoverPrompt] = useState('')
  // 创作上下文统计
  const [context, setContext] = useState<{ personaName: string; hookStyles: string[]; noteCount: number; highCount: number; viralCount: number; metricCount: number }>({ personaName: '', hookStyles: [], noteCount: 0, highCount: 0, viralCount: 0, metricCount: 0 })

  const refresh = useCallback(async () => {
    if (accountId === '') { setMessages([]); setContext({ personaName: '', hookStyles: [], noteCount: 0, highCount: 0, viralCount: 0, metricCount: 0 }); return }
    try {
      const [msgList, accountList, personaList, noteList, viralList, metricList] = await Promise.all([
        api.listStudioMessages(accountId),
        api.listAccounts(),
        api.listPersonas(),
        api.listNotes(accountId),
        api.listViralItems(accountId, 'accepted'),
        api.listMetrics(accountId),
      ])
      setMessages(msgList)
      const persona = personaList.find(p => p.id === accountList.find(a => a.id === accountId)?.personaId)
      setContext({
        personaName: persona?.name ?? '未分配',
        hookStyles: persona?.hookStyles ?? [],
        noteCount: noteList.length,
        highCount: noteList.filter(n => n.weight >= 3).length,
        viralCount: viralList.length,
        metricCount: metricList.length,
      })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId])

  useEffect(() => { void refresh() }, [refresh])

  const send = async (): Promise<void> => {
    if (input.trim() === '' || sending) return
    const prompt = input.trim()
    setInput('')
    setSending(true)
    setStreamText('')
    setEvidence(undefined)
    setCoverPrompt('')
    setError('')
    try {
      const summary = await api.studioSendStream(accountId, prompt, mode, delta => {
        setStreamText(prev => prev + delta)
      })
      setEvidence(summary.evidence)
      setCoverPrompt(summary.coverPrompt ?? '')
      setStreamText('')
      await refresh()
    } catch (e) {
      setStreamText('')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const saveLastAsDraft = async (): Promise<void> => {
    const last = [...messages].reverse().find(m => m.role === 'assistant')
    if (last === undefined) { setError('还没有生成结果可保存'); return }
    try {
      // 记录生成依据：参考的人设/高权重笔记/已采纳爆款（工作台内生成）。
      await api.studioSaveDraft(accountId, last.content, coverPrompt, evidence)
      setError('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (accountId === '') {
    return <div className={css.empty}>请先在左侧「我的账号」选择账号，再进入创作台。</div>
  }

  const hasConversation = messages.length > 0

  return (
    <div className={css.studioLayout}>
      {/* 对话区 */}
      <div className={css.studioMain}>
        <header className={css.studioTop}>
          <div>
            <strong>专属创作台</strong>
            <div className={css.studioTopSub}>人设、知识库、已采纳爆款参考已隔离加载</div>
          </div>
          <span className={css.pill}>● 仅矩阵内容</span>
        </header>

        <div className={css.messages}>
          {error !== '' && <div className={css.danger}>{error}</div>}
          {!hasConversation && (
            <div className={css.msg}>
              <div className={css.msgAvatar}>薯</div>
              <div className={css.msgBubble}>
                你好，我是本账号的专属创作助手。我只处理当前账号的人设、已发布内容、已采纳爆款参考和草稿。
                <div className={css.studioResult}>
                  <b>已加载创作上下文</b>
                  人设规则 · {context.noteCount} 篇本地知识库 · {context.highCount} 篇高权重样本 · {context.viralCount} 个已采纳爆款参考 · {context.metricCount} 条指标历史快照
                </div>
              </div>
            </div>
          )}
          {messages.map(message => (
            <div key={message.id} className={message.role === 'user' ? `${css.msg} ${css.me}` : css.msg}>
              <div className={css.msgAvatar}>{message.role === 'user' ? '我' : '薯'}</div>
              <div className={css.msgBubble}>{message.content}</div>
            </div>
          ))}
          {sending && (
            <div className={css.msg}>
              <div className={css.msgAvatar}>薯</div>
              <div className={css.msgBubble}>
                {streamText === '' ? '生成中…' : streamText}
                {streamText !== '' && <span className={css.muted}> ▍</span>}
              </div>
            </div>
          )}
          {!sending && coverPrompt !== '' && (
            <div className={css.msg}>
              <div className={css.msgAvatar}>薯</div>
              <div className={css.msgBubble}>
                <div className={css.studioResult}>
                  <b>封面提示词</b>
                  {coverPrompt}
                </div>
              </div>
            </div>
          )}
          {evidence !== undefined && evidence.reasons.length > 0 && (
            <div className={css.msg}>
              <div className={css.msgAvatar}>薯</div>
              <div className={css.msgBubble}>
                <div className={css.studioResult}>
                  <b>本次生成依据</b>
                  {evidence.reasons.join('；')}
                  {evidence.persona !== undefined && evidence.persona !== '' && `（人设：${evidence.persona}）`}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={css.studioComposer}>
          <textarea
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            placeholder="输入创作指令，例如：找 3 个今天适合发布的选题，并把第 1 个写成可发布草稿……"
          />
          <button className={css.studioSend} onClick={() => void send()} disabled={sending || input.trim() === ''}>
            {sending ? '生成中…' : '发送 ↑'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px', alignItems: 'center' }}>
          <div className={css.modeSwitch}>
            <button className={mode === 'creative' ? css.on : undefined} onClick={() => setMode('creative')}>创作模式</button>
            <button className={mode === 'full' ? css.on : undefined} onClick={() => setMode('full')}>完整知识库</button>
          </div>
          <span className={css.muted} style={{ flex: 1 }}>
            {mode === 'creative' ? '仅高权重样本进入上下文' : '全部已发布笔记进入上下文'}
          </span>
          <button className={css.studioSendGhost} onClick={() => void saveLastAsDraft()} disabled={sending}>
            保存最近结果为草稿{coverPrompt !== '' ? '（含封面提示词）' : ''}
          </button>
          <button className={css.studioSendGhost} onClick={onOpenDraft}>打开草稿箱</button>
        </div>
      </div>

      {/* 右侧：本次创作上下文 */}
      <aside className={css.context}>
        <h4>本次创作上下文</h4>
        <div className={css.contextCard}>
          <h5>账号人设</h5>
          <div className={css.contextLine}>{context.personaName}</div>
          <div style={{ marginTop: 6 }}>
            {(context.hookStyles.length === 0 ? ['待配置'] : context.hookStyles).map(style => (
              <span key={style} className={css.tag}>{style}</span>
            ))}
          </div>
        </div>
        <div className={css.contextCard}>
          <h5>本地知识库</h5>
          <div className={css.contextLine}>{context.noteCount} 篇已发布 · {context.highCount} 篇高权重</div>
          <div className={css.meter}><i /></div>
          <div className={css.contextLine}>权重 5 样本优先参考，权重 0 样本不进入推荐</div>
        </div>
        <div className={css.contextCard}>
          <h5>已采纳爆款参考</h5>
          <div className={css.contextLine}>{context.viralCount} 个已采纳爆款</div>
          <div className={css.contextLine}>仅使用公开数据，不复制原文</div>
        </div>
        <div className={css.contextCard}>
          <h5>指标历史快照</h5>
          <div className={css.contextLine}>{context.metricCount} 条采集记录</div>
          <div className={css.contextLine}>采集任务只更新数据，不自动生成</div>
        </div>
      </aside>
    </div>
  )
}
