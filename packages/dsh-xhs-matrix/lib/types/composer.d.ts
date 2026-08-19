/** 创作简报拼接：人设 + 选题 − 黑名单 + 风格声明（纯函数）。 */
import type { Account, NegativeTopic, Persona, Topic } from './types.ts';
/**
 * 拼接创作简报 markdown。
 * @param account - 目标账号。
 * @param persona - 账号人设。
 * @param topic - 选中选题。
 * @param negatives - 全部黑名单（账号级 + 全局）。
 * @returns 简报文本。
 */
export declare function composeBrief(account: Account, persona: Persona, topic: Topic, negatives: NegativeTopic[]): string;
