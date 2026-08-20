import type { XhsApi } from '../api.ts';
import type { PageId } from './XhsPanel.tsx';
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
 * 运营总览（设计稿 content/hybrid-layout.html + 设计文档 §8.2）：
 * 矩阵级多账号总览 —— 显示所有账号的状态、指标、知识库表现、草稿摘要与
 * 今日趋势选题；点击任意账号卡片进入该账号的独立工作区。
 */
export declare function OverviewTab({ api, accounts, onOpenAccount, onOpenStudio }: {
    api: XhsApi;
    accounts: AccountRow[];
    onOpenAccount: (accountId: string, page: PageId) => void;
    onOpenStudio: (accountId: string) => void;
}): import("react").JSX.Element;
export {};
