export interface ModelSource {
    baseUrl: string;
}
export interface ModelVariant {
    source: string;
    manifest?: string;
    dialogue?: string;
    soundAliases?: Record<string, string>;
}
export interface ModelCatalog {
    schemaVersion: 1;
    legacyIds?: string[][];
    sources: Record<string, ModelSource>;
    models: Record<string, ModelVariant[]>;
    audio?: Record<string, string[]>;
}
export interface DialogueSource {
    url: string;
    audio: ReadonlyMap<string, string>;
}
export type Collection = 'girls-frontline';
export declare const defaultDoll = "doll/k2/3301/normal";
export declare function loadModelCatalog(input: string | URL, collection?: Collection): Promise<{
    ids: string[];
    resolve: (id: string, source?: string) => {
        modelUrl: string;
        dialogue: DialogueSource | undefined;
        soundAliases: Record<string, string> | undefined;
    };
    legacyIds: string[][] | undefined;
}>;
