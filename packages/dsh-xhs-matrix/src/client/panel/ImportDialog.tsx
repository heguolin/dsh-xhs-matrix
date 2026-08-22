import { useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

/**
 * 已在盘知识库导入（v4 人设资产视图）：导入目标为当前人设作用域。
 * - 「归属人设」只读展示当前选中人设名（作用域由父级 XhsPanel/KnowledgeTab 持有）。
 * - 标题（每行一个）+ 正文（与标题行号对应）构造 JSON 数组，经账号导入路由以 personaId 为**目标**落库。
 * - personaId 为当前资产作用域人设（可被临时切换）；accountId 仅作来源账号快照，二者角色不同。
 */
export function ImportDialog({ api, accountId, personaId, onDone }: { api: XhsApi; accountId: string; personaId: string; onDone: () => void }) {
  const [personaName, setPersonaName] = useState('')
  const [titles, setTitles] = useState('')
  const [copies, setCopies] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.listPersonas()
      .then(list => setPersonaName(list.find(p => p.id === personaId)?.name ?? personaId))
      .catch(() => setPersonaName(personaId))
  }, [api, personaId])

  const run = async (): Promise<void> => {
    // 保留原始行号：仅统计 trim 后非空的标题行。
    const titleRows = titles.split('\n')
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(row => row.line !== '')
    if (titleRows.length === 0) { setError('请输入至少一个标题'); return }
    const copyLines = copies.split('\n')
    const missing = titleRows.find(row => (copyLines[row.index] ?? '').trim() === '')
    if (missing !== undefined) { setError(`第 ${missing.index + 1} 行缺少正文，标题与正文都必填且按行对应`); return }
    const records = titleRows.map(row => ({ title: row.line, copy: copyLines[row.index] ?? '' }))
    try {
      const count = await api.importPublishedNotes(accountId, 'json', JSON.stringify(records), personaId)
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
        <label>归属人设</label>
        <input className={css.input} value={personaName} readOnly />
      </div>
      <div className={css.field}>
        <label>标题（每行一个，必填）</label>
        <textarea className={css.input} rows={5} value={titles} onChange={e => setTitles(e.target.value)} placeholder={'标题 1\n标题 2\n标题 3'} />
      </div>
      <div className={css.field}>
        <label>正文（按行对应，必填）</label>
        <textarea className={css.input} rows={6} value={copies} onChange={e => setCopies(e.target.value)} placeholder={'与左侧标题逐行对应的正文内容\n（标题与正文都必填，按行对应）'} />
      </div>
      <div className={css.rowActions}>
        <button className={css.primary} onClick={() => void run()}>导入</button>
      </div>
    </div>
  )
}