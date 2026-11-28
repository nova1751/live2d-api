// The score bar and the game's look, taken from the companion's caption so both match.

export interface Theme {
  /** Ship, bullets and highlights. */
  accent: string;
  /** Outlines and text. */
  ink: string;
  panel: string;
  border: string;
  /** Explosion colours, by particle tone. */
  sparks: [string, string, string];
}

const FALLBACK = { accent: '#0099cc', ink: '#3d3326', panel: 'rgba(236, 217, 188, 0.5)', border: 'rgba(224, 186, 140, 0.62)' };

function parse(color: string) {
  const match = color.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\)/);
  if (!match) return undefined;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
  return { r: +match[1], g: +match[2], b: +match[3], a: alpha };
}

/** The colour at no less than `alpha` opacity, so the bar stays readable over any page. */
function opaque(color: string, alpha: number) {
  const value = parse(color);
  return value ? `rgba(${value.r}, ${value.g}, ${value.b}, ${Math.max(value.a, alpha)})` : color;
}

function shown(color: string | undefined) {
  const value = color && parse(color);
  return value && value.a > 0 ? color : undefined;
}

export function readTheme(): Theme {
  const caption = document.getElementById('waifu-tips');
  let accent: string | undefined;
  let ink: string | undefined;
  let panel: string | undefined;
  let border: string | undefined;
  if (caption) {
    const style = getComputedStyle(caption);
    panel = shown(style.backgroundColor);
    border = shown(style.borderTopColor);
    ink = shown(style.color);
    // Highlighted words in captions use the accent colour; measure it on a probe.
    const probe = document.createElement('span');
    probe.hidden = true;
    caption.appendChild(probe);
    accent = shown(getComputedStyle(probe).color);
    probe.remove();
    if (accent === ink) accent = undefined;
  }
  const theme = {
    accent: accent ?? FALLBACK.accent,
    ink: ink ?? FALLBACK.ink,
    panel: opaque(panel ?? FALLBACK.panel, 0.88),
    border: border ?? FALLBACK.border,
  };
  return { ...theme, sparks: [theme.accent, '#f2a65a', '#f6d28b'] };
}

const copy = {
  zh: { score: '击落', keys: '方向键 / WASD 飞行 · 空格射击 · 按住 B 显示目标 · Esc 退出', touch: '按住屏幕瞄准并射击', quit: '退出小游戏', canvas: '小游戏：击落页面上的元素' },
  en: { score: 'Hits', keys: 'Arrows / WASD to fly · Space to fire · Hold B to show targets · Esc to quit', touch: 'Touch and hold to aim and fire', quit: 'Quit the game', canvas: 'Game: shoot down the page' },
};

export function words() {
  const lang = document.getElementById('waifu')?.lang || document.documentElement.lang;
  return /^en\b/i.test(lang) ? copy.en : copy.zh;
}

export function stylesheet(theme: Theme) {
  return `
.asteroids-root, .asteroids-root * { box-sizing: border-box; }
.asteroids-canvas {
  position: fixed; inset: 0; width: 100%; height: 100%;
  z-index: 2147483600; touch-action: none; cursor: crosshair;
}
.asteroids-canvas:focus { outline: none; }
.asteroids-hud {
  position: fixed; z-index: 2147483601;
  top: max(12px, env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  max-width: calc(100vw - 24px); padding: 4px 4px 4px 14px;
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: ${theme.ink}; background: ${theme.panel};
  border: 1px solid ${theme.border}; border-radius: 12px;
  box-shadow: 0 3px 15px 2px rgba(191, 158, 118, 0.2);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  user-select: none;
}
.asteroids-score { white-space: nowrap; }
.asteroids-score b { color: ${theme.accent}; font-variant-numeric: tabular-nums; }
.asteroids-hint { opacity: 0.72; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.asteroids-quit {
  flex: none; display: grid; place-items: center; width: 28px; height: 28px; margin: 0; padding: 0;
  border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer;
  font: inherit; font-size: 18px; line-height: 1;
}
.asteroids-quit:hover { background: rgba(0, 0, 0, 0.06); }
.asteroids-quit:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 1px; }
.asteroids-target {
  outline: 2px solid ${theme.accent} !important;
  outline: 2px solid color-mix(in srgb, ${theme.accent} 50%, transparent) !important;
  outline-offset: 2px !important;
}
`;
}

export class Hud {
  readonly element = document.createElement('div');
  readonly quit = document.createElement('button');
  private count = document.createElement('b');

  constructor(onQuit: () => void) {
    const text = words();
    const touch = matchMedia('(pointer: coarse)').matches;
    this.element.className = 'asteroids-hud';
    const score = document.createElement('span');
    score.className = 'asteroids-score';
    score.append(text.score + ' ', this.count);
    this.count.textContent = '0';
    const hint = document.createElement('span');
    hint.className = 'asteroids-hint';
    hint.textContent = touch ? text.touch : text.keys;
    this.quit.type = 'button';
    this.quit.className = 'asteroids-quit';
    this.quit.textContent = '×';
    this.quit.title = text.quit;
    this.quit.setAttribute('aria-label', text.quit);
    this.quit.addEventListener('click', onQuit);
    this.element.append(score, hint, this.quit);
  }

  set score(value: number) { this.count.textContent = String(value); }
}
