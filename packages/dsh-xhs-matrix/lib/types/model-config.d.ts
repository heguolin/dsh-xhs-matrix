export interface ModelRoute {
    provider: string;
    model: string;
}
export declare function resolveStudioModel(getDefaultModel: () => ModelRoute | undefined, listProviders: () => Array<{
    id: string;
}>): ModelRoute | undefined;
