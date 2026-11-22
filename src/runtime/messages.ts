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

let timer: number | undefined;
export function say(message: Text | undefined, duration: number, priority: number) {
  if (!message || Number(sessionStorage.getItem('waifu-text')) > priority) return;
  const box = document.getElementById('waifu-tips')!;
  if (timer !== undefined) clearTimeout(timer);
  sessionStorage.setItem('waifu-text', String(priority));
  box.innerHTML = pick(message);
  box.classList.add('waifu-tips-active');
  timer = setTimeout(() => {
    sessionStorage.removeItem('waifu-text');
    box.classList.remove('waifu-tips-active');
  }, duration);
}

function welcome(times: Tips['time']): Text {
  if (location.pathname === '/') {
    const now = new Date().getHours();
    for (const { hour, text } of times) {
      const [start, end = start] = hour.split('-').map(Number);
      if (start <= now && now <= end) return text;
    }
  }
  const title = `欢迎阅读<span>「${escapeText(document.title.split(' - ')[0])}」</span>`;
  if (!document.referrer) return title;
  const { hostname } = new URL(document.referrer);
  if (hostname === location.hostname) return title;
  const engines: Record<string, string> = { baidu: '百度', so: '360搜索', google: '谷歌搜索' };
  return `Hello！来自 <span>${escapeText(engines[hostname.split('.')[1]] ?? hostname)}</span> 的朋友<br>${title}`;
}

function dayNumber(date: string) {
  const [month, day] = date.split('/').map(Number);
  return month * 100 + day;
}

export function bindMessages(tips: Tips) {
  const idleMessages = [...tips.message.default];
  const now = new Date();
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  for (const { date, text } of tips.seasons) {
    const [start, end = start] = date.split('-').map(dayNumber);
    if (start <= today && today <= end) {
      idleMessages.push(pick(text).replace('{year}', String(now.getFullYear())));
    }
  }
  let active = false;
  let idleTimer: number | undefined;
  const markActive = () => { active = true; };
  window.addEventListener('mousemove', markActive);
  window.addEventListener('keydown', markActive);
  setInterval(() => {
    if (active) {
      active = false;
      clearInterval(idleTimer);
      idleTimer = undefined;
    } else if (idleTimer === undefined) {
      idleTimer = setInterval(() => say(idleMessages, 6000, 9), 20000);
    }
  }, 1000);
  say(welcome(tips.time), 7000, 11);

  let previousSelector: string | undefined;
  for (const event of ['mouseover', 'click'] as const) {
    window.addEventListener(event, ({ target }) => {
      if (!(target instanceof Element)) return;
      const rule = tips[event].find(({ selector }) => target.closest(selector));
      if (!rule || (event === 'mouseover' && rule.selector === previousSelector)) return;
      if (event === 'mouseover') previousSelector = rule.selector;
      say(pick(rule.text).replace('{text}', () => escapeText(target.textContent ?? '')), 4000, 8);
    });
  }
  const consoleGreeting = () => {};
  consoleGreeting.toString = () => { say(tips.message.console, 6000, 9); return ''; };
  console.log('%c', consoleGreeting);
  window.addEventListener('copy', () => say(tips.message.copy, 6000, 9));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) say(tips.message.visibilitychange, 6000, 9);
  });
}
