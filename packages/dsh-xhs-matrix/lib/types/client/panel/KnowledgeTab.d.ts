import type { XhsApi } from '../api.ts';
/** 已发布知识库（v4 人设资产视图，设计稿 persona-owned-content-ui-reference）： */
export declare function KnowledgeTab({ api, accountId, personaId, onPersonaChange }: {
    api: XhsApi;
    accountId: string;
    personaId: string;
    onPersonaChange: (id: string) => void;
}): import("react").JSX.Element;
