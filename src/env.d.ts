interface LegacyOptions {
  expandedZoom?: number;
  locale?: import('./library/catalog').WidgetLocale;
  waifuPath: string;
  cdnPath?: string;
  apiPath?: string;
  tools?: string[];
  collection?: import('./library/catalog').CollectionScope;
  switchBy?: 'character' | 'outfit';
  catalogUrl?: string;
  catalog?: import('./library/catalog').LoadedModelCatalog;
  modelId?: string;
  modelUrl?: string;
  modelBaseUrl?: string;
  coreUrl?: string;
}
interface InitWidget {
  (options: LegacyOptions): void;
  (waifuPath: string, apiPath: string): void;
}

interface Event {
  /** Set by a model renderer when it owns the caption for this click. */
  live2dHandlesCaption?: boolean;
}

interface Window {
  initWidget: InitWidget;
  loadlive2d: {
    (canvas: string, model: string, options?: { signal?: AbortSignal; sceneAspect?: number; hiddenDrawables?: string[]; randomTap?: boolean; bandIdle?: boolean; files?: Record<string,string|null>; cues?: Record<string,import('./library/catalog').GameCue>; locale?: import('./library/catalog').WidgetLocale; onPaint?: (canvas: HTMLCanvasElement) => void; captions?: Record<string,string>; framing?: import('./library/framing').Framing; soundAliases?: Record<string, string>; dialogue?: import('./library/catalog').DialogueSource; start?: boolean; coreUrl?: string }): void | Promise<void>;
    cancelLoad?(): void;
    playMotion?(group: string, index: number): boolean;
    onNextPaint?(copy: (canvas: HTMLCanvasElement) => void): (() => void) | undefined;
    capture?(): boolean;
    prepareInteraction?(): boolean;
    show?(start: boolean): void;
    hide?(): void;
    /** Release the current model and its GPU textures. */
    unload?(): void;
  };
  Live2D: { captureName: string; captureFrame: boolean };
  Asteroids?: new () => object;
  ASTEROIDSPLAYERS?: object[];
}

// Replaced with literals in the standalone CDN entry scripts.
declare const LIBRARY_TAG: string;
declare const GLOBAL_RUNTIME: string;
declare const PROVIDER: 'jsdelivr' | 'npm';
declare const MODE: 'random' | 'sequential';
