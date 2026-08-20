/** 界面文案：中文为主，英文键对齐（locale.register 需要 zh/en 两本词典）。 */
export declare const NS = "dsh-xhs-matrix";
/** 中文字典。 */
export declare const zh: {
    readonly 'entry.label': "矩阵";
    readonly 'entry.tooltip': "小红书矩阵管理";
    readonly 'panel.title': "小红书矩阵";
    readonly 'tab.accounts': "账号";
    readonly 'tab.personas': "人设";
    readonly 'tab.topics': "选题";
    readonly 'tab.drafts': "草稿";
};
/** 英文字典（键对齐）。 */
export declare const en: Record<keyof typeof zh, string>;
export type XhsKey = keyof typeof zh;
