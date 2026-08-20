/** 路由族共享工具：JSON 响应、请求体解析、查询参数、围栏与方法检查。 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** 写 JSON 响应。 */
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
/** 读取 JSON 请求体；非法 JSON 或超限返回 undefined。 */
export declare function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined>;
/** 读取查询参数；缺失返回 undefined。 */
export declare function queryParam(url: URL, name: string): string | undefined;
/** 围栏 + 方法检查。 */
export declare function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean;
/** 把错误渲染为 400 响应。 */
export declare function fail(res: ServerResponse, error: unknown): void;
