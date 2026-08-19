/** 创作简报拼接：人设 + 选题 − 黑名单（纯函数）。 */

import type { Account, NegativeTopic, Persona, Topic } from './types.ts'

/**
 * 拼接创作简报 markdown。
 * @param account - 目标账号。
 * @param persona - 账号人设。
 * @param topic - 选中选题。
 * @param negatives - 全部黑名单（账号级 + 全局）。
 * @returns 简报文本。
 */
export function composeBrief(
  account: Account,
  persona: Persona,
  topic: Topic,
  negatives: NegativeTopic[],
): string {
  const constraints = negatives
    .filter(n => n.accountId === undefined || n.accountId === account.id)
    .map(n => `【约束】不要写类似于「${n.keyword}」的内容，因为${n.reason}`)
  return [
    `【账号】${account.name}（${persona.name}）`,
    `【人设】${persona.prompt}`,
    `【选题】${topic.title}`,
    ...constraints,
    `【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`,
  ].join('\n')
}
