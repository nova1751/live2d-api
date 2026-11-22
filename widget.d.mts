export type WidgetMode = 'random' | 'sequential';
export type WidgetPosition = 'left' | 'right';
export interface WidgetOptions {
    /** Directory containing model_list.json and the built-in models. */
    modelBaseUrl?: string | URL;
    /** A single model manifest to show in place of the built-in rotation. */
    modelUrl?: string | URL;
    /** Optional self-hosted Cubism Core for modern models. */
    coreUrl?: string | URL;
    mode?: WidgetMode;
    position?: WidgetPosition;
    /** Directory containing the deployed runtime and styles. */
    baseUrl?: string | URL;
}
export declare function loadWidget({ mode, position, baseUrl, modelUrl, coreUrl, modelBaseUrl }?: WidgetOptions): Promise<void>;
