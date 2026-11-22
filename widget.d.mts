export type WidgetMode = 'random' | 'sequential';
export type WidgetPosition = 'left' | 'right';
export interface WidgetOptions {
    /** A single model manifest to show in place of the built-in rotation. */
    modelUrl?: string | URL;
    /** Optional self-hosted Cubism Core for modern models. */
    coreUrl?: string | URL;
    mode?: WidgetMode;
    position?: WidgetPosition;
    /** Directory containing the deployed scripts, styles and models. */
    baseUrl?: string | URL;
}
export declare function loadWidget({ mode, position, baseUrl, modelUrl, coreUrl }?: WidgetOptions): Promise<void>;
