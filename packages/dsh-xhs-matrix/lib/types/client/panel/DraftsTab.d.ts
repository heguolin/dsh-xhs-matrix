import type { XhsApi } from '../api.ts';
/**
 * 草稿箱：列表 + 展开编辑（DraftEditor 双栏）+ 标记 published/dropped + 录入指标。
 * 草稿保持「草稿」状态，发布由人工在端内完成。
 */
export declare function DraftsTab({ api, accountId, onOpenStudio }: {
    api: XhsApi;
    accountId: string;
    onOpenStudio: (accountId: string) => void;
}): import("react").JSX.Element;
