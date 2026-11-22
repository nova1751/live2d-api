interface LegacyOptions {
  waifuPath: string;
  cdnPath?: string;
  apiPath?: string;
  tools?: string[];
  modelUrl?: string;
  coreUrl?: string;
}
interface InitWidget {
  (options: LegacyOptions): void;
  (waifuPath: string, apiPath: string): void;
}

interface Window {
  initWidget: InitWidget;
  loadlive2d: {
    (canvas: string, model: string, options?: { start?: boolean; coreUrl?: string }): void | Promise<void>;
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
declare const PROVIDER: 'jsdelivr' | 'npm';
declare const MODE: 'random' | 'sequential';
