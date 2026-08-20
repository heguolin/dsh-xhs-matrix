/** 创作简报拼接：人设 + 爆款池参考 + 风格声明（纯函数）。 */
import type { Account, Persona, ViralItem } from './types.ts';
/**
 * 拼接创作简报 markdown。
 * @param account - 目标账号。
 * @param persona - 账号人设。
 * @param viralItems - 该账号爆款池参考条目（pending/accepted），作为素材来源。
 * @returns 简报文本。
 */
export declare function composeBrief(account: Account, persona: Persona, viralItems: ViralItem[]): string;
