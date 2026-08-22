/** 界面文案：中文为主，英文键对齐（locale.register 需要 zh/en 两本词典）。 */

export const NS = 'dsh-xhs-matrix'

/** 中文字典。 */
export const zh = {
  'entry.label': '矩阵',
  'entry.tooltip': '小红书矩阵管理',
  'panel.title': '小红书矩阵',
  'tab.accounts': '账号',
  'tab.personas': '人设',
  'tab.drafts': '草稿',
  'panel.persona.writingStyle': '写作风格',
  'panel.persona.endingHook': '结尾互动钩子',
  'panel.persona.forbiddenWords': '人设违禁词',
  'panel.persona.scope': '生效范围',
  'panel.draft.personaSnapshot': '人设快照',
  'panel.draft.qualityReport': '质检报告',
} as const

/** 英文字典（键对齐）。 */
export const en: Record<keyof typeof zh, string> = {
  'entry.label': 'Matrix',
  'entry.tooltip': 'Xiaohongshu matrix',
  'panel.title': 'XHS Matrix',
  'tab.accounts': 'Accounts',
  'tab.personas': 'Personas',
  'tab.drafts': 'Drafts',
  'panel.persona.writingStyle': 'Writing style',
  'panel.persona.endingHook': 'Ending interaction hook',
  'panel.persona.forbiddenWords': 'Forbidden words',
  'panel.persona.scope': 'Effective scope',
  'panel.draft.personaSnapshot': 'Persona snapshot',
  'panel.draft.qualityReport': 'Quality report',
}

export type XhsKey = keyof typeof zh
