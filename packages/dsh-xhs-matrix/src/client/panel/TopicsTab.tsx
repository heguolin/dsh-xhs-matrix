import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface TopicRow { id: string; title: string; status: string; createdAt: string }

/** 选题 Tab：状态过滤、手动添加、批量导入、标记弃用。 */
export function TopicsTab({ api }: { api: XhsApi }) {
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [filter, setFilter] = useState('')
  const [title, setTitle] = useState('')
  const [bulk, setBulk] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setTopics(await api.listTopics())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

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
      <div className={css.field}><label>单个选题</label><input className={css.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="通勤穿搭" /></div>
      <button className={css.button} onClick={() => void add()}>添加选题</button>
      <div className={css.field}><label>批量导入（每行一个）</label><textarea className={css.textarea} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'通勤穿搭\n秋季护肤'} /></div>
      <button className={css.button} onClick={() => void doImport()}>批量导入</button>
      <div className={css.field}>
        <label>状态过滤</label>
        <select className={css.input} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">全部</option>
          <option value="open">open（可用）</option>
          <option value="used">used（已用）</option>
          <option value="retired">retired（弃用）</option>
        </select>
      </div>
      {visible.map(topic => (
        <div key={topic.id} className={css.row}>
          <span>{topic.title}</span>
          <span className={css.muted}>{topic.status}</span>
          {topic.status === 'open' && <button className={css.button} onClick={() => void retire(topic.id)}>弃用</button>}
        </div>
      ))}
    </div>
  )
}
