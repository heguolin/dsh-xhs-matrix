/** dsh-xhs-matrix — Host 半。装配存储、/api/dsh-xhs-matrix 路由族、agent 工具与系统提示词。 */
import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
/** 稳定插件名。 */
export declare const name = "xhs-matrix";
/** 需要的服务。 */
export declare const inject: string[];
/** 设置命名空间。 */
export declare const XHS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** 插件配置。 */
export interface Config {
    selectionStrategy?: 'fifo' | 'random';
    locale?: string;
    announceToAgent?: boolean;
    enabled?: boolean;
}
export declare const Config: z<Config>;
/** 模型可见公告。 */
export declare const XHS_GUIDANCE = "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-xhs-matrix \u63D2\u4EF6\uFF08\u5C0F\u7EA2\u4E66\u77E9\u9635\u5185\u5BB9\u7BA1\u7406\uFF09\uFF1A\u4FA7\u8FB9\u680F\u300C\u77E9\u9635\u300D\u5165\u53E3\u7BA1\u7406\u8D26\u53F7\u3001\u4EBA\u8BBE\u3001\u9009\u9898\u3001\u9ED1\u540D\u5355\u4E0E\u8349\u7A3F\u3002\u80FD\u529B\uFF1Axhs_today \u6309\u8D26\u53F7\u4EBA\u8BBE\u751F\u6210\u521B\u4F5C\u7B80\u62A5\uFF08\u9009\u9898 + \u9ED1\u540D\u5355\u7EA6\u675F\uFF09\u4F9B\u4F60\u64B0\u5199\u6587\u6848\uFF1Bxhs_draft_save \u6301\u4E45\u5316\u8349\u7A3F\uFF08\u540C\u8D26\u53F7\u5F53\u65E5\u540C\u9009\u9898\u53BB\u91CD\uFF09\uFF1Bxhs_topic_add / xhs_negative_add \u7BA1\u7406\u9009\u9898\u6C60\u4E0E\u9ED1\u540D\u5355\uFF1Bxhs_accounts \u67E5\u8BE2\u8D26\u53F7\u4E0E\u4EBA\u8BBE\uFF1Bxhs_draft_status \u56DE\u586B\u53D1\u5E03\u72B6\u6001\u4E0E\u9605\u8BFB\u91CF\u6307\u6807\uFF08\u89E6\u53D1 xhs/feedback \u4E8B\u4EF6\uFF09\u3002\u7528\u6237\u63D0\u5230\u300C\u4ECA\u5929\u8981\u53D1\u4EC0\u4E48 / \u5C0F\u7EA2\u4E66 / \u77E9\u9635 / \u9009\u9898\u300D\u65F6\u5373\u6307\u672C\u63D2\u4EF6\u3002";
/**
 * 挂载存储、路由、工具与公告。
 * @param ctx - host 上下文（webServer/tools/systemPrompt）。
 * @param config - 插件配置。
 */
export declare function apply(ctx: Context, config?: Config): void;
