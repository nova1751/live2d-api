export type WidgetLocale = 'zh-CN' | 'en';
export interface ModelSource {
    baseUrl: string;
    packs?: {
        baseUrl: string;
        directories: string[];
    }[];
}
export interface GameCue {
    sound?: string;
    caption?: string;
    captionEn?: string;
}
export interface GalleryEntry {
    name: string;
    en?: string;
    outfit: string;
    outfitEn?: string;
    date?: number;
    portrait?: string;
}
export interface ModelVariant {
    sceneAspect?: number;
    cueSource?: string;
    collectionDefault?: boolean;
    cues?: Record<string, GameCue>;
    files?: Record<string, string | null>;
    source: string;
    manifest?: string;
    dialogue?: string;
    soundAliases?: Record<string, string>;
}
export interface ModelCatalog {
    schemaVersion: 1;
    gallery?: Record<string, GalleryEntry>;
    legacyIds?: string[][];
    sources: Record<string, ModelSource>;
    models: Record<string, ModelVariant[]>;
    presentation?: {
        labels: Record<string, string>;
        captions: Record<string, string>;
        aliases: Record<string, string>;
        en?: {
            labels: Record<string, string>;
            captions: Record<string, string>;
        };
        outfitOrder?: Record<string, number>;
    };
    audio?: Record<string, string[]>;
}
export interface DialogueSource {
    url: string;
    captions?: Record<string, string>;
    audio: ReadonlyMap<string, string>;
}
export declare const collections: readonly ["girls-frontline", "azur-lane", "bang-dream", "houkai2", "iron-saga", "warship-girls", "baoshi-yanwuyu"];
export type Collection = typeof collections[number];
export type CollectionScope = Collection | 'all';
export declare function collectionCatalogUrl(libraryUrl: string, collection?: CollectionScope): string;
export type LoadedModelCatalog = Awaited<ReturnType<typeof loadModelCatalog>>;
export declare function loadModelCatalog(input: string | URL, collection?: Collection, locale?: WidgetLocale): Promise<{
    url: string;
    collection: "girls-frontline" | "azur-lane" | "bang-dream" | "houkai2" | "iron-saga" | "warship-girls" | "baoshi-yanwuyu" | undefined;
    locale: WidgetLocale;
    ids: string[];
    gallery: Record<string, GalleryEntry> | undefined;
    visibleId: (id: string) => string;
    labels: Record<string, string>;
    resolve: (id: string, source?: string) => {
        cues: {
            [k: string]: {
                sound: string | undefined;
                caption: string | undefined;
                captionEn?: string;
            };
        } | undefined;
        sceneAspect: number | undefined;
        files: Record<string, string | null> | undefined;
        captions: Record<string, string> | undefined;
        modelUrl: string;
        dialogue: DialogueSource | undefined;
        soundAliases: Record<string, string> | undefined;
    };
    legacyIds: string[][] | undefined;
}>;
export declare function parseModelCatalog(catalog: ModelCatalog, url: URL, collection?: Collection, locale?: WidgetLocale, sourceBase?: string): {
    url: string;
    collection: "girls-frontline" | "azur-lane" | "bang-dream" | "houkai2" | "iron-saga" | "warship-girls" | "baoshi-yanwuyu" | undefined;
    locale: WidgetLocale;
    ids: string[];
    gallery: Record<string, GalleryEntry> | undefined;
    visibleId: (id: string) => string;
    labels: Record<string, string>;
    resolve: (id: string, source?: string) => {
        cues: {
            [k: string]: {
                sound: string | undefined;
                caption: string | undefined;
                captionEn?: string;
            };
        } | undefined;
        sceneAspect: number | undefined;
        files: Record<string, string | null> | undefined;
        captions: Record<string, string> | undefined;
        modelUrl: string;
        dialogue: DialogueSource | undefined;
        soundAliases: Record<string, string> | undefined;
    };
    legacyIds: string[][] | undefined;
};
