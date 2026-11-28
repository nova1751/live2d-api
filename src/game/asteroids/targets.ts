// Finds what on the page can be shot, keeps its boxes in a grid and hides what gets hit.
// Hit tests are pure geometry against cached boxes: no elementFromPoint, no layout per bullet.
import { TargetGrid, type Candidate, type Rect } from './sim';

interface Target extends Candidate { element: Element }

const SKIPPED = new Set(['head', 'script', 'style', 'link', 'meta', 'title', 'noscript', 'template', 'br', 'wbr', 'source', 'track', 'param', 'area', 'map', 'option', 'optgroup', 'datalist']);
/** Shot whole: their insides are drawn by the browser or by the element itself. */
const ATOMIC = new Set(['img', 'svg', 'canvas', 'video', 'audio', 'iframe', 'object', 'embed', 'picture', 'input', 'textarea', 'select', 'progress', 'meter', 'hr', 'math']);
/** Rebuild at least this often so moving or animated content stays hittable. */
const MAX_AGE = 500;
/** Coalesce rebuilds while the page keeps changing or scrolling. */
const MIN_GAP = 100;
const FADE = 160;
const MARGIN = 64;

function transparent(color: string) {
  return color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color);
}

export class Targets {
  private grid = new TargetGrid<Target>();
  private targets: Target[] = [];
  private painted = new WeakMap<Element, boolean>();
  /** Elements this game hid, with the inline visibility each had before. */
  private hidden = new Map<HTMLElement | SVGElement, [string, string]>();
  private fading = new Set<Animation>();
  private highlighted: Element[] = [];
  private observer: MutationObserver;
  private dirty = true;
  private builtAt = -Infinity;
  private scrollX = 0;
  private scrollY = 0;
  private width = 0;
  private height = 0;

  constructor(private own: Element, private reduceMotion: boolean) {
    this.observer = new MutationObserver(records => {
      if (records.some(record => !own.contains(record.target))) this.dirty = true;
    });
    this.observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  }

  invalidate() { this.dirty = true; }

  /** Rebuild the index when the page changed, throttled; call once per frame. */
  refresh(now: number, width: number, height: number) {
    const age = now - this.builtAt;
    if (width !== this.width || height !== this.height) this.dirty = true;
    if (!(this.dirty && age >= MIN_GAP) && age < MAX_AGE) return;
    this.width = width;
    this.height = height;
    this.dirty = false;
    this.builtAt = now;
    this.scrollX = window.scrollX;
    this.scrollY = window.scrollY;
    this.targets = [];
    this.visit(document.body, 0);
    this.grid.build(this.targets);
  }

  /** The deepest target on a bullet's path this step, in viewport coordinates. */
  hit(x0: number, y0: number, x1: number, y1: number): Element | undefined {
    // Boxes were measured at the last rebuild; shift the path by any scroll since then.
    const dx = window.scrollX - this.scrollX;
    const dy = window.scrollY - this.scrollY;
    const target = this.grid.query(x0 + dx, y0 + dy, x1 + dx, y1 + dy, 2);
    if (!target) return undefined;
    target.dead = true;
    this.destroy(target.element as HTMLElement | SVGElement);
    return target.element;
  }

  /** Outline everything that can be shot right now. */
  highlight(on: boolean) {
    for (const element of this.highlighted) element.classList.remove('asteroids-target');
    this.highlighted = on ? this.targets.filter(target => !target.dead).map(target => target.element) : [];
    for (const element of this.highlighted) element.classList.add('asteroids-target');
  }

  /** Bring back everything the game hid. */
  restore() {
    this.observer.disconnect();
    this.highlight(false);
    for (const animation of this.fading) animation.cancel();
    this.fading.clear();
    for (const [element, [value, priority]] of this.hidden) {
      if (value) element.style.setProperty('visibility', value, priority);
      else element.style.removeProperty('visibility');
    }
    this.hidden.clear();
  }

  private destroy(element: HTMLElement | SVGElement) {
    if (!this.hidden.has(element)) {
      this.hidden.set(element, [element.style.getPropertyValue('visibility'), element.style.getPropertyPriority('visibility')]);
    }
    const hide = () => element.style.setProperty('visibility', 'hidden', 'important');
    if (this.reduceMotion || typeof element.animate !== 'function') { hide(); return; }
    // Fade from whatever opacity and scale the element has now; both stay on the compositor.
    const animation = element.animate([{ opacity: 0, scale: '0.85' }], { duration: FADE, easing: 'ease-in', fill: 'forwards' });
    this.fading.add(animation);
    animation.finished.then(() => {
      hide();
      animation.cancel();
    }, () => {}).finally(() => this.fading.delete(animation));
  }

  /** Whether the element draws anything itself, apart from its children. Cached per element. */
  private paints(element: Element, style: CSSStyleDeclaration) {
    const known = this.painted.get(element);
    if (known !== undefined) return known;
    let paints = ATOMIC.has(element.localName)
      || (element.localName.includes('-') && !element.firstElementChild)
      || !!(element.shadowRoot && !element.firstElementChild)
      || !transparent(style.backgroundColor)
      || style.backgroundImage !== 'none'
      || style.boxShadow !== 'none'
      || (['Top', 'Right', 'Bottom', 'Left'] as const).some(side =>
        parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none' && !transparent(style[`border${side}Color`]));
    if (!paints) {
      for (let node = element.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent!.trim()) { paints = true; break; }
      }
    }
    // Icon fonts and decorations drawn by ::before or ::after on an otherwise empty element.
    if (!paints && !element.firstElementChild) {
      paints = ['::before', '::after'].some(pseudo => {
        const content = getComputedStyle(element, pseudo).content;
        return content !== 'none' && content !== 'normal' && content !== '""';
      });
    }
    this.painted.set(element, paints);
    return paints;
  }

  /** Index the subtree. Returns whether anything visible is left in it. */
  private visit(element: Element, depth: number, layer = 0): boolean {
    // Already shot, possibly still fading out: neither it nor its contents count any more.
    if (element === this.own || SKIPPED.has(element.localName) || this.hidden.has(element as HTMLElement)) return false;
    // display:none, content-visibility:hidden or a closed <details> hides the whole subtree.
    if (element.checkVisibility && !element.checkVisibility()) return false;
    const style = getComputedStyle(element);
    // Fixed and sticky boxes, such as the companion or a header, are drawn over the page that
    // scrolls beneath them; so are positioned boxes lifted by z-index.
    if (style.position === 'fixed' || style.position === 'sticky') layer += 2;
    else if (style.position !== 'static' && parseInt(style.zIndex, 10) > 0) layer += 1;
    const atomic = ATOMIC.has(element.localName);
    let inside = false;
    if (!atomic) {
      for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
        if (this.visit(child, depth + 1, layer)) inside = true;
      }
    }
    if (element === document.body) return inside;
    if (style.visibility !== 'visible' || style.opacity === '0') return inside;
    if (!this.paints(element, style)) return inside;
    const boxes = element.getClientRects();
    const rects: Rect[] = [];
    let area = 0;
    let shown = false;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index];
      if (box.width < 1 || box.height < 1) continue;
      shown = true;
      if (box.right < -MARGIN || box.bottom < -MARGIN || box.left > this.width + MARGIN || box.top > this.height + MARGIN) continue;
      rects.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
      area += box.width * box.height;
    }
    if (!shown) return inside;
    // A page-sized background goes only once what is drawn on it is gone, not with one stray shot.
    const backdrop = inside && area > this.width * this.height * 0.5;
    if (rects.length && !backdrop) this.targets.push({ element, depth, layer, rects });
    return true;
  }
}
