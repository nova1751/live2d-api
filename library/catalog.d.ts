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
    presentation?: {
        labels: Record<string, string>;
        captions: Record<string, string>;
        aliases: Record<string, string>;
        outfitOrder?: Record<string, number>;
    };
    audio?: Record<string, string[]>;
}
export interface DialogueSource {
    url: string;
    captions?: Record<string, string>;
    audio: ReadonlyMap<string, string>;
}
export type Collection = 'girls-frontline';
export declare function loadModelCatalog(input: string | URL, collection?: Collection): Promise<{
    ids: string[];
    visibleId: (id: string) => string;
    labels: Record<string, string>;
    resolve: (id: string, source?: string) => {
        captions: Record<string, string> | undefined;
        modelUrl: string;
        dialogue: DialogueSource | undefined;
        soundAliases: Record<string, string> | undefined;
    };
    legacyIds: string[][] | undefined;
}>;
