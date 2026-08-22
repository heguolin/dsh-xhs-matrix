import type { XhsApi } from '../api.ts';
/**
 * 已在盘知识库导入（v4 人设资产视图）：导入目标为当前人设作用域。
 * - 「归属人设」只读展示当前选中人设名（作用域由父级 XhsPanel/KnowledgeTab 持有）。
 * - 标题（每行一个）+ 正文（与标题行号对应）构造 JSON 数组，经账号导入路由以 personaId 为**目标**落库。
 * - personaId 为当前资产作用域人设（可被临时切换）；accountId 仅作来源账号快照，二者角色不同。
 */
export declare function ImportDialog({ api, accountId, personaId, onDone }: {
    api: XhsApi;
    accountId: string;
    personaId: string;
    onDone: () => void;
}): import("react").JSX.Element;
