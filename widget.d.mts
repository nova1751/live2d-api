export { loadModelCatalog } from './library/catalog.js';
export type WidgetMode = 'random' | 'sequential';
export type WidgetPosition = 'left' | 'right';
export interface WidgetOptions {
    /** Directory containing model_list.json and the built-in models. */
    modelBaseUrl?: string | URL;
    /** A single model manifest to show in place of the built-in rotation. */
    modelUrl?: string | URL;
    /** Optional self-hosted Cubism Core for modern models. */
    coreUrl?: string | URL;
    catalogUrl?: string | URL;
    modelId?: string;
    mode?: WidgetMode;
    position?: WidgetPosition;
    /** Directory containing the deployed runtime and styles. */
    baseUrl?: string | URL;
}
export declare function selectWidgetModel(id: string): Promise<void>;
export declare function loadWidget({ mode, position, baseUrl, modelUrl, coreUrl, modelBaseUrl, catalogUrl, modelId }?: WidgetOptions): Promise<void>;
