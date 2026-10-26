import { getConfig, listModels } from "./llm.js";
import { t, applyI18n, langName } from "./i18n.js";
const $ = (id) => document.getElementById(id);
const status = (txt, err = false) => { $("status").textContent = txt; $("status").className = err ? "err" : ""; };
const read = () => ({ provider: $("provider").value, baseUrl: $("baseUrl").value.trim(), apiKey: $("apiKey").value.trim(), model: $("model").value, lang: $("lang").value.trim() });

applyI18n();
document.title = t("optTitle");
$("lang").placeholder = langName();

function fill(models, current) {
  $("model").innerHTML = "";
  const list = models.length ? models : current ? [current] : [];
  for (const m of list) { const o = document.createElement("option"); o.value = o.textContent = m; $("model").append(o); }
  if (current && list.includes(current)) $("model").value = current;
}

async function ensureAccess(url) {
  const origin = new URL(url).origin + "/*";
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] }); // kullanıcı tıklamasıyla çağrıldığı için çalışır
}

async function load(save) {
  const c = read();
  try { new URL(c.baseUrl); } catch { status(t("badUrl"), true); return; }
  if (!(await ensureAccess(c.baseUrl))) { status(t("noPermission"), true); return; }
  status(t("connecting"));
  try {
    const models = await listModels(c);
    fill(models, c.model || models[0]);
    if (save) { await chrome.storage.local.set({ ...c, model: $("model").value }); status(t("savedFound", models.length)); }
    else status(t("foundPick", models.length));
  } catch (e) {
    status(e.message.includes("Failed to fetch") ? t("unreachableOpt") : e.message, true);
  }
}

const c = await getConfig();
$("provider").value = c.provider; $("baseUrl").value = c.baseUrl; $("apiKey").value = c.apiKey; $("lang").value = c.lang;
fill([], c.model);
$("load").onclick = () => load(false);
$("save").onclick = () => load(true);

const PRESETS = {
  ovh: ["openai", "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1"],
  groq: ["openai", "https://api.groq.com/openai/v1"],
  openrouter: ["openai", "https://openrouter.ai/api/v1"],
  cerebras: ["openai", "https://api.cerebras.ai/v1"],
  gemini: ["openai", "https://generativelanguage.googleapis.com/v1beta/openai"],
  ollama: ["ollama", "http://localhost:11434"],
};
$("preset").onchange = () => {
  const p = PRESETS[$("preset").value];
  if (!p) return;
  $("provider").value = p[0]; $("baseUrl").value = p[1];
  status(["ovh", "ollama"].includes($("preset").value) ? t("presetFilledNoKey") : t("presetFilled"));
};
