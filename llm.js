import { t } from "./i18n.js";
// Ortak istemci: Ollama (/api/chat) ve OpenAI uyumlu (/chat/completions)
export const DEFAULTS = { provider: "ollama", baseUrl: "http://localhost:11434", apiKey: "", model: "", lang: "" };

export async function getConfig() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

const headers = (c) => ({ "Content-Type": "application/json", ...(c.apiKey ? { Authorization: "Bearer " + c.apiKey } : {}) });

// Adreste yol varsa (/v1, /openai/v1, /v1beta/openai ...) olduğu gibi kullanılır; yoksa /v1 eklenir.
function endpoint(c, kind) {
  const base = c.baseUrl.trim().replace(/\/+$/, "");
  if (c.provider === "ollama") return base.replace(/\/v1$/, "") + (kind === "models" ? "/api/tags" : "/api/chat");
  const hasPath = new URL(base).pathname.replace(/\/+$/, "") !== "";
  return base + (hasPath ? "" : "/v1") + (kind === "models" ? "/models" : "/chat/completions");
}

export async function listModels(c) {
  const r = await fetch(endpoint(c, "models"), { headers: headers(c) });
  if (!r.ok) throw new Error(explain(r.status));
  const j = await r.json();
  if (c.provider === "ollama") return j.models.map((m) => m.name);
  const ids = j.data.map((m) => String(m.id).replace(/^models\//, ""));
  return ids.sort((a, b) => (b.endsWith(":free") ? 1 : 0) - (a.endsWith(":free") ? 1 : 0) || a.localeCompare(b));
}

export function explain(status) {
  if (status === 401) return t("err401");
  if (status === 403) return t("err403");
  if (status === 404) return t("err404");
  if (status === 429) return t("err429");
  return t("errServer", status);
}

export async function* streamChat(c, messages, signal) {
  const ollama = c.provider === "ollama";
  const body = ollama
    ? { model: c.model, messages, stream: true, options: { num_ctx: 8192 } }
    : { model: c.model, messages, stream: true };
  const r = await fetch(endpoint(c, "chat"), { method: "POST", headers: headers(c), body: JSON.stringify(body), signal });
  if (!r.ok) throw new Error(explain(r.status));
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (let l of lines) {
      l = l.trim();
      if (!l) continue;
      if (ollama) {
        const t = JSON.parse(l).message?.content;
        if (t) yield t;
      } else {
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (d === "[DONE]") return;
        const t = JSON.parse(d).choices?.[0]?.delta?.content;
        if (t) yield t;
      }
    }
  }
}
