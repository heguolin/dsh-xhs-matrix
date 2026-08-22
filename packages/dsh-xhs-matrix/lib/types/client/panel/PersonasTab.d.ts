import type { XhsApi } from '../api.ts';
/**
 * 人设配置（设计稿 content/detail-surfaces.html + 人设资产 UI 参考稿）：
 * 左侧选择人设，右侧四区块——写作风格(01/VOICE) / 结尾互动钩子(02/ENDING)
 * / 人设违禁词(03/SAFETY) / 生效范围(04/SAVE)。写作风格可自由增删，
 * 旧 hookStyles 不再标为钩子；toneTags 仍是独立的口癖/语气标签。
 */
export declare function PersonasTab({ api }: {
    api: XhsApi;
}): import("react").JSX.Element;
