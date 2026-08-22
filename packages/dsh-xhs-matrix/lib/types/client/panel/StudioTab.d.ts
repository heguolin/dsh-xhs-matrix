import type { XhsApi } from '../api.ts';
/**
 * 专属创作台（设计稿 content/creative-studio.html + 人设资产 UI 参考稿 studio 视图）：
 * 四阶段进度、可折叠创作说明（可审计摘要）、流式最终稿、依据侧栏与质量门。
 * 最终稿只来自 content_delta；plan_delta 只进入创作说明；quality.allowed === false 禁用保存。
 * 智能跟随底部：首次进入/历史加载/跟随状态下滚到底；上滚超阈值暂停并显示「回到最新」。
 */
export declare function StudioTab({ api, accountId, personaId, onOpenDraft }: {
    api: XhsApi;
    accountId: string;
    personaId: string;
    onOpenDraft: () => void;
}): import("react").JSX.Element;
