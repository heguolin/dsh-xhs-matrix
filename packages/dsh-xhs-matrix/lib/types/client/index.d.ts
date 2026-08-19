/** Browser-half 入口：注册词典并挂载侧边栏入口与中栏面板。DOM 问题只记录不抛出。 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type XhsKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'dsh-xhs-matrix': XhsKey;
    }
}
/** 需要的服务。 */
export declare const inject: string[];
/**
 * 挂载矩阵面板。
 * @param ctx - client 根上下文。
 */
export declare function apply(ctx: ClientContext): void;
