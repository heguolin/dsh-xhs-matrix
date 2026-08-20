import type { XhsApi } from '../api.ts';
interface DraftRow {
    id: string;
    accountId: string;
    copy: string;
    coverPrompt: string;
    tags?: string;
    status: string;
}
/** 草稿编辑器：标题/正文/标签/封面提示词可直接修改，显式保存。 */
export declare function DraftEditor({ api, accountId, draft, onSaved }: {
    api: XhsApi;
    accountId: string;
    draft: DraftRow;
    onSaved: () => void;
}): import("react").JSX.Element;
export {};
