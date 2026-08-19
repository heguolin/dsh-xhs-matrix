import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface PersonaRow { id: string; name: string; prompt: string; toneTags?: string[] }

/** 人设 Tab：增删改（名称 + prompt 文本域 + 口癖标签）。 */
export function PersonasTab({ api }: { api: XhsApi }) {
  const [personas, setPersonas] = useState<PersonaRow[]>([])
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [toneTags, setToneTags] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setPersonas(await api.listPersonas())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const create = async (): Promise<void> => {
    try {
      const tags = toneTags.split(/[,，]/).map(t => t.trim()).filter(t => t !== '')
      await api.createPersona({ name, prompt, toneTags: tags.length > 0 ? tags : undefined })
      setName('')
      setPrompt('')
      setToneTags('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      await api.deletePersona(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      <div className={css.field}><label>人设名</label><input className={css.input} value={name} onChange={e => setName(e.target.value)} placeholder="干货风" /></div>
      <div className={css.field}><label>人设提示词</label><textarea className={css.textarea} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="专业、数据支撑、不废话" /></div>
      <div className={css.field}><label>口癖标签（逗号分隔）</label><input className={css.input} value={toneTags} onChange={e => setToneTags(e.target.value)} placeholder="口语化, 结尾提问" /></div>
      <button className={css.primary} onClick={() => void create()}>添加人设</button>
      {personas.map(persona => (
        <div key={persona.id} className={css.card}>
          <span style={{ fontWeight: 600 }}>{persona.name}</span>
          <span className={css.muted} style={{ flex: 1 }}>{persona.prompt}</span>
          <span className={css.badge}>{(persona.toneTags ?? []).join('、') || '—'}</span>
          <button className={`${css.button} ${css.danger}`} onClick={() => void remove(persona.id)}>删除</button>
        </div>
      ))}
    </div>
  )
}
