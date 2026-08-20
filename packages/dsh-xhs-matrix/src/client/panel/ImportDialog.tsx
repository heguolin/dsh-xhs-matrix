import { useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

/** 后台数据导入简化版：标题（每行一个）+ 正文（与标题行号对应），构造 JSON 数组导入当前账号已发布笔记。 */
export function ImportDialog({ api, accountId, onDone }: { api: XhsApi; accountId: string; onDone: () => void }) {
  const [titles, setTitles] = useState('')
  const [copies, setCopies] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const run = async (): Promise<void> => {
    // 保留原始行号：仅统计 trim 后非空的标题行。
    const titleRows = titles.split('\n')
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(row => row.line !== '')
    if (titleRows.length === 0) { setError('请输入至少一个标题'); return }
    const copyLines = copies.split('\n')
    // 标题与正文按原始行号对应，任一标题行缺正文（越界视为空）则整批拒绝并提示原始行号。
    const missing = titleRows.find(row => (copyLines[row.index] ?? '').trim() === '')
    if (missing !== undefined) { setError(`第 ${missing.index + 1} 行缺少正文，标题与正文都必填且按行对应`); return }
    const records = titleRows.map(row => ({ title: row.line, copy: copyLines[row.index] ?? '' }))
    try {
      const count = await api.importPublishedNotes(accountId, 'json', JSON.stringify(records))
      setNotice(`已导入 ${count} 条已发布笔记。`)
      setTitles('')
      setCopies('')
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
        <label>标题（每行一个，必填）</label>
        <textarea className={css.input} rows={5} value={titles} onChange={e => setTitles(e.target.value)} placeholder={'标题 1\n标题 2\n标题 3'} />
      </div>
      <div className={css.field}>
        <label>正文（按行对应，必填）</label>
        <textarea className={css.input} rows={6} value={copies} onChange={e => setCopies(e.target.value)} placeholder={'与左侧标题逐行对应的正文内容\n（标题与正文都必填，按行对应）'} />
      </div>
      <button className={css.primary} onClick={() => void run()}>导入</button>
    </div>
  )
}
