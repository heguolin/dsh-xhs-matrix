import type { XhsApi } from '../api.ts';
interface DraftRow {
    id: string;
    accountId: string;
    copy: string;
    coverPrompt: string;
    tags?: string;
    status: string;
    evidence?: {
        persona?: string;
        noteIds: string[];
        trendIds: string[];
        reasons: string[];
    };
}
/**
 * 草稿编辑器（设计稿 content/detail-surfaces.html）：
 * 左栏正文直接编辑 + 编辑动作（重写标题/优化开头），右栏本次生成依据；
 * 保存后仍保持「草稿」状态，不自动发布。
 */
export declare function DraftEditor({ api, accountId, draft, onSaved }: {
    api: XhsApi;
    accountId: string;
    draft: DraftRow;
    onSaved: () => void;
}): import("react").JSX.Element;
export {};
