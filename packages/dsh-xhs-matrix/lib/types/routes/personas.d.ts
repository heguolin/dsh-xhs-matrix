/** /personas 与 /pending-ownership 路由：人设 CRUD（含删除守卫）与待归属处理。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { MatrixStore } from '../store.ts';
/** 构建人设路由。
 * @param store - 矩阵存储。
 * @returns 路由数组。
 */
export declare function makePersonasRoutes(store: MatrixStore): WebRoute[];
