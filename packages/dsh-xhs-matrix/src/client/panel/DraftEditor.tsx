import { useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface DraftRow {
  id: string; accountId: string; copy: string; coverPrompt: string; tags?: string; status: string
}

/** 草稿编辑器：标题/正文/标签/封面提示词可直接修改，显式保存。 */
export function DraftEditor({ api, accountId, draft, onSaved }: { api: XhsApi; accountId: string; draft: DraftRow; onSaved: () => void }) {
  const [copy, setCopy] = useState(draft.copy)
  const [coverPrompt, setCoverPrompt] = useState(draft.coverPrompt)
  const [tags, setTags] = useState(draft.tags ?? '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const save = async (): Promise<void> => {
    try {
      await api.updateDraft(draft.id, { copy, coverPrompt, tags })
      setNotice('草稿已保存（仍为草稿状态，不会自动发布）。')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const rewriteTitle = async (): Promise<void> => {
    const firstLine = copy.split('\n')[0] ?? ''
    const rest = copy.split('\n').slice(1).join('\n')
    try {
      const result = await api.studioSend(accountId, `请只重写下面文案的第一行标题，使其更吸引人，不要改动正文，直接输出新标题：\n${copy}`, 'creative')
      const title = result.message.content.trim().split('\n')[0] ?? ''
      if (title !== '') setCopy(`${title}\n${rest}`)
      else setNotice('未获得新标题，请手动修改。')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const optimizeOpening = async (): Promise<void> => {
    const lines = copy.split('\n')
    const rest = lines.slice(1).join('\n')
    try {
      const result = await api.studioSend(accountId, `请只重写下面文案的第二行（正文开头），使其更有钩子，不要改动其他部分，直接输出新开头：\n${copy}`, 'creative')
      const opening = result.message.content.trim().split('\n')[0] ?? ''
      if (opening !== '') setCopy(`${lines[0] ?? ''}\n${opening}${rest !== '' ? `\n${rest}` : ''}`)
      else setNotice('未获得新开头，请手动修改。')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {notice !== '' && <div className={css.success}>{notice}</div>}
      <div className={css.field}>
        <label>标题（第一行）</label>
        <input className={css.input} value={copy.split('\n')[0] ?? ''} onChange={e => setCopy(`${e.target.value}\n${copy.split('\n').slice(1).join('\n')}`)} />
      </div>
      <div className={css.field}>
        <label>正文</label>
        <textarea className={css.textarea} rows={10} value={copy} onChange={e => setCopy(e.target.value)} />
      </div>
      <div className={css.field}>
        <label>话题标签</label>
        <input className={css.input} value={tags} onChange={e => setTags(e.target.value)} placeholder="#效率工具 #职场成长" />
      </div>
      <div className={css.field}>
        <label>封面提示词</label>
        <textarea className={css.textarea} rows={3} value={coverPrompt} onChange={e => setCoverPrompt(e.target.value)} />
      </div>
      <button className={css.button} onClick={() => void rewriteTitle()}>重写标题</button>
      <button className={css.button} style={{ marginLeft: 8 }} onClick={() => void optimizeOpening()}>优化开头</button>
      <button className={css.primary} style={{ marginLeft: 8 }} onClick={() => void save()}>保存草稿</button>
    </div>
  )
}
