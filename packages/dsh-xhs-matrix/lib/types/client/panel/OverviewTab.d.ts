import type { XhsApi } from '../api.ts';
interface AccountRow {
    id: string;
    name: string;
    personaId: string;
    enabled: boolean;
    connection?: {
        profileUrl?: string;
        externalId?: string;
        status: string;
        source?: string;
        lastError?: string;
        lastSuccessAt?: string;
    };
    collectionStatus?: {
        running: boolean;
        lastStatus: string;
        lastSuccessAt?: string;
        lastError?: string;
    };
}
/**
 * 运营总览（设计稿 content/hybrid-layout.html）：
 * 账号表现指标卡 + 高权重历史内容 + 专属创作台摘要 + 今日趋势选题。
 */
export declare function OverviewTab({ api, accountId, accounts, onOpenStudio }: {
    api: XhsApi;
    accountId: string;
    accounts: AccountRow[];
    onOpenStudio: (id: string) => void;
}): import("react").JSX.Element;
export {};
