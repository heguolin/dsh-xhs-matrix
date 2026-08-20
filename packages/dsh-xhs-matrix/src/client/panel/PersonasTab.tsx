import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface PersonaRow {
  id: string; name: string; prompt: string; toneTags?: string[]
  positioning?: string; audience?: string; expertise?: string; contentDirections?: string
  hookStyles?: string[]; bodyStructure?: string; endingStyle?: string
  forbiddenExpressions?: string; topicCriteria?: string; defaultHashtags?: string[]
}

const HOOK_OPTIONS = ['反常识', '痛点切入', '真实对比', '教程结构', '经验清单', '互动提问']

/** 人设列表项：仅名称与摘要。 */
function personaSummary(p: PersonaRow): string {
  return p.positioning || p.expertise || p.contentDirections || p.prompt || ''
}

/**
 * 人设配置（设计稿 content/detail-surfaces.html）：
 * 左侧选择人设，右侧结构化两栏编辑——定位/受众/禁用表达 + 写作风格/钩子/结构/标准。
 */
export function PersonasTab({ api }: { api: XhsApi }) {
  const [personas, setPersonas] = useState<PersonaRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 编辑态字段
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [toneTags, setToneTags] = useState('')
  const [positioning, setPositioning] = useState('')
  const [audience, setAudience] = useState('')
  const [expertise, setExpertise] = useState('')
  const [contentDirections, setContentDirections] = useState('')
  const [hookStyles, setHookStyles] = useState<string[]>([])
  const [bodyStructure, setBodyStructure] = useState('')
  const [endingStyle, setEndingStyle] = useState('')
  const [forbiddenExpressions, setForbiddenExpressions] = useState('')
  const [topicCriteria, setTopicCriteria] = useState('')
  const [defaultHashtags, setDefaultHashtags] = useState('')

  const refresh = useCallback(async () => {
    try {
      setPersonas(await api.listPersonas())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const load = (persona: PersonaRow): void => {
    setSelectedId(persona.id)
    setCreating(false)
    setName(persona.name)
    setPrompt(persona.prompt)
    setToneTags((persona.toneTags ?? []).join(', '))
    setPositioning(persona.positioning ?? '')
    setAudience(persona.audience ?? '')
    setExpertise(persona.expertise ?? '')
    setContentDirections(persona.contentDirections ?? '')
    setHookStyles(persona.hookStyles ?? [])
    setBodyStructure(persona.bodyStructure ?? '')
    setEndingStyle(persona.endingStyle ?? '')
    setForbiddenExpressions(persona.forbiddenExpressions ?? '')
    setTopicCriteria(persona.topicCriteria ?? '')
    setDefaultHashtags((persona.defaultHashtags ?? []).join(', '))
  }

  const startCreate = (): void => {
    setSelectedId(null)
    setCreating(true)
    setName(''); setPrompt(''); setToneTags('')
    setPositioning(''); setAudience(''); setExpertise(''); setContentDirections('')
    setHookStyles([]); setBodyStructure(''); setEndingStyle('')
    setForbiddenExpressions(''); setTopicCriteria(''); setDefaultHashtags('')
  }

  const splitList = (text: string): string[] | undefined => {
    const items = text.split(/[,，]/).map(t => t.trim()).filter(t => t !== '')
    return items.length > 0 ? items : undefined
  }

  const save = async (): Promise<void> => {
    if (name.trim() === '') { setError('请输入人设名'); return }
    const payload = {
      name: name.trim(),
      prompt,
      toneTags: splitList(toneTags),
      positioning: positioning.trim() === '' ? undefined : positioning.trim(),
      audience: audience.trim() === '' ? undefined : audience.trim(),
      expertise: expertise.trim() === '' ? undefined : expertise.trim(),
      contentDirections: contentDirections.trim() === '' ? undefined : contentDirections.trim(),
      hookStyles: hookStyles.length > 0 ? hookStyles : undefined,
      bodyStructure: bodyStructure.trim() === '' ? undefined : bodyStructure.trim(),
      endingStyle: endingStyle.trim() === '' ? undefined : endingStyle.trim(),
      forbiddenExpressions: forbiddenExpressions.trim() === '' ? undefined : forbiddenExpressions.trim(),
      topicCriteria: topicCriteria.trim() === '' ? undefined : topicCriteria.trim(),
      defaultHashtags: splitList(defaultHashtags),
    }
    try {
      if (creating) {
        const { id } = await api.createPersona(payload)
        setSelectedId(id)
        setCreating(false)
        setNotice(`人设「${payload.name}」已创建。`)
      } else if (selectedId !== null) {
        await api.updatePersona(selectedId, payload)
        setNotice(`人设「${payload.name}」已保存。`)
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (): Promise<void> => {
    if (selectedId === null) return
    if (!window.confirm('确定删除该人设？已分配该人设的账号将变为未分配。')) return
    try {
      await api.deletePersona(selectedId)
      setSelectedId(null)
      setNotice('人设已删除。')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggleHook = (style: string): void => {
    setHookStyles(prev => prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style])
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {notice !== '' && <div className={css.success}>{notice}</div>}

      <div className={css.personaList}>
        {personas.map(persona => (
          <button
            key={persona.id}
            className={selectedId === persona.id && !creating ? `${css.personaItem} ${css.active}` : css.personaItem}
            onClick={() => load(persona)}
          >
            <span className={css.personaAvatar} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={css.personaName}>{persona.name}</div>
              <div className={css.personaDesc}>{personaSummary(persona) || '未填写定位'}</div>
            </div>
            {(persona.toneTags ?? []).length > 0 && <span className={css.badge}>{(persona.toneTags ?? []).join('、')}</span>}
          </button>
        ))}
        <button className={css.accountAdd} onClick={startCreate}>＋ 新建人设</button>
      </div>

      {(selectedId !== null || creating) && (
        <div className={css.personaLayout}>
          {/* 左：定位与系统提示词 */}
          <section className={css.panel}>
            <div className={css.panelTitle}><span>账号定位与提示词</span></div>
            <div className={css.field}><label>人设名</label><input className={css.input} value={name} onChange={e => setName(e.target.value)} /></div>
            <div className={css.field}><label>系统提示词 / 账号定位</label><textarea className={css.textarea} rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="你是一个真实、克制、擅长实测的效率工具创作者……" /></div>
            <div className={css.field}><label>一句话定位</label><input className={css.input} value={positioning} onChange={e => setPositioning(e.target.value)} placeholder="实用派测评 · 真实、不夸张" /></div>
            <div className={css.field}><label>目标受众</label><input className={css.input} value={audience} onChange={e => setAudience(e.target.value)} placeholder="25-35 岁职场人，想提升效率但反感夸大宣传" /></div>
            <div className={css.field}><label>领域 / 专业度</label><input className={css.input} value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="AI 工具、职场效率" /></div>
            <div className={css.field}><label>禁用表达（逗号分隔）</label><input className={css.input} value={forbiddenExpressions} onChange={e => setForbiddenExpressions(e.target.value)} placeholder="绝对化承诺, 纯鸡汤" /></div>
          </section>

          {/* 右：写作风格 */}
          <section className={css.panel}>
            <div className={css.panelTitle}><span>写作风格</span></div>
            <div className={css.field}><label>钩子风格 · 可多选</label>
              <div className={css.chips}>
                {HOOK_OPTIONS.map(style => (
                  <button key={style} className={hookStyles.includes(style) ? `${css.tag} ${css.on}` : css.tag} onClick={() => toggleHook(style)}>{style}</button>
                ))}
              </div>
            </div>
            <div className={css.field}><label>正文结构</label><input className={css.input} value={bodyStructure} onChange={e => setBodyStructure(e.target.value)} placeholder="场景 → 问题 → 实测过程 → 结论 → 互动提问" /></div>
            <div className={css.field}><label>结尾风格</label><input className={css.input} value={endingStyle} onChange={e => setEndingStyle(e.target.value)} placeholder="总结价值 + 互动提问" /></div>
            <div className={css.field}><label>内容方向</label><textarea className={css.textarea} rows={2} value={contentDirections} onChange={e => setContentDirections(e.target.value)} placeholder="真实体验、工具对比、可复现方法" /></div>
            <div className={css.field}><label>选题标准</label><textarea className={css.textarea} rows={2} value={topicCriteria} onChange={e => setTopicCriteria(e.target.value)} placeholder="必须有具体价值；优先真实体验、工具对比" /></div>
            <div className={css.field}><label>默认话题（逗号分隔）</label><input className={css.input} value={defaultHashtags} onChange={e => setDefaultHashtags(e.target.value)} placeholder="#效率工具, #职场成长" /></div>
            <div className={css.field}><label>口癖标签（逗号分隔）</label><input className={css.input} value={toneTags} onChange={e => setToneTags(e.target.value)} placeholder="口语化, 结尾提问" /></div>
            <div className={css.rowActions}>
              <button className={css.primary} onClick={() => void save()}>保存设置</button>
              {!creating && selectedId !== null && <button className={css.dangerBtn} onClick={() => void remove()}>删除人设</button>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
