import { useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface DraftRow {
  id: string; accountId: string; copy: string; coverPrompt: string; tags?: string; status: string
  evidence?: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }
}

/**
 * 草稿编辑器（设计稿 content/detail-surfaces.html）：
 * 左栏正文直接编辑 + 编辑动作（重写标题/优化开头），右栏本次生成依据；
 * 保存后仍保持「草稿」状态，不自动发布。
 */
export function DraftEditor({ api, accountId, draft, onSaved }: { api: XhsApi; accountId: string; draft: DraftRow; onSaved: () => void }) {
  const [copy, setCopy] = useState(draft.copy)
  const [coverPrompt, setCoverPrompt] = useState(draft.coverPrompt)
  const [tags, setTags] = useState(draft.tags ?? '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    try {
      await api.updateDraft(draft.id, { copy, coverPrompt, tags })
      setNotice('草稿已保存（仍为草稿状态，不会自动发布）。')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const runStudio = async (instruction: string, apply: (text: string) => void): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.studioSend(accountId, instruction, 'creative')
      const text = result.message.content.trim()
      if (text !== '') apply(text)
      else setNotice('未获得有效输出，请手动修改。')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const rewriteTitle = (): Promise<void> => runStudio(
    `请只重写下面文案的第一行标题，使其更吸引人，不要改动正文，直接输出新标题：\n${copy}`,
    text => {
      const rest = copy.split('\n').slice(1).join('\n')
      setCopy(`${text}\n${rest}`)
    },
  )

  const optimizeOpening = (): Promise<void> => runStudio(
    `请只重写下面文案的第二行（正文开头），使其更有钩子，不要改动其他部分，直接输出新开头：\n${copy}`,
    text => {
      const lines = copy.split('\n')
      const rest = lines.slice(2).join('\n')
      setCopy(`${lines[0] ?? ''}\n${text}${rest !== '' ? `\n${rest}` : ''}`)
    },
  )

  return (
    <div className={css.draftLayout}>
      {/* 左：可编辑正文 */}
      <section className={`${css.panel} ${css.draftEditor}`}>
        <div className={css.panelTitle}><span>可直接编辑</span></div>
        {error !== '' && <div className={css.danger}>{error}</div>}
        {notice !== '' && <div className={css.success}>{notice}</div>}
        <div className={css.field}>
          <label>标题（第一行）</label>
          <input className={css.input} value={copy.split('\n')[0] ?? ''} onChange={e => setCopy(`${e.target.value}\n${copy.split('\n').slice(1).join('\n')}`)} />
        </div>
        <div className={css.field}>
          <label>正文</label>
          <textarea className={css.textarea} rows={12} value={copy} onChange={e => setCopy(e.target.value)} />
        </div>
        <div className={css.field}>
          <label>话题标签</label>
          <input className={css.input} value={tags} onChange={e => setTags(e.target.value)} placeholder="#效率工具 #职场成长" />
        </div>
        <div className={css.field}>
          <label>封面提示词</label>
          <textarea className={css.textarea} rows={3} value={coverPrompt} onChange={e => setCoverPrompt(e.target.value)} />
        </div>
        <div className={css.editbar}>
          <button className={css.ghostBtn} onClick={() => void rewriteTitle()} disabled={busy}>重写标题</button>
          <button className={css.ghostBtn} onClick={() => void optimizeOpening()} disabled={busy}>优化开头</button>
          <button className={css.primary} onClick={() => void save()}>保存草稿</button>
        </div>
      </section>

      {/* 右：本次生成依据 */}
      <aside className={`${css.panel} ${css.sourcePanel}`}>
        <div className={css.panelTitle}><span>本次生成依据</span></div>
        {draft.evidence === undefined || draft.evidence.reasons.length === 0 ? (
          <div className={css.muted}>该草稿无生成依据记录（可能为手动创建）。</div>
        ) : (
          <>
            {draft.evidence.persona !== undefined && draft.evidence.persona !== '' && (
              <div className={css.source}><b>人设规则 <span className={css.weightBadge}>已使用</span></b>{draft.evidence.persona}</div>
            )}
            {draft.evidence.noteIds.length > 0 && (
              <div className={css.source}><b>本地笔记 <span className={css.weightBadge}>高权重参考</span></b>引用 {draft.evidence.noteIds.length} 篇已发布笔记</div>
            )}
            {draft.evidence.trendIds.length > 0 && (
              <div className={css.source}><b>已采纳爆款参考 <span className={css.weightBadge}>外部数据</span></b>引用 {draft.evidence.trendIds.length} 个爆款样本</div>
            )}
            <div className={css.source}><b>匹配理由</b>{draft.evidence.reasons.join('；')}</div>
            <div className={css.source}><b>编辑提醒</b>已生成原创草稿，不复制外部原文；保存后仍为草稿状态。</div>
          </>
        )}
      </aside>
    </div>
  )
}
