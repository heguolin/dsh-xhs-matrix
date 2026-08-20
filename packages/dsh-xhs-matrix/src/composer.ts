/** 创作简报拼接：人设 + 爆款池参考 + 风格声明（纯函数）。 */

import type { Account, Persona, ViralItem } from './types.ts'

/** 默认爆款技巧框架：人设未另行规定自身文案结构时适用。 */
const DEFAULT_TECHNIQUES = [
  '钩子式开头：第一句制造好奇/共鸣/冲突，吸引点击',
  '悬念伏笔：正文埋 1-2 个悬念点引导读完，标题与开头呼应',
  '清单/对比结构：提升可读性',
  '结尾引导互动：提问 + 相关话题标签',
].join('；')

/**
 * 拼接创作简报 markdown。
 * @param account - 目标账号。
 * @param persona - 账号人设。
 * @param viralItems - 该账号爆款池参考条目（pending/accepted），作为素材来源。
 * @returns 简报文本。
 */
export function composeBrief(
  account: Account,
  persona: Persona,
  viralItems: ViralItem[],
): string {
  const viralLines = viralItems.length === 0
    ? ['（该账号暂无爆款池参考）']
    : viralItems.map(item => `- ${item.title}（推荐分 ${item.score}；理由：${item.reasons.join('、')}）${item.sourceUrl !== undefined ? `｜${item.sourceUrl}` : ''}`)
  return [
    `【账号】${account.name}（${persona.name}）`,
    `【人设】${persona.prompt}`,
    `【风格】严格按「${persona.name}」人设的风格撰写（${persona.prompt}）；默认爆款技巧框架（人设未另行规定时）：${DEFAULT_TECHNIQUES}。`,
    `【爆款池参考】`,
    ...viralLines,
    `【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`,
  ].join('\n')
}
