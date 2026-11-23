/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
import { loadModelCatalog, loadGirlsFrontline, selectWidgetModel } from "../widget.mjs";
const catalogUrl = new URL("./library.json", import.meta.url);
const find = (id) => document.getElementById(id);
const locale = new URL(location.href).searchParams.get("lang") === "en" ? "en" : "zh-CN";
const english = locale === "en";
const t = (zh, en) => english ? en : zh;
const language = find("language");
if (english) {
  document.documentElement.lang = locale;
  for (const el of Array.from(document.querySelectorAll("[data-en]"))) el.textContent = el.dataset.en;
  for (const name of ["aria-label", "placeholder", "alt"]) {
    for (const el of Array.from(document.querySelectorAll("[data-en-" + name + "]"))) el.setAttribute(name, el.getAttribute("data-en-" + name));
  }
  const guide = document.querySelector('a[href*="README.zh-CN"]');
  guide.href = "https://github.com/nova1751/live2d-api#quick-start";
  language.textContent = "简体中文";
  language.lang = language.hreflang = "zh-CN";
}
function updateLanguageLink() {
  const target = new URL(location.href);
  target.searchParams.set("lang", english ? "zh-CN" : "en");
  language.href = target.href;
}
updateLanguageLink();
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
const portrait = (id) => "./portraits/" + encodeURIComponent(id.split("/").join("--")) + ".webp";
const attachWidget = () => {
  for (const child of Array.from(document.body.querySelectorAll(":scope > #waifu, :scope > #waifu-toggle"))) host.append(child);
};
new MutationObserver(attachWidget).observe(document.body, { childList: true });
const firstPaint = new MutationObserver(() => {
  if (host.querySelector("#waifu:not([data-model-loading]) canvas") && result.dataset.model) {
    poster.hidden = true;
    firstPaint.disconnect();
  }
});
firstPaint.observe(host, { attributes: true, childList: true, subtree: true });
try {
  let highlight = function() {
    for (const button of Array.from(cards.querySelectorAll("button[data-id]"))) {
      const row = byId.get(button.dataset.id);
      button.setAttribute("aria-pressed", String(groupCards ? row.character === active.character : row.id === active.id));
    }
  }, drawCards = function() {
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
    const fragment = document.createDocumentFragment();
    for (const row of items.slice(0, limit)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card";
      button.dataset.id = row.id;
      button.disabled = !ready;
      const art = document.createElement("span");
      art.className = "art" + (["background", "squad"].includes(row.kind) ? " wide" : "");
      const image = document.createElement("img");
      image.alt = "";
      image.width = image.height = 240;
      image.loading = "lazy";
      image.decoding = "async";
      image.src = portrait(row.id);
      art.append(image);
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
    cards.replaceChildren(fragment);
    highlight();
    find("matches").textContent = items.length ? t("显示 ", "Showing ") + Math.min(limit, items.length) + " / " + items.length + t(" 项", " results") : t("没有匹配的模型，请更换关键词或分类。", "No matches. Try another name or category.");
    more.hidden = limit >= items.length;
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
  const library = await loadModelCatalog(catalogUrl, "girls-frontline", locale);
  const models = library.ids.map((id) => {
    const [kind, code, version, state] = id.split("/");
    const character = kind + "/" + code;
    const name = library.labels[character] || names[code] || code.toUpperCase();
    const outfit = library.labels[character + "/" + version]?.replace(name + "-", "") || (kind === "fairy" ? tiers : versions)[version] || version;
    const form = [outfit, states[state]].filter(Boolean).join(" · ");
    return { id, kind, character, name, form, terms: [id, name, form, categories[kind]].join(" ").toLowerCase() };
  });
  const byId = new Map(models.map((model) => [model.id, model]));
  const groups = /* @__PURE__ */ new Map();
  for (const model of models) {
    if (!groups.has(model.character)) groups.set(model.character, []);
    groups.get(model.character).push(model);
  }
  if (!models.length) throw new Error(t("目录中没有可预览的模型", "The catalog has no models to preview."));
  for (const kind of new Set(models.map((model) => model.kind))) category.add(new Option(categories[kind] ?? kind, kind));
  find("totals").textContent = groups.size + t(" 个图鉴条目　/　", " entries / ") + models.length + t(" 个造型", " forms");
  const requested = new URL(location.href).searchParams.get("model");
  const initial = byId.get(library.visibleId(requested ?? "")) ?? models[0];
  let active = initial, groupCards = true, limit = 24, revision = 0;
  let ready = false;
  async function select(id) {
    const ticket = ++revision;
    notice.textContent = t("正在载入…", "Loading…");
    try {
      await selectWidgetModel(id);
      if (ticket === revision) notice.textContent = "";
    } catch (error) {
      if (ticket === revision) {
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
      limit = 24;
      drawCards();
    });
  }
  search.addEventListener("input", () => {
    limit = 24;
    drawCards();
  });
  category.addEventListener("change", () => {
    limit = 24;
    drawCards();
  });
  more.addEventListener("click", () => {
    const previous = cards.childElementCount;
    limit += 24;
    drawCards();
    cards.querySelectorAll("button")[previous]?.focus({ preventScroll: true });
  });
  find("share").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      notice.textContent = t("预览链接已复制", "Preview link copied.");
    } catch {
      notice.textContent = location.href;
    }
  });
  window.addEventListener("live2d:model", (event) => {
    const id = event.detail;
    const row = byId.get(library.visibleId(id));
    if (!row) return;
    describe(row);
    result.dataset.model = id;
    const url = new URL(location.href);
    url.searchParams.set("model", id);
    history.replaceState(null, "", url);
    updateLanguageLink();
  });
  describe(initial);
  poster.src = portrait(initial.id);
  poster.hidden = false;
  drawCards();
  await loadGirlsFrontline({ locale, catalogUrl, modelId: initial.id, coreUrl: document.documentElement.dataset.coreUrl });
  attachWidget();
  ready = true;
  variant.disabled = false;
  drawCards();
} catch (error) {
  notice.textContent = t("图鉴载入失败。", "Could not load the gallery. ") + (error instanceof Error ? error.message : String(error));
}
