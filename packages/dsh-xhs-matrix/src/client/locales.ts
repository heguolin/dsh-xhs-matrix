/** 界面文案：中文为主，英文键对齐（locale.register 需要 zh/en 两本词典）。 */

export const NS = 'dsh-xhs-matrix'

/** 中文字典。 */
export const zh = {
  'entry.label': '矩阵',
  'entry.tooltip': '小红书矩阵管理',
  'panel.title': '小红书矩阵',
  'tab.accounts': '账号',
  'tab.personas': '人设',
  'tab.topics': '选题',
  'tab.negatives': '黑名单',
  'tab.drafts': '草稿',
} as const

/** 英文字典（键对齐）。 */
export const en: Record<keyof typeof zh, string> = {
  'entry.label': 'Matrix',
  'entry.tooltip': 'Xiaohongshu matrix',
  'panel.title': 'XHS Matrix',
  'tab.accounts': 'Accounts',
  'tab.personas': 'Personas',
  'tab.topics': 'Topics',
  'tab.negatives': 'Negatives',
  'tab.drafts': 'Drafts',
}

export type XhsKey = keyof typeof zh
