import type { XhsApi } from '../api.ts';
/**
 * 已在盘知识库导入（v4 人设资产视图）：导入目标为当前人设作用域。
 * - 「归属人设」只读展示当前选中人设名（作用域由父级 XhsPanel/KnowledgeTab 持有）。
 * - 标题（每行一个）+ 正文（与标题行号对应）构造 JSON 数组，经账号导入路由落到账号当前人设。
 * - 若用户临时切换过人设，账号导入仍走账号自身绑定人设（见 report「导入目标」歧义说明）。
 */
export declare function ImportDialog({ api, accountId, personaId, onDone }: {
    api: XhsApi;
    accountId: string;
    personaId: string;
    onDone: () => void;
}): import("react").JSX.Element;
