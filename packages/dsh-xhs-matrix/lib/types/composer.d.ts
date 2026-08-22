/** 创作简报拼接：人设 v4 字段 + 爆款池参考（按 weight DESC, score DESC 排序）+ 风格声明（纯函数）。 */
import type { Persona, ViralItem } from './types.ts';
/**
 * 拼接创作简报 markdown。
 * @param persona - 人设（唯一内容所有者；使用 v4 字段：writingStyles/endingHookConstraints/endingHookExamples/forbiddenWords）。
 * @param viralItems - 该人设共享爆款池参考（pending/accepted），作为素材来源；按 weight DESC、score DESC 排序。
 * @param accountName - 可选账号名（仅用于简报标题展示，不参与归属）。
 * @returns 简报文本。
 */
export declare function composeBrief(persona: Persona, viralItems: ViralItem[], accountName?: string): string;
