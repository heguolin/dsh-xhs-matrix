/** Agent 工具族：xhs_today 决策流 + 草稿/选题/账号操作。所有工具返回 { ok, message, ...data }。 */
import type { Context } from '@deepseek-ai/cordis';
import { MatrixStore } from './store.ts';
/** 工具依赖。 */
export interface ToolsDeps {
    store: MatrixStore;
    ctx: Context;
    /** 选题选择策略（与插件 Config.selectionStrategy 同源）。 */
    selectionStrategy: 'fifo' | 'random';
}
/**
 * 构建 8 个模型工具。
 * @param deps - 存储与上下文。
 * @returns 工具定义数组。
 */
export declare function makeTools(deps: ToolsDeps): import("@deepseek-ai/dsh-tools").ToolDefinition[];
