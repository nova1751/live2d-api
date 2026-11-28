import type { Theme } from './hud';
import type { World } from './sim';

const ALPHA_STEPS = 4;

export class Renderer {
  private context: CanvasRenderingContext2D;
  private flame: CanvasGradient;
  private width = 0;
  private height = 0;

  constructor(private canvas: HTMLCanvasElement, private theme: Theme, private reduceMotion: boolean) {
    this.context = canvas.getContext('2d')!;
    this.flame = this.context.createLinearGradient(-14, 0, -30, 0);
    this.flame.addColorStop(0, '#f6d28b');
    this.flame.addColorStop(0.55, '#f2a65a');
    this.flame.addColorStop(1, 'rgba(242, 166, 90, 0)');
  }

  /** Match the canvas buffer to its CSS size at the screen's pixel density. */
  resize(width: number, height: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  draw(world: World, time: number) {
    const ctx = this.context;
    const { accent, sparks } = this.theme;
    ctx.clearRect(0, 0, this.width, this.height);

    // Bullets: one path, each a short streak trailing behind its dot.
    ctx.beginPath();
    for (const bullet of world.bullets) {
      if (!bullet.active) continue;
      ctx.moveTo(bullet.x - bullet.vx * 0.018, bullet.y - bullet.vy * 0.018);
      ctx.lineTo(bullet.x, bullet.y);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent;
    ctx.stroke();

    // Sparks fade out over their life; group them by colour and a few opacity steps.
    for (let tone = 0; tone < sparks.length; tone++) {
      for (let step = 0; step < ALPHA_STEPS; step++) {
        ctx.beginPath();
        let any = false;
        for (const particle of world.particles) {
          if (!particle.active || particle.tone !== tone) continue;
          const left = 1 - particle.age / particle.life;
          if (Math.min(ALPHA_STEPS - 1, Math.floor(left * ALPHA_STEPS)) !== step) continue;
          const radius = 1 + left * 1.6;
          ctx.moveTo(particle.x + radius, particle.y);
          ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
          any = true;
        }
        if (!any) continue;
        ctx.globalAlpha = (step + 1) / ALPHA_STEPS;
        ctx.fillStyle = sparks[tone];
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    const { ship } = world;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    if (ship.thrusting) {
      const flicker = this.reduceMotion ? 0 : Math.sin(time / 40) * 2 + Math.sin(time / 23) * 1.5;
      ctx.beginPath();
      ctx.moveTo(-11, -6);
      ctx.quadraticCurveTo(-24 - flicker, 0, -11, 6);
      ctx.closePath();
      ctx.fillStyle = this.flame;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-13, -10);
    ctx.quadraticCurveTo(-8, 0, -13, 10);
    ctx.closePath();
    // The classic ship: white with a black outline, readable on light and dark pages alike.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
