/** Agent 工具族：xhs_today 爆款池创作简报 + 草稿/爆款/账号/待归属操作。所有工具返回 { ok, message, ...data }。 */
import type { Context } from '@deepseek-ai/cordis';
import { MatrixStore } from './store.ts';
/** 工具依赖。 */
export interface ToolsDeps {
    store: MatrixStore;
    ctx: Context;
}
/**
 * 构建 模型工具。
 * @param deps - 存储与上下文。
 * @returns 工具定义数组。
 */
export declare function makeTools(deps: ToolsDeps): import("@deepseek-ai/dsh-tools").ToolDefinition[];
