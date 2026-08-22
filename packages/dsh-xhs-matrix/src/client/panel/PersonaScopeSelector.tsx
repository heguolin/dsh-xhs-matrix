// 人设作用域选择器（设计稿 content/hybrid-layout.html 顶部「当前资产人设」切换）：
// 知识库/爆款池页顶部展示当前作用域人设，允许在该账号当前人设之外临时切换。
// 作用域由父级 XhsPanel 统一持有（assetPersonaId），本组件只负责展示与提交切换。

import { useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface PersonaOption { id: string; name: string }

/** 人设作用域选择器：展示当前作用域人设名称，下拉可临时切换。 */
export function PersonaScopeSelector({ api, value, onChange }: {
  api: XhsApi
  value: string
  onChange: (personaId: string) => void
}) {
  const [personas, setPersonas] = useState<PersonaOption[]>([])

  useEffect(() => {
    api.listPersonas()
      .then(list => setPersonas(list.map(p => ({ id: p.id, name: p.name }))))
      .catch(() => setPersonas([]))
  }, [api])

  const currentName = value === ''
    ? '未分配'
    : personas.find(p => p.id === value)?.name ?? '未知人设'

  return (
    <div className={css.filterRow} style={{ marginBottom: 10 }}>
      <span className={css.muted} style={{ alignSelf: 'center' }}>
        当前资产人设：
      </span>
      <select
        className={css.input}
        style={{ width: 220 }}
        aria-label="切换人设"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">（未分配）</option>
        {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <span className={css.muted} style={{ alignSelf: 'center' }}>
        {currentName === '未分配' ? '该账号未绑定人设' : '作用域：' + currentName}
      </span>
    </div>
  )
}
