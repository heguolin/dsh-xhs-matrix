/** /personas 路由：人设 CRUD。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { MatrixStore } from '../store.ts';
/** 构建人设路由。
 * @param store - 矩阵存储。
 * @returns 路由数组。
 */
export declare function makePersonasRoutes(store: MatrixStore): WebRoute[];
