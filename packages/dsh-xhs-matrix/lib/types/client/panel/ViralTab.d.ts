import type { XhsApi } from '../api.ts';
export declare function ViralTab({ api, accountId, personaId, onPersonaChange }: {
    api: XhsApi;
    accountId: string;
    personaId: string;
    onPersonaChange: (id: string) => void;
}): import("react").JSX.Element;
