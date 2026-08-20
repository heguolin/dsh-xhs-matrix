import type { XhsApi } from '../api.ts';
/** 矩阵专属创作台：账号级对话、模式切换、证据展示、保存草稿。 */
export declare function StudioTab({ api, accountId, onOpenDraft }: {
    api: XhsApi;
    accountId: string;
    onOpenDraft: (draftId?: string) => void;
}): import("react").JSX.Element;
