/** 纯函数决策流水线：输入领域状态，输出选题与创作简报，不碰 I/O。 */
import type { Draft, Topic } from './types.ts';
/**
 * 按账号过滤选题：剔除已用 / 今日已为该账号生成。
 * @param topics - 全部选题。
 * @param accountId - 目标账号。
 * @param todayDrafts - 今日草稿。
 * @returns 候选选题。
 */
export declare function filterTopics(topics: Topic[], accountId: string, todayDrafts: Draft[]): Topic[];
/**
 * 从候选中选择一个选题。
 * @param candidates - 候选选题。
 * @param strategy - fifo（最旧未用优先，按 createdAt 排序）/ random。
 * @param rand - 随机源，测试注入固定值。
 * @returns 选中选题，候选为空时 undefined。
 */
export declare function selectTopic(candidates: Topic[], strategy: 'fifo' | 'random', rand?: () => number): Topic | undefined;
