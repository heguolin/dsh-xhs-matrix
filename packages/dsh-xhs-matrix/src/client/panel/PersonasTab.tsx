import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface PersonaRow {
  id: string; name: string; prompt: string; toneTags?: string[]
  positioning?: string; audience?: string; expertise?: string; contentDirections?: string
  hookStyles?: string[]; bodyStructure?: string; endingStyle?: string
  forbiddenExpressions?: string; topicCriteria?: string; defaultHashtags?: string[]
  writingStyles?: string[]; endingHookConstraints?: string; endingHookExamples?: string[]; forbiddenWords?: string[]
}

interface PersonaUsage { accountCount: number; noteCount: number; viralCount: number }

/** 人设列表项：仅名称与摘要。 */
function personaSummary(p: PersonaRow): string {
  return p.positioning || p.expertise || p.contentDirections || p.prompt || ''
}

/**
 * 人设配置（设计稿 content/detail-surfaces.html + 人设资产 UI 参考稿）：
 * 左侧选择人设，右侧四区块——写作风格(01/VOICE) / 结尾互动钩子(02/ENDING)
 * / 人设违禁词(03/SAFETY) / 生效范围(04/SAVE)。写作风格可自由增删，
 * 旧 hookStyles 不再标为钩子；toneTags 仍是独立的口癖/语气标签。
 */
