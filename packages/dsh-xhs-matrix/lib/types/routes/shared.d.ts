/** 路由族共享工具：JSON 响应、请求体解析、查询参数、围栏与方法检查。 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MatrixStore } from '../store.ts';
/** 写 JSON 响应。 */
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
/** 读取 JSON 请求体；非法 JSON 或超限返回 undefined。 */
export declare function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined>;
/** 读取查询参数；缺失返回 undefined。 */
export declare function queryParam(url: URL, name: string): string | undefined;
/** 围栏 + 方法检查。 */
export declare function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean;
/** 带状态码的路由错误：供错误映射按 400/404/409 精确渲染。 */
export declare class HttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
/** 把错误渲染为对应状态响应：HttpError 用自身状态码，其余按参数错误 400。 */
export declare function fail(res: ServerResponse, error: unknown): void;
/**
 * 解析人设作用域：兼容期按 accountId 反查账号当前人设，或直接用 personaId。
 * - account 与 persona 同时传入且不一致：返回 409，绝不静默选择其一。
 * - 显式 personaId 或 accountId 指向不存在的资源：返回 404。
 * - 什么都不传：返回 400。
 * 仅按 account 解析时，返回账号当前 personaId（可为空字符串，由调用方决定空人设语义）。
 */
export declare function resolvePersonaScope(store: MatrixStore, accountId?: string, personaId?: string): string;
