import type { XhsApi } from '../api.ts';
/** 运营总览：多账号状态、指标摘要、高权重笔记和草稿数。 */
export declare function OverviewTab({ api, onOpenStudio }: {
    api: XhsApi;
    onOpenStudio: (accountId: string) => void;
}): import("react").JSX.Element;