export function PersonasTab({ api }: { api: XhsApi }) {
  const [personas, setPersonas] = useState<PersonaRow[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; personaId: string }>>([])
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
  const [writingStyles, setWritingStyles] = useState<string[]>([])
  const [styleDraft, setStyleDraft] = useState('')
  const [bodyStructure, setBodyStructure] = useState('')
  const [endingHookConstraints, setEndingHookConstraints] = useState('')
  const [endingHookExamples, setEndingHookExamples] = useState<string[]>([])
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([])
  const [forbiddenDraft, setForbiddenDraft] = useState('')
  const [topicCriteria, setTopicCriteria] = useState('')
  const [defaultHashtags, setDefaultHashtags] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [personaList, accountList] = await Promise.all([api.listPersonas(), api.listAccounts()])
      setPersonas(personaList)
      setAccounts(accountList)
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
    setWritingStyles(persona.writingStyles ?? persona.hookStyles ?? [])
    setStyleDraft('')
    setBodyStructure(persona.bodyStructure ?? '')
    setEndingHookConstraints(persona.endingHookConstraints ?? persona.endingStyle ?? '')
    setEndingHookExamples(persona.endingHookExamples ?? [])
    setForbiddenWords(persona.forbiddenWords ?? [])
    setForbiddenDraft('')
    setTopicCriteria(persona.topicCriteria ?? '')
    setDefaultHashtags((persona.defaultHashtags ?? []).join(', '))
  }

  const startCreate = (): void => {
    setSelectedId(null)
    setCreating(true)
    setName(''); setPrompt(''); setToneTags('')
    setPositioning(''); setAudience(''); setExpertise(''); setContentDirections('')
    setWritingStyles([]); setStyleDraft(''); setBodyStructure('')
    setEndingHookConstraints(''); setEndingHookExamples([])
    setForbiddenWords([]); setForbiddenDraft('')
    setTopicCriteria(''); setDefaultHashtags('')
  }

  const splitList = (text: string): string[] | undefined => {
    const items = text.split(/[,，]/).map(t => t.trim()).filter(t => t !== '')
    return items.length > 0 ? items : undefined
  }

  /** 提交写作风格标签（回车）：去重，非空。 */
  const commitStyle = (): void => {
    const value = styleDraft.trim()
    if (value === '') return
    setWritingStyles(prev => prev.includes(value) ? prev : [...prev, value])
    setStyleDraft('')
  }

  const commitForbidden = (): void => {
    const value = forbiddenDraft.trim()
    if (value === '') return
    setForbiddenWords(prev => prev.includes(value) ? prev : [...prev, value])
    setForbiddenDraft('')
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
      // v4 单一事实源：只写 writingStyles/endingHookConstraints/endingHookExamples/forbiddenWords，
      // 不再向 hookStyles/endingStyle/forbiddenExpressions 写镜像（消除双源真相）。
      writingStyles: writingStyles.length > 0 ? writingStyles : undefined,
      bodyStructure: bodyStructure.trim() === '' ? undefined : bodyStructure.trim(),
      endingHookConstraints: endingHookConstraints.trim() === '' ? undefined : endingHookConstraints.trim(),
      endingHookExamples: endingHookExamples.length > 0 ? endingHookExamples : undefined,
      forbiddenWords: forbiddenWords.length > 0 ? forbiddenWords : undefined,
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
      // 领域不变量：人设仍有绑定账号或内容资产时禁止删除（409），展示依赖数量。
      const usage = (e as { payload?: { usage?: PersonaUsage }; body?: { usage?: PersonaUsage }; usage?: PersonaUsage }).payload?.usage
        ?? (e as { body?: { usage?: PersonaUsage } }).body?.usage
        ?? (e as { usage?: PersonaUsage }).usage
      if (usage !== undefined) {
        setError(`无法删除：该人设仍有 ${usage.accountCount} 个账号、${usage.noteCount} 篇笔记、${usage.viralCount} 条爆款，请先转移或处理。`)
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const boundAccounts = selectedId === null
    ? []
    : accounts.filter(a => a.personaId === selectedId)

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
          {/* 左：定位与提示词 */}
          <section className={css.panel}>
            <div className={css.panelTitle}><span>账号定位与提示词</span></div>
            <div className={css.field}><label>人设名</label><input className={css.input} value={name} onChange={e => setName(e.target.value)} /></div>
            <div className={css.field}><label>系统提示词 / 账号定位</label><textarea className={css.textarea} rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="你是一个真实、克制、擅长实测的效率工具创作者……" /></div>
            <div className={css.field}><label>一句话定位</label><input className={css.input} value={positioning} onChange={e => setPositioning(e.target.value)} placeholder="实用派测评 · 真实、不夸张" /></div>
            <div className={css.field}><label>目标受众</label><input className={css.input} value={audience} onChange={e => setAudience(e.target.value)} placeholder="25-35 岁职场人，想提升效率但反感夸大宣传" /></div>
            <div className={css.field}><label>领域 / 专业度</label><input className={css.input} value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="AI 工具、职场效率" /></div>
            <div className={css.field}><label>选题标准</label><textarea className={css.textarea} rows={2} value={topicCriteria} onChange={e => setTopicCriteria(e.target.value)} placeholder="必须有具体价值；优先真实体验、工具对比" /></div>
            <div className={css.field}><label>默认话题（逗号分隔）</label><input className={css.input} value={defaultHashtags} onChange={e => setDefaultHashtags(e.target.value)} placeholder="#效率工具, #职场成长" /></div>
            <div className={css.field}><label>口癖标签（逗号分隔，不属于写作风格）</label><input className={css.input} value={toneTags} onChange={e => setToneTags(e.target.value)} placeholder="口语化, 结尾提问" /></div>
          </section>

          {/* 右：写作风格 / 结尾互动钩子 / 人设违禁词 / 生效范围 */}
          <section className={css.panel}>
            <div className={css.panelTitle}><span>写作规则与人设安全</span></div>

            <div className={css.settingsGrid}>
              <div className={css.settingsCard}>
                <div className={css.sectionNo}>01 / VOICE</div>
                <div className={css.settingsTitle}>写作风格</div>
                <div className={css.field}>
                  <label>风格标签 · 可自由新增、编辑、删除</label>
                  <div className={css.tagEditor}>
                    {writingStyles.map(style => (
                      <button key={style} className={css.styleChip} onClick={() => setWritingStyles(prev => prev.filter(s => s !== style))}>{style} <span className={css.tagRemove}>×</span></button>
                    ))}
                    <input
                      className={css.tagEditorInput}
                      value={styleDraft}
                      onChange={e => setStyleDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitStyle() } }}
                      placeholder="输入自定义风格后回车"
                    />
                  </div>
                  <div className={css.helper}>这些是正文表达风格，不再称为“钩子”。预设只做建议，不限制输入。</div>
                </div>
                <div className={css.field}><label>正文结构</label><input className={css.input} value={bodyStructure} onChange={e => setBodyStructure(e.target.value)} placeholder="场景 → 问题 → 实测过程 → 结论 → 互动提问" /></div>
                <div className={css.field}><label>内容方向</label><textarea className={css.textarea} rows={2} value={contentDirections} onChange={e => setContentDirections(e.target.value)} placeholder="真实体验、工具对比、可复现方法" /></div>
              </div>

              <div className={css.settingsCard}>
                <div className={css.sectionNo}>02 / ENDING</div>
                <div className={css.settingsTitle}>结尾互动钩子</div>
                <div className={css.field}><label>约束词 · 自由文本</label><textarea className={css.textarea} rows={3} value={endingHookConstraints} onChange={e => setEndingHookConstraints(e.target.value)} placeholder="自然邀请读者分享经验或一起学习；不要强迫点赞关注，不制造焦虑。" /></div>
                <div className={css.field}>
                  <label>最佳案例 · 可增删</label>
                  {endingHookExamples.map((example, index) => (
                    <div key={index} className={css.example}>
                      <b>{String(index + 1).padStart(2, '0')}</b>
                      <input
                        className={css.input}
                        value={example}
                        onChange={e => setEndingHookExamples(prev => prev.map((item, i) => i === index ? e.target.value : item))}
                        placeholder="输入最佳案例"
                      />
                      <button className={css.ghostBtn} onClick={() => setEndingHookExamples(prev => prev.filter((_, i) => i !== index))}>删除案例</button>
                    </div>
                  ))}
                  <button className={css.ghostBtn} onClick={() => setEndingHookExamples(prev => [...prev, ''])}>＋ 添加案例</button>
                </div>
              </div>

              <div className={css.settingsCard}>
                <div className={css.sectionNo}>03 / SAFETY</div>
                <div className={css.settingsTitle}>人设违禁词</div>
                <div className={css.field}>
                  <label>每个人设独立配置</label>
                  <div className={css.tagEditor}>
                    {forbiddenWords.map(word => (
                      <button key={word} className={css.wordChip} onClick={() => setForbiddenWords(prev => prev.filter(w => w !== word))}>{word} <span className={css.tagRemove}>×</span></button>
                    ))}
                    <input
                      className={css.tagEditorInput}
                      value={forbiddenDraft}
                      onChange={e => setForbiddenDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitForbidden() } }}
                      placeholder="输入违禁词后回车"
                    />
                  </div>
                  <div className={css.helper}>参考素材命中：提示但允许保存。生成稿命中：阻止保存，并标出具体位置。</div>
                </div>
              </div>

              <div className={css.settingsCard}>
                <div className={css.sectionNo}>04 / SAVE</div>
                <div className={css.settingsTitle}>生效范围</div>
                <p className={css.muted} style={{ margin: '0 0 8px' }}>
                  绑定账号：{boundAccounts.length === 0 ? '（暂无）' : boundAccounts.map(a => a.name).join('、')}
                </p>
                <p className={css.helper}>账号换绑不会迁移历史资产；如需迁移，必须在知识库或爆款池显式操作。</p>
                <div className={css.rowActions}>
                  <button className={css.primary} onClick={() => void save()}>保存设置</button>
                  <button className={css.ghostBtn} onClick={() => { if (selectedId !== null) { const p = personas.find(x => x.id === selectedId); if (p !== undefined) load(p) } else startCreate() }}>放弃更改</button>
                </div>
                {!creating && selectedId !== null && <button className={css.dangerBtn} style={{ marginTop: 10 }} onClick={() => void remove()}>删除人设</button>}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
