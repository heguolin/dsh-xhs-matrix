import { useCallback, useEffect, useRef, useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { DraftQualityReport } from '../../types.ts'
import css from './panel.module.css'

interface StudioMessageRow { id: string; role: string; content: string; receivedAt: string }
interface StudioEvidence { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }
interface StudioContext {
  personaName: string
  writingStyles: string[]
  forbiddenCount: number
  noteCount: number
  highCount: number
  viralCount: number
}
type Phase = 'planning' | 'drafting' | 'polishing' | 'checking'
interface LiveResult {
  phase: Phase
  plan: string
  final: string
  quality?: DraftQualityReport
  qualityAllowed: boolean
  hasDone: boolean
}

const PHASES: Array<{ key: Phase; label: string }> = [
  { key: 'planning', label: '规划' },
  { key: 'drafting', label: '起草' },
  { key: 'polishing', label: '去 AI 味' },
  { key: 'checking', label: '违禁词检查' },
]
const PHASE_ORDER: Record<Phase, number> = { planning: 0, drafting: 1, polishing: 2, checking: 3 }
/** 跟随底部阈值：scrollHeight - scrollTop - clientHeight <= 80 视为仍在底部附近。 */
const BOTTOM_THRESHOLD = 80

const EMPTY_CONTEXT: StudioContext = { personaName: '', writingStyles: [], forbiddenCount: 0, noteCount: 0, highCount: 0, viralCount: 0 }

/**
 * 专属创作台（设计稿 content/creative-studio.html + 人设资产 UI 参考稿 studio 视图）：
 * 四阶段进度、可折叠创作说明（可审计摘要）、流式最终稿、依据侧栏与质量门。
 * 最终稿只来自 content_delta；plan_delta 只进入创作说明；quality.allowed === false 禁用保存。
 * 智能跟随底部：首次进入/历史加载/跟随状态下滚到底；上滚超阈值暂停并显示「回到最新」。
 */
export function StudioTab({ api, accountId, personaId, onOpenDraft }: { api: XhsApi; accountId: string; personaId: string; onOpenDraft: () => void }) {
  const [messages, setMessages] = useState<StudioMessageRow[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'creative' | 'full'>('creative')
  const [error, setError] = useState('')
  const [retryable, setRetryable] = useState(false)
  const [sending, setSending] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')
  const [evidence, setEvidence] = useState<StudioEvidence | undefined>(undefined)
  const [coverPrompt, setCoverPrompt] = useState('')
  const [qualityAllowed, setQualityAllowed] = useState(true)
  const [live, setLive] = useState<LiveResult | null>(null)
  const [context, setContext] = useState<StudioContext>(EMPTY_CONTEXT)

  // 智能跟随底部：滚动容器 ref 与跟随状态。
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [follow, setFollow] = useState(true)
  const [backToLatest, setBackToLatest] = useState(false)

  const isNearBottom = useCallback((): boolean => {
    const el = scrollRef.current
    if (el === null) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD
  }, [])

  const scrollToBottom = useCallback((): void => {
    const el = scrollRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = useCallback((): void => {
    if (isNearBottom()) { setFollow(true); setBackToLatest(false) }
    else { setFollow(false); setBackToLatest(true) }
  }, [isNearBottom])

  const jumpToLatest = useCallback((): void => {
    setFollow(true)
    setBackToLatest(false)
    scrollToBottom()
  }, [scrollToBottom])

  // 只有处于「跟随」状态时，内容更新/首次加载才滚到底；绝不无条件每次 scrollIntoView。
  useEffect(() => {
    if (follow) scrollToBottom()
  }, [follow, scrollToBottom, messages, live])

  // 切换账号/人设时重置跟随状态：即使之前主动上滚暂停，新会话的历史加载后也应滚到底。
  useEffect(() => {
    setFollow(true)
    setBackToLatest(false)
  }, [accountId, personaId])

  const refresh = useCallback(async () => {
    if (accountId === '') { setMessages([]); setContext(EMPTY_CONTEXT); return }
    try {
      const [msgList, personaList, noteList, viralList] = await Promise.all([
        api.listStudioMessages(accountId),
        api.listPersonas(),
        personaId === '' ? Promise.resolve([]) : api.listNotes(personaId),
        personaId === '' ? Promise.resolve([]) : api.listViralItems(personaId, 'accepted'),
      ])
      setMessages(msgList)
      const persona = personaList.find(p => p.id === personaId)
      // v4 人设字段读取（writingStyles/forbiddenWords），旧 hookStyles/forbiddenExpressions 仅作回退。
      const writingStyles = persona?.writingStyles ?? persona?.hookStyles ?? []
      const forbiddenWords = persona?.forbiddenWords ?? (persona?.forbiddenExpressions !== undefined ? persona.forbiddenExpressions.split(/[、,，\s]+/).filter(w => w !== '') : [])
      setContext({
        personaName: persona?.name ?? '未分配',
        writingStyles,
        forbiddenCount: forbiddenWords.length,
        noteCount: noteList.length,
        highCount: noteList.filter(n => n.weight >= 3).length,
        viralCount: viralList.length,
      })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api, accountId, personaId])

  useEffect(() => { void refresh() }, [refresh])

  const send = async (promptOverride?: string): Promise<void> => {
    const prompt = (promptOverride ?? input).trim()
    if (prompt === '' || sending) return
    setInput('')
    setLastPrompt(prompt)
    setSending(true)
    setError('')
    setRetryable(false)
    setCoverPrompt('')
    setEvidence(undefined)
    setQualityAllowed(true)
    setLive({ phase: 'planning', plan: '', final: '', quality: undefined, qualityAllowed: true, hasDone: false })
    try {
      const summary = await api.studioSendStream(accountId, prompt, mode, event => {
        switch (event.type) {
          case 'content_delta': setLive(prev => prev === null ? prev : { ...prev, final: prev.final + event.delta }); break
          case 'plan_delta': setLive(prev => prev === null ? prev : { ...prev, plan: prev.plan + event.delta }); break
          case 'phase': setLive(prev => prev === null ? prev : { ...prev, phase: event.phase }); break
          case 'quality': setLive(prev => prev === null ? prev : { ...prev, quality: event.report, qualityAllowed: event.allowed }); setQualityAllowed(event.allowed); break
          case 'evidence': setEvidence(event.evidence); break
          case 'done': setLive(prev => prev === null ? prev : { ...prev, hasDone: true }); setCoverPrompt(event.coverPrompt ?? ''); setEvidence(event.evidence); break
          case 'error': setError(event.message); setRetryable(event.retryable); setLive(null); break
        }
      })
      setCoverPrompt(summary.coverPrompt ?? '')
      // done 已把最终稿落库：清空结构化块，历史气泡即最终稿，避免重复展示。
      setLive(null)
      await refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // 失败时恢复输入与封面，便于用户就地重试；live 结束本次流式态。
      // 用本次提交的 prompt 而非 lastPrompt：同一 send 闭包里 lastPrompt 仍是旧值（首次为 ''）。
      setCoverPrompt('')
      setInput(prompt)
      // 「流式响应未正常结束」是违禁词命中路径（无 done 且无 error）：服务端本就不落消息，
      // 保留最终稿与质检提示（保存仍由 qualityAllowed/currentRunIncomplete 门控），不覆盖为通用错误。
      // 其余失败（含模型 finish error）视为本次 run 失败：清除 live 结束流式态。
      if (message !== '流式响应未正常结束') {
        setLive(null)
        setError(message)
      }
    } finally {
      setSending(false)
    }
  }

  const retry = (): void => {
    if (lastPrompt !== '') { setInput(lastPrompt); void send(lastPrompt) }
  }

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  // 只有「完成态」才允许保存：进行中或中断（无 done）的当前 run 视为未完成，禁用保存。
  // saveCopy 取已落库的最近助手消息，而不是流式中的半截 final，避免把不完整内容入库。
  const currentRunIncomplete = live !== null && !live.hasDone
  const saveCopy = lastAssistant?.content ?? ''
  const saveDisabled = sending || !qualityAllowed || currentRunIncomplete || saveCopy === ''

  const saveLastAsDraft = async (): Promise<void> => {
    if (saveCopy === '') { setError('还没有生成结果可保存'); return }
    try {
      await api.studioSaveDraft(accountId, saveCopy, coverPrompt, evidence)
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
  const currentIndex = PHASE_ORDER[live === null ? 'planning' : live.phase]

  return (
    <div className={css.studioLayout}>
      {/* 对话区：四阶段进度 + 创作说明 + 流式最终稿 */}
      <div className={css.studioMain} style={{ minHeight: 0 }}>
        <header className={css.studioTop}>
          <div>
            <strong>专属创作台</strong>
            <div className={css.studioTopSub}>人设、知识库、已采纳爆款参考已隔离加载</div>
          </div>
          <span className={css.pill}>● 仅矩阵内容</span>
        </header>

        <div className={css.studioListArea}>
          {error !== '' && (
            <div className={css.danger}>
              <span>{error}</span>
              {retryable && <button className={css.retryBtn} onClick={retry}>重试</button>}
            </div>
          )}
          <div className={css.messages} ref={scrollRef} onScroll={handleScroll} data-testid="studio-list">
            {!hasConversation && (
              <div className={css.msg}>
                <div className={css.msgAvatar}>薯</div>
                <div className={css.msgBubble}>
                  你好，我是本账号的专属创作助手。我只处理当前账号的人设、已发布内容、已采纳爆款参考和草稿。
                  <div className={css.studioResult}>
                    <b>已加载创作上下文</b>
                    人设规则 · {context.noteCount} 篇本地知识库 · {context.highCount} 篇高权重样本 · {context.viralCount} 个已采纳爆款参考
                  </div>
                </div>
              </div>
            )}
            {messages.map(message => (
              <div key={message.id} className={message.role === 'user' ? css.msg + ' ' + css.me : css.msg}>
                <div className={css.msgAvatar}>{message.role === 'user' ? '我' : '薯'}</div>
                <div className={css.msgBubble}>{message.content}</div>
              </div>
            ))}

            {live !== null && (
              <div className={css.studioLive}>
                <div className={css.progressStrip}>
                  {PHASES.map(phase => {
                    const idx = PHASE_ORDER[phase.key]
                    const cls = idx < currentIndex ? css.phase + ' ' + css.phaseDone : idx === currentIndex ? css.phase + ' ' + css.phaseCurrent : css.phase
                    return <div key={phase.key} className={cls}>{phase.label}</div>
                  })}
                </div>

                {live.plan !== '' && (
                  <details className={css.planBox} open>
                    <summary>创作说明 · 可审计摘要</summary>
                    <div className={css.planBody} data-testid="studio-plan">{live.plan}</div>
                  </details>
                )}

                <article className={css.finalCopy}>
                  <span className={css.chipRed}>最终稿 · 流式输出</span>
                  <div className={css.finalBody} data-testid="studio-final">{live.final || '生成中…'}</div>
                </article>

                {live.quality !== undefined && (live.qualityAllowed
                  ? <div className={css.qualityPass}>✓ 去 AI 味审校完成 · 未命中违禁词 · 可以保存草稿</div>
                  : <div className={css.qualityFail}>⚠ 命中违禁词：{live.quality.forbiddenWordHits.map(h => h.word).join('、')} · 未通过质检，禁止保存</div>)}
              </div>
            )}
          </div>
          {backToLatest && <button className={css.backToLatest} onClick={jumpToLatest}>回到最新</button>}
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
        <div className={css.studioActions}>
          <div className={css.modeSwitch}>
            <button className={mode === 'creative' ? css.on : undefined} onClick={() => setMode('creative')}>创作模式</button>
            <button className={mode === 'full' ? css.on : undefined} onClick={() => setMode('full')}>完整知识库</button>
          </div>
          <span className={css.muted} style={{ flex: 1 }}>
            {mode === 'creative' ? '仅高权重样本进入上下文' : '全部已发布笔记进入上下文'}
          </span>
          <button className={css.studioSendGhost} onClick={() => void saveLastAsDraft()} disabled={saveDisabled}>
            保存为草稿
          </button>
          <button className={css.studioSendGhost} onClick={onOpenDraft}>打开草稿箱</button>
        </div>
      </div>

      {/* 右侧：本次创作依据侧栏 */}
      <aside className={css.context}>
        <h4>本次创作依据</h4>
        <div className={css.contextCard}>
          <h5>人设规则</h5>
          <div className={css.contextLine}>{context.personaName}</div>
          <div style={{ marginTop: 6 }}>
            {(context.writingStyles.length === 0 ? ['待配置'] : context.writingStyles).map(style => (
              <span key={style} className={css.tag}>{style}</span>
            ))}
          </div>
        </div>
        <div className={css.contextCard}>
          <h5>知识库</h5>
          <div className={css.contextLine}>{context.noteCount} 篇已发布 · {context.highCount} 篇高权重</div>
          <div className={css.contextLine}>权重 5 样本优先参考，权重 0 样本不进入推荐</div>
        </div>
        <div className={css.contextCard}>
          <h5>爆款参考</h5>
          <div className={css.contextLine}>{context.viralCount} 个已采纳爆款</div>
          <div className={css.contextLine}>仅使用公开数据，不复制原文</div>
        </div>
        <div className={css.contextCard}>
          <h5>安全规则</h5>
          <div className={css.contextLine}>{context.forbiddenCount} 个违禁词已检查</div>
        </div>
        {evidence !== undefined && evidence.reasons.length > 0 && (
          <div className={css.contextCard}>
            <h5>本次生成依据</h5>
            <div className={css.contextLine}>{evidence.reasons.join('；')}</div>
            {evidence.persona !== undefined && evidence.persona !== '' && <div className={css.contextLine}>人设：{evidence.persona}</div>}
          </div>
        )}
        <button className={css.studioSendGhost + ' ' + css.contextSave} onClick={() => void saveLastAsDraft()} disabled={saveDisabled}>
          保存为草稿
        </button>
      </aside>
    </div>
  )
}
