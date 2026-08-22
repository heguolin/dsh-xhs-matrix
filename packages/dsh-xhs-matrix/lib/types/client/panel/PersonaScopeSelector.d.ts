import type { XhsApi } from '../api.ts';
/** 人设作用域选择器：展示当前作用域人设名称，下拉可临时切换。 */
export declare function PersonaScopeSelector({ api, value, onChange }: {
    api: XhsApi;
    value: string;
    onChange: (personaId: string) => void;
}): import("react").JSX.Element;
