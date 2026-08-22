/** 创作简报拼接：人设 v4 字段 + 爆款池参考（按 weight DESC, score DESC 排序）+ 风格声明（纯函数）。 */

import type { Persona, ViralItem } from './types.ts'

/**
 * 拼接创作简报 markdown。
 * @param persona - 人设（唯一内容所有者；使用 v4 字段：writingStyles/endingHookConstraints/endingHookExamples/forbiddenWords）。
 * @param viralItems - 该人设共享爆款池参考（pending/accepted），作为素材来源；按 weight DESC、score DESC 排序。
 * @param accountName - 可选账号名（仅用于简报标题展示，不参与归属）。
 * @returns 简报文本。
 */
export function composeBrief(
  persona: Persona,
  viralItems: ViralItem[],
  accountName?: string,
): string {
  const ranked = [...viralItems].sort((a, b) => b.weight - a.weight || b.score - a.score)
  const viralLines = ranked.length === 0
    ? ['（该账号暂无爆款池参考）']
    : ranked.map(item => `- ${item.title}（权重 ${item.weight}；推荐分 ${item.score}；理由：${item.reasons.join('、')}）${item.sourceUrl !== undefined ? `｜${item.sourceUrl}` : ''}`)
  const writingStyles = persona.writingStyles !== undefined && persona.writingStyles.length > 0 ? persona.writingStyles.join('、') : '未设置'
  const endingHook = persona.endingHookConstraints ?? '未设置'
  const hookExamples = persona.endingHookExamples !== undefined && persona.endingHookExamples.length > 0 ? persona.endingHookExamples.join('；') : '未设置'
  const forbiddenWords = persona.forbiddenWords !== undefined && persona.forbiddenWords.length > 0 ? persona.forbiddenWords.join('、') : '无'
  return [
    `【账号】${accountName ?? '当前账号'}（${persona.name}）`,
    `【人设】${persona.prompt}`,
    `【写作风格】${writingStyles}`,
    `【结尾互动钩子】${endingHook}`,
    `【钩子最佳案例】${hookExamples}`,
    `【违禁词】${forbiddenWords}`,
    `【爆款池参考】`,
    ...viralLines,
    `【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`,
  ].join('\n')
}
