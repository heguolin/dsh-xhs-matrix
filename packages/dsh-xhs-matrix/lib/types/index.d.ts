/** dsh-xhs-matrix — Host 半。装配存储、/api/dsh-xhs-matrix 路由族、agent 工具与系统提示词。 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import z from 'schemastery';
import { type ModelRoute } from './model-config.ts';
import { type StudioLlmClient } from './studio.ts';
/** 稳定插件名。 */
export declare const name = "xhs-matrix";
/** 需要的服务。 */
export declare const inject: string[];
/** 设置命名空间。 */
export declare const XHS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** 插件配置（Apify 数据源配置唯一来源为 store 运行时设置，不再放插件 Config）。 */
export interface Config {
    locale?: string;
    announceToAgent?: boolean;
    enabled?: boolean;
}
export declare const Config: z<Config>;
/** 模型可见公告。 */
export declare const XHS_GUIDANCE = "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-xhs-matrix \u63D2\u4EF6\uFF08\u5C0F\u7EA2\u4E66\u77E9\u9635\u5185\u5BB9\u7BA1\u7406\uFF09\uFF1A\u4FA7\u8FB9\u680F\u300C\u77E9\u9635\u300D\u5165\u53E3\u7BA1\u7406\u8D26\u53F7\u3001\u4EBA\u8BBE\u3001\u5DF2\u53D1\u5E03\u77E5\u8BC6\u5E93\u3001\u7206\u6B3E\u6C60\u3001\u8349\u7A3F\u4E0E\u4E13\u5C5E\u521B\u4F5C\u53F0\u3002\u80FD\u529B\uFF1Axhs_today \u6309\u8D26\u53F7\u4EBA\u8BBE\u4E0E\u7206\u6B3E\u6C60\u751F\u6210\u521B\u4F5C\u7B80\u62A5\u4F9B\u4F60\u64B0\u5199\u6587\u6848\uFF1Bxhs_notes \u67E5\u8BE2\u8D26\u53F7\u5DF2\u53D1\u5E03\u7B14\u8BB0\u77E5\u8BC6\u5E93\uFF1Bxhs_virals \u67E5\u8BE2\u8D26\u53F7\u7206\u6B3E\u6C60\u6761\u76EE\u4E0E\u5BA1\u6838\u72B6\u6001\uFF1Bxhs_collection_status \u67E5\u8BE2\u6307\u6807\u91C7\u96C6\u72B6\u6001\uFF1Bxhs_draft_save \u6301\u4E45\u5316\u8349\u7A3F\uFF08\u540C\u8D26\u53F7\u5F53\u65E5\u53BB\u91CD\uFF09\uFF1Bxhs_accounts \u67E5\u8BE2\u8D26\u53F7\u4E0E\u4EBA\u8BBE\uFF1Bxhs_draft_status \u56DE\u586B\u53D1\u5E03\u72B6\u6001\u4E0E\u9605\u8BFB\u91CF\u6307\u6807\uFF08\u89E6\u53D1 xhs/feedback \u4E8B\u4EF6\uFF09\u3002\u7528\u6237\u63D0\u5230\u300C\u4ECA\u5929\u8981\u53D1\u4EC0\u4E48 / \u5C0F\u7EA2\u4E66 / \u77E9\u9635 / \u9009\u9898 / \u7206\u6B3E\u300D\u65F6\u5373\u6307\u672C\u63D2\u4EF6\u3002";
/** 创作台模型装配结果。 */
export interface StudioLlmSetup {
    /** 模型客户端：模型解析失败时 complete 抛明确错误。 */
    client: StudioLlmClient;
    /** 模型标签：解析失败时为「未配置」。 */
    modelLabel: string;
}
/**
 * 构建创作台模型客户端：模型解析失败（未配置 agent-default-model 且存在注册 provider）时，
 * 仅让创作台在调用 complete 时给出明确错误，插件照常加载，其余功能（路由/工具/公告/
 * 爆款池/知识库/草稿/账号）不受影响。
 * @param resolveModel - 读取 agent-default-model 设置的处理器；未配置时返回 undefined。
 * @param listProviders - 列出已注册 provider。
 * @param stream - 底层 llm.stream 调用入口。
 * @returns 模型客户端与模型标签。
 */
export declare function buildStudioLlmClient(resolveModel: () => ModelRoute | undefined, listProviders: () => Array<{
    id: string;
}>, stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>): StudioLlmSetup;
/**
 * 挂载存储、路由、工具与公告。
 * @param ctx - host 上下文（webServer/tools/systemPrompt/llm）。
 * @param config - 插件配置。
 */
export declare function apply(ctx: Context, config?: Config): void;
