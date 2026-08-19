/** 纯函数决策流水线：输入领域状态，输出选题与创作简报，不碰 I/O。 */

import type { Draft, NegativeTopic, Topic } from './types.ts'

/** 标题是否命中黑名单（子串匹配）。 */
export function matchesNegative(title: string, negative: NegativeTopic): boolean {
  return title.includes(negative.keyword)
}

/** 该账号今日已用过的选题 id 集合。 */
function usedTodayIds(accountId: string, todayDrafts: Draft[]): Set<string> {
  return new Set(todayDrafts.filter(d => d.accountId === accountId).map(d => d.topicId))
}

/**
 * 按账号过滤选题：剔除已用 / 命中黑名单（账号级 + 全局）/ 今日已为该账号生成。
 * @param topics - 全部选题。
 * @param negatives - 全部黑名单。
 * @param accountId - 目标账号。
 * @param todayDrafts - 今日草稿。
 * @returns 候选选题。
 */
export function filterTopics(
  topics: Topic[],
  negatives: NegativeTopic[],
  accountId: string,
  todayDrafts: Draft[],
): Topic[] {
  const usedToday = usedTodayIds(accountId, todayDrafts)
  return topics.filter((topic) => {
    if (topic.status !== 'open') return false
    if (usedToday.has(topic.id)) return false
    const hit = negatives.some(n =>
      (n.accountId === undefined || n.accountId === accountId) && matchesNegative(topic.title, n),
    )
    return !hit
  })
}

/**
 * 从候选中选择一个选题。
 * @param candidates - 候选选题。
 * @param strategy - fifo（最旧未用优先，按 createdAt 排序）/ random。
 * @param rand - 随机源，测试注入固定值。
 * @returns 选中选题，候选为空时 undefined。
 */
export function selectTopic(
  candidates: Topic[],
  strategy: 'fifo' | 'random',
  rand: () => number = Math.random,
): Topic | undefined {
  if (candidates.length === 0) return undefined
  if (strategy === 'random') {
    return candidates[Math.floor(rand() * candidates.length)]
  }
  return [...candidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
}
