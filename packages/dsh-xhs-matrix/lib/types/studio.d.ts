/** 矩阵专属创作会话：账号级上下文组装、模型调用、消息与草稿保存。 */
import { MatrixStore } from './store.ts';
import type { Draft, DraftEvidence, StudioMessage } from './types.ts';
/** 一次模型补全请求（矩阵会话内，只含文本消息）。 */
export interface StudioCompleteRequest {
    system: string;
    messages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    maxTokens?: number;
}
/** 模型客户端抽象：注入实现，避免 studio 直接依赖 Host 服务。 */
export interface StudioLlmClient {
    complete(request: StudioCompleteRequest): Promise<{
        text: string;
    }>;
}
/** 创作上下文组装结果。 */
export interface StudioContext {
    context: string;
    truncated: boolean;
    warning?: string;
}
/** 只读取当前账号矩阵数据并组装为上下文；绝不复用主工作区内容。 */
export declare function buildStudioContext(store: MatrixStore, accountId: string, mode: 'full' | 'creative', maxInputChars?: number): StudioContext;
/** 创作会话服务。 */
export declare class StudioService {
    private readonly store;
    private readonly llm;
    private readonly modelLabel;
    constructor(store: MatrixStore, llm: StudioLlmClient, modelLabel?: string);
    /** 追加用户消息，组装上下文，调用模型，保存助手消息。 */
    send(accountId: string, input: string, mode: 'full' | 'creative', maxInputChars?: number): Promise<{
        message: StudioMessage;
        evidence: DraftEvidence;
        warning?: string;
    }>;
    /** 保存一条草稿（可带生成依据），不发布。 */
    saveDraft(accountId: string, payload: {
        topicId: string;
        copy: string;
        coverPrompt: string;
        evidence?: DraftEvidence;
    }): Draft;
}
