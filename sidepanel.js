import { getConfig, streamChat } from "./llm.js";
import { t, applyI18n, langName } from "./i18n.js";
const $ = (id) => document.getElementById(id);
let ctrl = null;
let lastPendingT = 0;

applyI18n();
document.title = t("panelTitle");

// Talimatlar İngilizce; yanıt dili sistem mesajında belirlenir (tarayıcı dili ya da ayarlardaki dil).
const PROMPTS = {
  summary: "Summarize the following text concisely (at most 5 sentences).",
  bullets: "Extract the key points of the following text as bullet points.",
  simple: "Explain the following text simply, as if to someone without technical knowledge.",
  translate: "Translate the following text naturally into the target language. Output only the translation.",
};
const MAX_CHARS = 24000;

function status(txt, err = false) { $("status").textContent = txt; $("status").className = err ? "err" : ""; }

// Panel butonu: yalnızca bu sekme için activeTab izni hâlâ geçerliyse çalışır.
async function getPageText() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error(t("tabNotFound"));
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const s = getSelection().toString().trim();
        if (s.length > 30) return { text: s };
        const el = document.querySelector("article") || document.querySelector("main") || document.body;
        return { text: el.innerText };
      },
    });
    return r.result;
  } catch { throw new Error(t("noAccess")); }
}

async function run(mode, given) {
  const cfg = await getConfig();
  if (!cfg.model) { status(t("pickModel"), true); return; }
  $("out").textContent = ""; $("copy").hidden = true;
  let text;
  try {
    if (given) text = given;
    else { status(t("readingPage")); text = (await getPageText()).text; }
  } catch (e) { status(e.message, true); return; }
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) { status(t("notEnoughText"), true); return; }
  const cut = text.length > MAX_CHARS;
  if (cut) text = text.slice(0, MAX_CHARS);

  ctrl = new AbortController();
  $("run").hidden = true; $("stop").hidden = false;
  status(cut ? t("longText") : t("modelReplying"));
  const lang = cfg.lang || langName();
  const messages = [
    { role: "system", content: `You are a helpful assistant. Always reply in ${lang}.` },
    { role: "user", content: `${PROMPTS[mode]}\n\n---\n${text}` },
  ];
  try {
    for await (const tok of streamChat(cfg, messages, ctrl.signal)) $("out").textContent += tok;
    status(cut ? t("doneCut") : t("done"));
    $("copy").hidden = false;
  } catch (e) {
    if (e.name === "AbortError") status(t("stopped"));
    else status(e.message.includes("Failed to fetch") ? t("unreachable") : e.message, true);
  } finally {
    $("run").hidden = false; $("stop").hidden = true; ctrl = null;
  }
}

async function checkPending() {
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending || pending.t === lastPendingT || Date.now() - pending.t > 10000) return;
  lastPendingT = pending.t;
  await chrome.storage.session.remove("pending");
  $("mode").value = pending.mode;
  if (pending.error) { status(pending.error, true); return; }
  run(pending.mode, pending.text);
}

$("run").onclick = () => run($("mode").value);
$("stop").onclick = () => ctrl?.abort();
$("copy").onclick = async () => { await navigator.clipboard.writeText($("out").textContent); status(t("copied")); };
$("settings").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
$("mode").onchange = () => chrome.storage.local.set({ lastMode: $("mode").value });
chrome.storage.onChanged.addListener((c, a) => { if (a === "session" && c.pending?.newValue) checkPending(); });

const { lastMode } = await chrome.storage.local.get("lastMode");
if (lastMode && PROMPTS[lastMode]) $("mode").value = lastMode;
checkPending();
