export type WidgetMode = 'random' | 'sequential';
export type WidgetPosition = 'left' | 'right';
export interface WidgetOptions {
    mode?: WidgetMode;
    position?: WidgetPosition;
    /** Directory containing the deployed scripts, styles and models. */
    baseUrl?: string | URL;
}
export declare function loadWidget({ mode, position, baseUrl }?: WidgetOptions): Promise<void>;
