export type WidgetLocale = 'zh-CN' | 'en';
export interface ModelSource {
    baseUrl: string;
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
export type Collection = 'girls-frontline' | 'azur-lane' | 'bang-dream' | 'houkai2';
export type LoadedModelCatalog = Awaited<ReturnType<typeof loadModelCatalog>>;
export declare function loadModelCatalog(input: string | URL, collection?: Collection, locale?: WidgetLocale): Promise<{
    url: string;
    collection: Collection | undefined;
    locale: WidgetLocale;
    ids: string[];
    gallery: Record<string, GalleryEntry> | undefined;
    visibleId: (id: string) => string;
    labels: Record<string, string>;
    resolve: (id: string, source?: string) => {
        cues: Record<string, GameCue> | undefined;
        files: Record<string, string | null> | undefined;
        captions: Record<string, string> | undefined;
        modelUrl: string;
        dialogue: DialogueSource | undefined;
        soundAliases: Record<string, string> | undefined;
    };
    legacyIds: string[][] | undefined;
}>;
