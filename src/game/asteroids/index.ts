// An original take on the "fly a ship over the page and shoot it apart" toy.
// Loaded on demand by the companion's game button; it starts as soon as it loads.
import { Hud, readTheme, stylesheet, words } from './hud';
import { Input } from './input';
import { Renderer } from './render';
import { advance, burst, createWorld, type World } from './sim';
import { Targets } from './targets';

class Game {
  private root = document.createElement('div');
  private style = document.createElement('style');
  private canvas = document.createElement('canvas');
  private hud: Hud;
  private input: Input;
  private targets: Targets;
  private renderer: Renderer;
  private world: World;
  private frame = 0;
  private last = 0;
  private carry = 0;
  private score = 0;
  private highlighting = false;
  private returnFocus: Element | null = document.activeElement;
  private controller = new AbortController();

  constructor(private ended: () => void) {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const theme = readTheme();
    this.style.textContent = stylesheet(theme);
    document.head.appendChild(this.style);

    this.root.className = 'asteroids-root';
    this.canvas.className = 'asteroids-canvas';
    this.canvas.tabIndex = -1;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', words().canvas);
    this.hud = new Hud(() => this.stop());
    this.root.append(this.canvas, this.hud.element);
    document.body.appendChild(this.root);

    this.renderer = new Renderer(this.canvas, theme, reduceMotion);
    this.targets = new Targets(this.root, reduceMotion);
    this.input = new Input(this.canvas, () => this.stop());
    const { width, height } = this.size();
    this.renderer.resize(width, height);
    this.world = createWorld(width, height, Date.now() >>> 0);
    burst(this.world, this.world.ship.x, this.world.ship.y);

    const signal = this.controller.signal;
    window.addEventListener('resize', () => this.resize(), { signal });
    window.addEventListener('scroll', () => this.targets.invalidate(), { signal, passive: true, capture: true });
    // A hidden tab pauses requestAnimationFrame; restart the clock rather than catch up.
    document.addEventListener('visibilitychange', () => { this.last = 0; }, { signal });

    this.canvas.focus({ preventScroll: true });
    this.frame = requestAnimationFrame(this.tick);
  }

  private size() {
    return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  }

  private resize() {
    const { width, height } = this.size();
    this.world.width = width;
    this.world.height = height;
    this.renderer.resize(width, height);
    this.targets.invalidate();
  }

  private hit = (x0: number, y0: number, x1: number, y1: number) => {
    if (!this.targets.hit(x0, y0, x1, y1)) return false;
    this.hud.score = ++this.score;
    return true;
  };

  /** Flying off an edge scrolls the page on, as if the ship carried on into it. */
  private wrap = (dx: number, dy: number) => {
    const left = window.scrollX + dx * 80;
    const top = window.scrollY + dy * this.world.height * 0.75;
    window.scrollTo({ left, top, behavior: 'instant' });
    this.targets.invalidate();
  };

  private tick = (now: number) => {
    const elapsed = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.targets.refresh(now, this.world.width, this.world.height);
    const controls = this.input.read();
    if (this.input.highlighting !== this.highlighting) {
      this.highlighting = this.input.highlighting;
      this.targets.highlight(this.highlighting);
    }
    this.carry = advance(this.world, controls, this.carry, elapsed, this.hit, this.wrap);
    this.renderer.draw(this.world, now);
    this.frame = requestAnimationFrame(this.tick);
  };

  focus() {
    this.hud.quit.focus({ preventScroll: true });
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.controller.abort();
    this.input.dispose();
    this.targets.restore();
    this.root.remove();
    this.style.remove();
    const back = this.returnFocus;
    if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
    this.ended();
    window.dispatchEvent(new CustomEvent('asteroids:end', { detail: { score: this.score } }));
  }
}

let game: Game | undefined;

function start() {
  if (game) { game.focus(); return; }
  game = new Game(() => { game = undefined; });
}

function stop() {
  game?.stop();
}

// Loading the script twice reuses the first copy.
if (!window.Asteroids) window.Asteroids = { start, stop };
window.Asteroids.start();
