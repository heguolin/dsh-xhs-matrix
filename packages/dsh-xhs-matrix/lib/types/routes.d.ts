/** /api/dsh-xhs-matrix 路由族：账号/人设/选题/草稿 CRUD。 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { MatrixStore } from './store.ts';
import { type TrendProvider } from './trends.ts';
import { type CollectionScheduler } from './metrics.ts';
import { StudioService } from './studio.ts';
/** 路由族依赖。 */
export interface RoutesDeps {
    store: MatrixStore;
    trendProvider?: TrendProvider;
    scheduler?: CollectionScheduler;
    studio?: StudioService;
}
/**
 * 构建全部 /api/dsh-xhs-matrix 路由。
 * @param deps - 存储。
 * @returns 路由数组。
 */
export declare function makeRoutes(deps: RoutesDeps): WebRoute[];
