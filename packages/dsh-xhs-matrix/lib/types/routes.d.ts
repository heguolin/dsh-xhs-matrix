/** /api/dsh-xhs-matrix 路由族：账号/人设/选题/黑名单/草稿 CRUD。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { MatrixStore } from './store.ts';
/** 路由族依赖。 */
export interface RoutesDeps {
    store: MatrixStore;
}
/**
 * 构建全部 /api/dsh-xhs-matrix 路由。
 * @param deps - 存储。
 * @returns 路由数组。
 */
export declare function makeRoutes(deps: RoutesDeps): WebRoute[];
