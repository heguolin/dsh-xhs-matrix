import { useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

/** 后台数据导入：CSV / JSON 粘贴导入当前账号已发布笔记。 */
export function ImportDialog({ api, accountId, onDone }: { api: XhsApi; accountId: string; onDone: () => void }) {
  const [format, setFormat] = useState<'csv' | 'json'>('json')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const run = async (): Promise<void> => {
    if (content.trim() === '') { setError('请输入导入内容'); return }
    try {
      const count = await api.importPublishedNotes(accountId, format, content)
      setNotice(`已导入 ${count} 条已发布笔记。`)
      setContent('')
      setError('')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {notice !== '' && <div className={css.success}>{notice}</div>}
      <div className={css.field}>
        <label>格式</label>
        <select className={css.input} value={format} onChange={e => setFormat(e.target.value as 'csv' | 'json')}>
          <option value="json">JSON 数组</option>
          <option value="csv">CSV（title,copy,publishedAt,...）</option>
        </select>
      </div>
      <div className={css.field}>
        <label>内容</label>
        <textarea className={css.input} rows={6} value={content} onChange={e => setContent(e.target.value)} placeholder={format === 'json' ? '[{"title":"...","copy":"...","publishedAt":"2026-08-01"}]' : 'title,copy,publishedAt\n...'} />
      </div>
      <button className={css.primary} onClick={() => void run()}>导入</button>
    </div>
  )
}
