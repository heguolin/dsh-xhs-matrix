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
    /** 流式补全：onDelta 收到文本增量，返回完整文本。 */
    stream(request: StudioCompleteRequest, onDelta: (delta: string) => void): Promise<string>;
}
/** 从模型输出中拆分正文与封面提示词；无标记时整段视为正文。 */
export declare function parseCoverPrompt(text: string): {
    copy: string;
    coverPrompt: string;
};
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
    /**
     * 流式发送：追加用户消息、组装上下文、流式调用模型并把增量回传给 onDelta，
     * 完成后解析封面提示词、保存助手消息。
     * @param onDelta - 文本增量回调（供 SSE 转发）。
     */
    sendStream(accountId: string, input: string, mode: 'full' | 'creative', onDelta: (delta: string) => void, maxInputChars?: number): Promise<{
        message: StudioMessage;
        evidence: DraftEvidence;
        coverPrompt: string;
        warning?: string;
    }>;
    /** 保存一条草稿（可带生成依据），不发布；日期取当日，草稿独立于选题。 */
    saveDraft(accountId: string, payload: {
        copy: string;
        coverPrompt: string;
        evidence?: DraftEvidence;
    }): Draft;
}
