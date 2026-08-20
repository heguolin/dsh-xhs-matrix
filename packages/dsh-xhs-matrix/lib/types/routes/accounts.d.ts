/** /accounts 与 /accounts/import 路由：账号 CRUD 与已发布笔记导入。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { MatrixStore } from '../store.ts';
/** 构建账号路由。
 * @param store - 矩阵存储。
 * @returns 路由数组。
 */
export declare function makeAccountsRoutes(store: MatrixStore): WebRoute[];
