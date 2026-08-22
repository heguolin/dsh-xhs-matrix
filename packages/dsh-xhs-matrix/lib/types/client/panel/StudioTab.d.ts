import type { XhsApi } from '../api.ts';
/**
 * 专属创作台（设计稿 content/creative-studio.html）：
 * 对话区最大化 + 右侧本次创作上下文（人设/知识库/已采纳爆款参考/指标快照），
 * 上下文始终可见，生成结果通过人工操作保存为草稿。
 */
export declare function StudioTab({ api, accountId, personaId, onOpenDraft }: {
    api: XhsApi;
    accountId: string;
    personaId: string;
    onOpenDraft: () => void;
}): import("react").JSX.Element;
