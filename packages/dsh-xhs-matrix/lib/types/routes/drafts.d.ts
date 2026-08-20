/** /drafts 草稿路由：列表、创建、编辑与状态回填。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type MatrixStore } from '../store.ts';
/**
 * 构建 /drafts 草稿路由。
 * @param store - 矩阵存储。
 * @returns 路由数组。
 */
export declare function makeDraftsRoutes(store: MatrixStore): WebRoute[];
