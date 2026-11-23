interface LegacyOptions {
  locale?: import('./library/catalog').WidgetLocale;
  waifuPath: string;
  cdnPath?: string;
  apiPath?: string;
  tools?: string[];
  collection?: import('./library/catalog').Collection;
  catalogUrl?: string;
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
    (canvas: string, model: string, options?: { locale?: import('./library/catalog').WidgetLocale; onPaint?: (canvas: HTMLCanvasElement) => void; captions?: Record<string,string>; framing?: import('./library/framing').Framing; soundAliases?: Record<string, string>; dialogue?: import('./library/catalog').DialogueSource; start?: boolean; coreUrl?: string }): void | Promise<void>;
    capture?(): boolean;
    prepareInteraction?(): boolean;
    show?(start: boolean): void;
    hide?(): void;
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
