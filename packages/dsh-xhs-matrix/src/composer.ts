/** 创作简报拼接：人设 + 选题 + 风格声明（纯函数）。 */

import type { Account, Persona, Topic } from './types.ts'

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
 * @param topic - 选中选题。
 * @returns 简报文本。
 */
export function composeBrief(
  account: Account,
  persona: Persona,
  topic: Topic,
): string {
  return [
    `【账号】${account.name}（${persona.name}）`,
    `【人设】${persona.prompt}`,
    `【风格】严格按「${persona.name}」人设的风格撰写（${persona.prompt}）；默认爆款技巧框架（人设未另行规定时）：${DEFAULT_TECHNIQUES}。`,
    `【选题】${topic.title}`,
    `【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`,
  ].join('\n')
}
