export const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;

// Tarayıcı arayüz dilinin İngilizce adı (LLM'e "şu dilde yanıtla" demek için)
export function langName() {
  const code = chrome.i18n.getUILanguage();
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code; } catch { return code; }
}

export function applyI18n() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";
  document.querySelectorAll("[data-i18n]").forEach((e) => (e.textContent = t(e.dataset.i18n)));
  document.querySelectorAll("[data-i18n-aria]").forEach((e) => e.setAttribute("aria-label", t(e.dataset.i18nAria)));
}
