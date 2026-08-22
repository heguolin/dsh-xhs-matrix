/** /studio 创作台路由：会话消息收发、两阶段结构化 SSE 流式与草稿保存。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { MatrixStore } from '../store.ts';
import { type StudioService } from '../studio.ts';
/**
 * 构建 /studio 创作台路由。
 * @param store - 矩阵存储。
 * @param studio - 创作会话服务；未配置时发送/保存请求返回 400。
 * @returns 路由数组。
 */
export declare function makeStudioRoutes(store: MatrixStore, studio?: StudioService): WebRoute[];
