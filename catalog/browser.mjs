/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
import { cdnPreference, loadModelCatalog, loadWidget, selectWidgetModel, setCdnPreference } from "../widget.mjs";
const gameNames = {
  "girls-frontline": ["少女前线", "Girls’ Frontline"],
  "azur-lane": ["碧蓝航线", "Azur Lane"],
  "bang-dream": ["BanG Dream!", "BanG Dream!"],
  houkai2: ["崩坏学园 2", "Guns GirlZ"],
  "iron-saga": ["机动战队", "Iron Saga"],
  "warship-girls": ["战舰少女 R", "Warship Girls R"],
  "baoshi-yanwuyu": ["宝石研物语", "Baoshi Yanwuyu"]
};
const requestedGame = new URL(location.href).searchParams.get("collection") ?? "";
const game = Object.prototype.hasOwnProperty.call(gameNames, requestedGame) ? requestedGame : "girls-frontline";
const catalogUrl = new URL(game === "girls-frontline" ? "./library.json" : "./games/" + game + ".json", import.meta.url);
const find = (id) => document.getElementById(id);
const locale = new URL(location.href).searchParams.get("lang") === "en" ? "en" : "zh-CN";
const english = locale === "en";
const t = (zh, en) => english ? en : zh;
const language = find("language");
function updateLanguageLink() {
  const target = new URL(location.href);
  target.searchParams.set("lang", english ? "zh-CN" : "en");
  language.href = target.href;
}
updateLanguageLink();
addEventListener("pageswap", (event) => {
  if (scrollY > 0) event.viewTransition?.skipTransition();
});
for (const link of Array.from(document.querySelectorAll("[data-game]"))) {
  const warm = () => {
    const name = link.dataset.game;
    if (name === game) return;
    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.href = new URL(name === "girls-frontline" ? "./library.json" : "./games/" + name + ".json", import.meta.url).href;
    document.head.append(hint);
  };
  link.addEventListener("pointerenter", warm, { once: true });
  link.addEventListener("focus", warm, { once: true });
  link.addEventListener("touchstart", warm, { once: true, passive: true });
}
const search = find("search");
const category = find("category");
const variant = find("variant");
const cards = find("cards");
const result = find("result");
const notice = find("notice");
const poster = find("poster");
const more = find("more");
const host = find("model-host");
const categories = english ? { fairy: "Fairy", doll: "T-Doll", adjutant: "Adjutant", npc: "NPC", squad: "Squad", background: "Background" } : { fairy: "妖精", doll: "人形", adjutant: "副官", npc: "其他人物", squad: "小队", background: "背景" };
const names = english ? {
  air_attack: "Airstrike Fairy",
  airborne: "Parachute Fairy",
  armor: "Armor Fairy",
  command: "Command Fairy",
  fighting: "Warrior Fairy",
  fortress: "Fortress Fairy",
  golden: "Golden Fairy",
  shield: "Shield Fairy",
  target: "Taunt Fairy",
  npc_kalina: "Kalina",
  gelina: "Kalina",
  william: "William",
  "m4-sopmod-ii": "M4 SOPMOD II"
} : {
  air_attack: "空袭妖精",
  airborne: "空降妖精",
  armor: "装甲妖精",
  command: "指挥妖精",
  fighting: "勇士妖精",
  fortress: "工事妖精",
  golden: "黄金妖精",
  shield: "护盾妖精",
  target: "嘲讽妖精",
  "m4-sopmod-ii": "M4 SOPMOD II",
  npc_kalina: "格琳娜",
  gelina: "格琳娜",
  william: "威廉"
};
const versions = english ? { base: "Original", mod: "Neural upgrade", archive: "Archive", "archive-alt": "Archive (alternate)", "archive-christmas": "Christmas archive" } : { base: "原版", mod: "心智升级", archive: "旧档", "archive-alt": "旧档·另一造型", "archive-christmas": "圣诞旧档" };
const tiers = english ? { "1": "Tier 1", "2": "Tier 2", "3": "Tier 3" } : { "1": "一阶", "2": "二阶", "3": "三阶" };
const states = english ? { normal: "Standard", destroy: "Damaged" } : { normal: "标准", destroy: "战损" };
Object.assign(categories, { ship: t("舰船", "Ships"), character: t("角色", "Characters"), hhw: "Hello, Happy World!", afterglow: "Afterglow", avemujica: "Ave Mujica", morfonica: "Morfonica", mygo: "MyGO!!!!!", pastelpalettes: "Pastel＊Palettes", poppinparty: "Poppin’Party", ras: "RAISE A SUILEN", roselia: "Roselia" });
const gflPortrait = (id) => "./portraits/" + encodeURIComponent(id.split("/").join("--")) + ".webp";
const mirror = "https://cdn.jsdmirror.com/gh/";
function portraitFallback(image) {
  image.addEventListener("error", () => {
    if (image.src.startsWith(mirror)) image.src = "https://cdn.jsdelivr.net/gh/" + image.src.slice(mirror.length);
  });
}
portraitFallback(find("poster"));
async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    notice.textContent = done;
  } catch {
    notice.textContent = text;
  }
}
const themeKey = "live2d-gallery-theme";
const prefersDark = matchMedia("(prefers-color-scheme: dark)");
const themeButton = find("theme");
const themeColors = { light: "#f4f6f2", dark: "#0d1412" };
function applyTheme() {
  const root = document.documentElement;
  const chosen = root.dataset.theme;
  const effective = chosen === "light" || chosen === "dark" ? chosen : prefersDark.matches ? "dark" : "light";
  root.dataset.themeEffective = effective;
  themeButton.setAttribute("aria-label", effective === "dark" ? t("切换到浅色模式", "Switch to light mode") : t("切换到深色模式", "Switch to dark mode"));
  for (const meta of Array.from(document.querySelectorAll('meta[name="theme-color"]'))) {
    meta.content = chosen ? themeColors[effective] : themeColors[meta.media.includes("dark") ? "dark" : "light"];
  }
}
themeButton.addEventListener("click", () => {
  const next = document.documentElement.dataset.themeEffective === "dark" ? "light" : "dark";
  const follow = next === (prefersDark.matches ? "dark" : "light");
  try {
    if (follow) localStorage.removeItem(themeKey);
    else localStorage.setItem(themeKey, next);
  } catch {
  }
  if (follow) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  applyTheme();
});
prefersDark.addEventListener("change", applyTheme);
applyTheme();
const cdnChoice = new URL(location.href).searchParams.get("cdn");
if (cdnChoice === "mainland" || cdnChoice === "global") setCdnPreference(cdnChoice, false);
const embedCode = () => '<script type="module" src="' + (cdnPreference() === "mainland" ? "https://cdn.jsdmirror.com" : "https://cdn.jsdelivr.net") + "/gh/nova1751/live2d-api@widget-latest/collections.mjs?collection=" + game + (english ? "&lang=en" : "") + '"><\/script>';
const showEmbedCode = () => {
  find("embed-code").textContent = embedCode();
};
showEmbedCode();
find("embed").addEventListener("toggle", showEmbedCode);
find("copy-embed").addEventListener("click", () => void copyText(embedCode(), t("接入代码已复制", "Embed code copied.")));
const attachWidget = () => {
  for (const child of Array.from(document.body.querySelectorAll(":scope > #waifu, :scope > #waifu-toggle"))) {
    (child.id === "waifu-toggle" ? find("stage") : host).append(child);
  }
};
new MutationObserver(attachWidget).observe(document.body, { childList: true });
try {
  let highlight = function() {
    for (const button of Array.from(cards.querySelectorAll("button[data-id]"))) {
      const row = byId.get(button.dataset.id);
      button.setAttribute("aria-pressed", String(groupCards ? row.character === active.character : row.id === active.id));
    }
  }, drawCards = function(reset = true) {
    if (reset) {
      limit = batchTarget;
      cards.replaceChildren();
    }
    const term = search.value.trim().toLowerCase();
    let items = models.filter((row) => (!category.value || row.kind === category.value) && row.terms.includes(term));
    if (groupCards) {
      const seen = /* @__PURE__ */ new Set();
      items = items.filter((row) => {
        if (seen.has(row.character)) return false;
        seen.add(row.character);
        return true;
      });
    }
    const rowLimit = Math.ceil(limit / columns) * columns;
    const count = items.length - rowLimit < columns ? items.length : rowLimit;
    while (cards.childElementCount > count) cards.lastElementChild.remove();
    const fragment = document.createDocumentFragment();
    for (const row of items.slice(cards.childElementCount, count)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card";
      button.dataset.id = row.id;
      button.dataset.tone = tones.get(row.kind);
      button.disabled = !ready;
      const art = document.createElement("span");
      art.className = "art" + (["background", "squad"].includes(row.kind) ? " wide" : "");
      const image = document.createElement("img");
      image.alt = "";
      image.width = image.height = 240;
      image.loading = "lazy";
      image.decoding = "async";
      portraitFallback(image);
      const thumbnail = portrait(row.id);
      if (thumbnail) {
        image.addEventListener("load", () => image.classList.add("loaded"));
        image.src = thumbnail;
        art.append(image);
      } else art.textContent = row.name.slice(0, 2);
      const caption = document.createElement("span");
      caption.className = "caption";
      const name = document.createElement("strong");
      name.textContent = row.name;
      const sub = document.createElement("small");
      sub.textContent = groupCards ? categories[row.kind] + " · " + groups.get(row.character).length + t(" 个造型", groups.get(row.character).length === 1 ? " form" : " forms") : row.form;
      caption.append(name, sub);
      button.append(art, caption);
      fragment.append(button);
    }
    cards.append(fragment);
    cards.removeAttribute("aria-busy");
    highlight();
    find("matches").textContent = items.length ? t("显示 ", "Showing ") + count + " / " + items.length + t(" 项", " results") : t("没有匹配的模型，请更换关键词或分类。", "No matches. Try another name or category.");
    more.hidden = count >= items.length;
  }, describe = function(row) {
    active = row;
    find("model-category").textContent = categories[row.kind];
    find("model-name").textContent = row.name;
    result.textContent = row.id;
    variant.replaceChildren(...groups.get(row.character).map((item) => new Option(item.form, item.id)));
    variant.value = row.id;
    const manifest = find("manifest");
    manifest.href = library.resolve(row.id).modelUrl;
    manifest.hidden = false;
    highlight();
  };
  var highlight2 = highlight, drawCards2 = drawCards, describe2 = describe;
  notice.textContent = t("正在载入图鉴…", "Loading catalog…");
  const library = await loadModelCatalog(catalogUrl, game, locale, cdnPreference() === "mainland" ? "mainland" : void 0);
  notice.textContent = "";
  const portrait = (id) => library.gallery ? library.gallery[id]?.portrait : gflPortrait(id);
  const models = library.ids.map((id) => {
    const [kind, code, version, state] = id.split("/");
    const character = kind + "/" + code;
    const entry = library.gallery?.[id];
    if (entry) {
      const name2 = english && entry.en || entry.name;
      const form2 = english && entry.outfitEn || entry.outfit;
      return { id, kind, character, name: name2, form: form2, terms: [id, name2, entry.name, form2, entry.outfit, categories[kind]].join(" ").toLowerCase() };
    }
    const name = library.labels[character] || names[code] || code.toUpperCase();
    const outfit = library.labels[character + "/" + version]?.replace(name + "-", "") || (kind === "fairy" ? tiers : versions)[version] || version;
    const form = [outfit, states[state]].filter(Boolean).join(" · ");
    return { id, kind, character, name, form, terms: [id, name, form, categories[kind]].join(" ").toLowerCase() };
  });
  if (library.gallery) models.sort((a, b) => a.name.localeCompare(b.name, locale) || (library.gallery[a.id].date ?? Infinity) - (library.gallery[b.id].date ?? Infinity) || a.id.localeCompare(b.id, "en", { numeric: true }));
  const byId = new Map(models.map((model) => [model.id, model]));
  const groups = /* @__PURE__ */ new Map();
  for (const model of models) {
    if (!groups.has(model.character)) groups.set(model.character, []);
    groups.get(model.character).push(model);
  }
  if (!models.length) throw new Error(t("目录中没有可预览的模型", "The catalog has no models to preview."));
  const kinds = [...new Set(models.map((model) => model.kind))];
  for (const kind of kinds) category.add(new Option(categories[kind] ?? kind, kind));
  const tones = new Map(kinds.map((kind, index) => [kind, String(index % 6)]));
  const stat = (value, label) => {
    const chip = document.createElement("span");
    chip.className = "stat";
    const number = document.createElement("b");
    number.textContent = value.toLocaleString(locale);
    const text = document.createElement("span");
    text.textContent = label;
    chip.append(number, text);
    return chip;
  };
  find("totals").replaceChildren(stat(groups.size, t("个图鉴条目", groups.size === 1 ? "entry" : "entries")), stat(models.length, t("个造型", models.length === 1 ? "form" : "forms")));
  const requested = new URL(location.href).searchParams.get("model");
  const initial = byId.get(library.visibleId(requested ?? "")) ?? models[0];
  const batchTarget = 24;
  const gridColumns = () => getComputedStyle(cards).gridTemplateColumns.trim().split(/\s+/).length;
  let columns = gridColumns(), limit = batchTarget;
  let active = initial, groupCards = true, revision = 0;
  let ready = false, modelShown = false;
  const motion = find("motion");
  window.addEventListener("live2d:motions", (event) => {
    if (game === "girls-frontline") return;
    const clips = event.detail;
    motion.replaceChildren(...clips.map(({ group, index, voiced }) => new Option(
      group + " · " + (index + 1) + (voiced ? t(" · 原声", " · voiced") : ""),
      JSON.stringify([group, index])
    )));
    find("audition").hidden = !clips.length;
  });
  find("play-motion").addEventListener("click", () => {
    if (motion.value) {
      const [group, index] = JSON.parse(motion.value);
      window.loadlive2d.playMotion?.(group, index);
    }
  });
  async function select(id) {
    const audition = find("audition");
    audition.hidden = true;
    const ticket = ++revision;
    notice.textContent = t("正在载入…", "Loading…");
    try {
      await selectWidgetModel(id);
      if (ticket === revision) notice.textContent = "";
    } catch (error) {
      if (ticket === revision) {
        audition.hidden = !motion.options.length || !!document.querySelector("#waifu[data-model-error]");
        variant.value = active.id;
        notice.textContent = t("模型载入失败，可重新选择。", "Could not load this model. Try selecting it again. ") + (error instanceof Error ? error.message : "");
      }
    }
  }
  cards.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    void select(button.dataset.id);
    const preview = find("stage");
    if (preview.getBoundingClientRect().bottom < 0) preview.scrollIntoView({ block: "start" });
  });
  variant.addEventListener("change", () => void select(variant.value));
  for (const [id, grouped] of [["by-character", true], ["by-form", false]]) {
    find(id).addEventListener("click", () => {
      groupCards = grouped;
      find("by-character").setAttribute("aria-pressed", String(grouped));
      find("by-form").setAttribute("aria-pressed", String(!grouped));
      drawCards();
    });
  }
  search.addEventListener("input", () => drawCards());
  category.addEventListener("change", () => drawCards());
  more.addEventListener("click", () => {
    const previous = cards.childElementCount;
    limit = previous + batchTarget;
    drawCards(false);
    cards.querySelectorAll("button")[previous]?.focus({ preventScroll: true });
  });
  find("share").addEventListener("click", () => void copyText(location.href, t("预览链接已复制", "Preview link copied.")));
  window.addEventListener("live2d:model", (event) => {
    const id = event.detail;
    const row = byId.get(library.visibleId(id));
    if (!row) return;
    describe(row);
    if (!modelShown) {
      modelShown = true;
      poster.classList.add("leaving");
      setTimeout(() => {
        poster.hidden = true;
      }, 400);
    }
    result.dataset.model = id;
    const url = new URL(location.href);
    url.searchParams.set("model", id);
    history.replaceState(null, "", url);
    updateLanguageLink();
  });
  new ResizeObserver(() => {
    const next = gridColumns();
    if (next === columns) return;
    columns = next;
    drawCards(false);
  }).observe(cards);
  describe(initial);
  const initialPortrait = portrait(initial.id);
  if (initialPortrait) {
    poster.src = initialPortrait;
    poster.decode().catch(() => {
    }).then(() => {
      if (!modelShown) poster.hidden = false;
    });
  }
  drawCards();
  await loadWidget({ catalog: library, modelId: initial.id, coreUrl: document.documentElement.dataset.coreUrl });
  attachWidget();
  ready = true;
  variant.disabled = false;
  for (const button of Array.from(cards.querySelectorAll("button[data-id]"))) button.disabled = false;
} catch (error) {
  notice.textContent = t("图鉴载入失败。", "Could not load the gallery. ") + (error instanceof Error ? error.message : String(error));
}
