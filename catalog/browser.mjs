/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
import { loadModelCatalog, loadGirlsFrontline, selectWidgetModel } from "../widget.mjs";
const catalogUrl = new URL("./library.json", import.meta.url);
const selects = ["category", "character", "version", "form"].map(
  (id) => document.querySelector("#" + id)
);
const labels = {
  doll: "少女前线 · 人形",
  fairy: "妖精",
  adjutant: "副官",
  npc: "其他人物",
  background: "背景",
  squad: "小队",
  base: "原版",
  mod: "心智升级",
  archive: "旧档",
  "archive-alt": "旧档·另一造型",
  "archive-christmas": "圣诞旧档",
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
  william: "威廉",
  normal: "普通",
  destroy: "破损",
  default: "默认"
};
const result = document.getElementById("result");
try {
  let update = function(start, preset = []) {
    let pool = ids;
    selects.forEach((select, i) => {
      if (i >= start) {
        const choices = [...new Set(pool.map((id) => id[i]))];
        select.replaceChildren(...choices.map((key) => new Option(library.labels[[...selects.slice(0, i).map((s) => s.value), key].join("/")] || labels[key] || key, key)));
        if (choices.includes(preset[i])) select.value = preset[i];
      }
      pool = pool.filter((id) => id[i] === select.value);
    });
    const link = document.querySelector("#manifest");
    link.href = library.resolve(selects.map((s) => s.value).join("/")).modelUrl;
    link.hidden = false;
  };
  var update2 = update;
  const library = await loadModelCatalog(catalogUrl, "girls-frontline");
  const ids = library.ids.map((id) => id.split("/"));
  const initial = new URL(location.href).searchParams.get("model");
  const first = [initial, library.ids[0]].find(
    (id) => id !== null && library.ids.includes(library.visibleId(id))
  );
  if (!first) throw new Error("此目录中没有可预览的模型");
  update(0, library.visibleId(first).split("/"));
  selects.forEach((select, i) => select.addEventListener("change", () => update(i + 1)));
  window.addEventListener("live2d:model", (event) => {
    const { detail } = event;
    update(0, library.visibleId(detail).split("/"));
    const url = new URL(location.href);
    document.querySelector("#manifest").href = library.resolve(detail).modelUrl;
    url.searchParams.set("model", detail);
    history.replaceState(null, "", url);
    result.dataset.model = detail;
    result.textContent = selects.map((s) => s.selectedOptions[0].text).join(" · ");
  });
  await loadGirlsFrontline({ catalogUrl, modelId: first, coreUrl: document.documentElement.dataset.coreUrl });
  const button = document.querySelector("#preview");
  button.disabled = false;
  document.getElementById("picker").addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    result.textContent = "正在载入…";
    try {
      await selectWidgetModel(selects.map((s) => s.value).join("/"));
    } catch (error) {
      result.textContent = "载入失败：" + (error instanceof Error ? error.message : String(error));
    } finally {
      button.disabled = false;
    }
  });
} catch (error) {
  result.textContent = "目录加载失败：" + (error instanceof Error ? error.message : String(error));
}
