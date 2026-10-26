const DEFAULT_URL = "http://localhost:11434";

const MENUS = [
  { id: "summary", key: "menuSummary" },
  { id: "simple", key: "menuSimple" },
  { id: "translate", key: "menuTranslate" },
];

// Sunucu Origin başlığı yüzünden 403 vermesin diye (özellikle Ollama) başlığı kaldır.
async function updateRule() {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  let origin;
  try { origin = new URL(baseUrl || DEFAULT_URL).origin; } catch { return; }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1, priority: 1,
      action: { type: "modifyHeaders", requestHeaders: [{ header: "origin", operation: "remove" }] },
      condition: { urlFilter: "|" + origin + "/", resourceTypes: ["xmlhttprequest"], initiatorDomains: [chrome.runtime.id] },
    }],
  });
}

// Simgeye tıklamanın onClicked olayını tetiklemesi için panelin otomatik açılmasını kapat.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

function setup() {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENUS) chrome.contextMenus.create({ id: m.id, title: chrome.i18n.getMessage(m.key), contexts: ["selection"] });
  });
  updateRule();
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.baseUrl) updateRule(); });

// Sayfa metnini çıkar (activeTab izni, tıklama anında bu sekme için verilir).
async function extract(tabId) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const s = getSelection().toString().trim();
      if (s.length > 30) return { text: s, sel: true };
      const el = document.querySelector("article") || document.querySelector("main") || document.body;
      return { text: el.innerText, sel: false };
    },
  });
  return r.result;
}

// Simge tıklaması / kısayol (Alt+S): paneli aç ve bu sekmeyi hemen oku.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {}); // kullanıcı hareketi içinde, beklemeden çağrılmalı
  (async () => {
    const { lastMode } = await chrome.storage.local.get("lastMode");
    const mode = lastMode || "summary";
    try {
      const p = await extract(tab.id);
      await chrome.storage.session.set({ pending: { mode, text: p.text, t: Date.now() } });
    } catch {
      await chrome.storage.session.set({ pending: { mode, error: chrome.i18n.getMessage("errCantRead"), t: Date.now() } });
    }
  })();
});

// Sağ tık menüsü: seçili metin doğrudan gönderilir.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  chrome.storage.session.set({ pending: { mode: info.menuItemId, text: info.selectionText, t: Date.now() } });
});
