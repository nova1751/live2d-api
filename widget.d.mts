export { loadModelCatalog } from './library/catalog.js';
import type { WidgetLocale } from './library/catalog.js';
export type { WidgetLocale } from './library/catalog.js';
export type WidgetMode = 'random' | 'sequential';
export type WidgetPosition = 'left' | 'right';
export interface WidgetOptions {
    /** Initial zoom in the expanded viewer, in percent of fit (50–300, default 100). */
    expandedZoom?: number;
    /** Directory containing model_list.json and the built-in models. */
    modelBaseUrl?: string | URL;
    /** A single model manifest to show in place of the built-in rotation. */
    modelUrl?: string | URL;
    /** Optional self-hosted Cubism Core for modern models. */
    coreUrl?: string | URL;
    locale?: WidgetLocale;
    collection?: import('./library/catalog.js').CollectionScope;
    switchBy?: 'character' | 'outfit';
    catalogUrl?: string | URL;
    /** Reuse the catalog already loaded by a gallery, including its collection and locale. */
    catalog?: import('./library/catalog.js').LoadedModelCatalog;
    modelId?: string;
    mode?: WidgetMode;
    position?: WidgetPosition;
    /** Directory containing the deployed runtime and styles. */
    baseUrl?: string | URL;
}
export declare function selectWidgetModel(id: string): Promise<void>;
export declare function loadWidget({ mode, position, baseUrl, modelUrl, coreUrl, modelBaseUrl, catalogUrl, catalog, modelId, collection, switchBy, locale, expandedZoom }?: WidgetOptions): Promise<void>;
/** Mount the Girls’ Frontline collection and keep character changes inside it. */
export declare function loadGirlsFrontline(options?: Omit<WidgetOptions, 'collection' | 'modelUrl' | 'modelBaseUrl'>): Promise<void>;
