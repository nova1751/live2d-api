import { translated } from './locale';

type Text = string | string[];
interface Rule { selector: string; text: Text }
interface Tips {
  mouseover: Rule[];
  click: Rule[];
  time: { hour: string; text: Text }[];
  seasons: { date: string; text: Text }[];
  message: { default: string[]; console: Text; copy: Text; visibilitychange: Text };
}

export function pick(value: Text): string {
  return Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;
}

export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let clickRules: Rule[] | undefined;
let timer: number | undefined;
let heldPlayback: object | undefined;

function clearMessage() {
  clearTimeout(timer);
  sessionStorage.removeItem('waifu-text');
  document.getElementById('waifu-tips')?.classList.remove('waifu-tips-active');
}

function display(message: string, priority: number) {
  clearTimeout(timer);
  sessionStorage.setItem('waifu-text', String(priority));
  const box = document.getElementById('waifu-tips')!;
  box.innerHTML = message;
  box.classList.add('waifu-tips-active');
}

export function say(message: Text | undefined, duration: number, priority: number) {
  if (!message || heldPlayback || Number(sessionStorage.getItem('waifu-text')) > priority) return;
  display(pick(message), priority);
  timer = setTimeout(clearMessage, duration);
}

export function showDialogue(text: string, playback?: object) {
  if (!playback) { say(escapeText(text), 5000, 11); return; }
  heldPlayback = playback;
  display(escapeText(text), 11);
}

export function showModelPreset(playback: object) {
  const canvas = document.getElementById('live2d');
  if (!canvas) return;
  const rule = clickRules?.find(({ selector }) => canvas.closest(selector));
  // A click can arrive while the site's tips file is still in flight.
  const text = rule ? pick(rule.text) : clickRules ? undefined : translated('指挥官，我在。', 'Right here, Commander.');
  if (!text) return;
  heldPlayback = playback;
  display(text.replace('{text}', () => escapeText(canvas.textContent ?? '')), 11);
}

export function finishDialogue(playback: object, interrupted: boolean) {
  if (heldPlayback !== playback) return;
  heldPlayback = undefined;
  if (interrupted) clearMessage();
  else timer = setTimeout(clearMessage, 1200);
}

function welcome(times: Tips['time']): Text {
  if (location.pathname === '/') {
    const now = new Date().getHours();
    for (const { hour, text } of times) {
      const [start, end = start] = hour.split('-').map(Number);
      if (start <= now && now <= end) return text;
    }
  }
  const page = escapeText(document.title.split(' - ')[0]);
  const title = translated(`欢迎阅读<span>「${page}」</span>`, `Welcome to <span>${page}</span>!`);
  if (!document.referrer) return title;
  const { hostname } = new URL(document.referrer);
  if (hostname === location.hostname) return title;
  const engines: Record<string, string> = { baidu: '百度', so: '360搜索', google: '谷歌搜索' };
  return translated(`Hello！来自 <span>${escapeText(engines[hostname.split('.')[1]] ?? hostname)}</span> 的朋友<br>${title}`, `Hello, visitor from <span>${escapeText(hostname)}</span>!<br>${title}`);
}

function dayNumber(date: string) {
  const [month, day] = date.split('/').map(Number);
  return month * 100 + day;
}

export function bindMessages(tips: Tips) {
  clickRules = tips.click;
  const idleMessages = [...tips.message.default];
  const now = new Date();
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  for (const { date, text } of tips.seasons) {
    const [start, end = start] = date.split('-').map(dayNumber);
    if (start <= today && today <= end) {
      idleMessages.push(pick(text).replace('{year}', String(now.getFullYear())));
    }
  }
  const idleDelay = 20000;
  let lastActivity = Date.now();
  let idleTimer: number | undefined;
  function tick() {
    if (document.hidden) return;
    const remaining = idleDelay - (Date.now() - lastActivity);
    if (remaining <= 0 && !localStorage.getItem('waifu-display')) say(idleMessages, 6000, 9);
    idleTimer = setTimeout(tick, remaining > 0 ? remaining : idleDelay);
  }
  const markActive = () => { lastActivity = Date.now(); };
  window.addEventListener('pointermove', markActive, { passive: true });
  window.addEventListener('pointerdown', markActive, { passive: true });
  window.addEventListener('keydown', markActive);
  if (!document.hidden) idleTimer = setTimeout(tick, idleDelay);
  say(welcome(tips.time), 7000, 11);

  let previousSelector: string | undefined;
  for (const event of ['mouseover', 'click'] as const) {
    window.addEventListener(event, input => {
      const target = input.target;
      if (!(target instanceof Element) || input.live2dHandlesCaption) return;
      const stage = target.closest('.waifu-hit') || (event === 'click' && target.closest('#waifu .waifu-model-stage'));
      const canvas = stage ? document.getElementById('live2d') : target.closest('#live2d');
      const rule = tips[event].find(({ selector }) => target.closest(selector) || (stage && canvas?.closest(selector)));
      if (!rule || (event === 'mouseover' && rule.selector === previousSelector)) return;
      if (event === 'mouseover') previousSelector = rule.selector;
      say(pick(rule.text).replace('{text}', () => escapeText(target.textContent ?? '')), 4000, event === 'click' && canvas ? 11 : 8);
    });
  }
  const consoleGreeting = () => {};
  consoleGreeting.toString = () => { say(tips.message.console, 6000, 9); return ''; };
  console.log('%c', consoleGreeting);
  window.addEventListener('copy', () => say(tips.message.copy, 6000, 9));
  document.addEventListener('visibilitychange', () => {
    clearTimeout(idleTimer);
    if (!document.hidden) {
      markActive();
      idleTimer = setTimeout(tick, idleDelay);
      if (!localStorage.getItem('waifu-display')) say(tips.message.visibilitychange, 6000, 9);
    }
  });
}
