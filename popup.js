/**
 * Popup UI Script
 */

// DOM要素
const elements = {
  enableToggle: document.getElementById("enableToggle"),
  statusText: document.getElementById("statusText"),
  maxItems: document.getElementById("maxItems"),
  iconSize: document.getElementById("iconSize"),
  enableEmoteOptimization: document.getElementById("enableEmoteOptimization"),
  deletedCount: document.getElementById("deletedCount"),
  optimizedImages: document.getElementById("optimizedImages"),
  memorySaved: document.getElementById("memorySaved"),
  currentSite: document.getElementById("currentSite"),
  resetStats: document.getElementById("resetStats"),
  saveSettings: document.getElementById("saveSettings"),
}

// デフォルト設定
const DEFAULT_SETTINGS = {
  enabled: true,
  maxItems: 120,
  iconSize: 16,
  enableEmoteOptimization: true,
}

// デフォルト統計
const DEFAULT_STATS = {
  deletedCount: 0,
  optimizedImages: 0,
  memorySaved: 0,
  currentSite: "-",
}

// chrome API の宣言
const chrome = window.chrome

/**
 * 設定を読み込む
 */
async function loadSettings() {
  const result = await chrome.storage.local.get(["settings", "stats"])
  const settings = { ...DEFAULT_SETTINGS, ...result.settings }
  const stats = { ...DEFAULT_STATS, ...result.stats }

  // UIに反映
  elements.enableToggle.checked = settings.enabled
  elements.statusText.textContent = settings.enabled ? "ON" : "OFF"
  elements.statusText.className = `status-text ${settings.enabled ? "on" : "off"}`
  elements.maxItems.value = settings.maxItems
  elements.iconSize.value = settings.iconSize
  elements.enableEmoteOptimization.checked = settings.enableEmoteOptimization

  // 統計を反映
  elements.deletedCount.textContent = stats.deletedCount.toLocaleString()
  elements.optimizedImages.textContent = stats.optimizedImages.toLocaleString()
  elements.memorySaved.textContent = stats.memorySaved.toLocaleString()
  elements.currentSite.textContent = stats.currentSite
}

/**
 * 設定を保存
 */
async function saveSettings() {
  const settings = {
    enabled: elements.enableToggle.checked,
    maxItems: Number.parseInt(elements.maxItems.value, 10) || 120,
    iconSize: Number.parseInt(elements.iconSize.value, 10) || 16,
    enableEmoteOptimization: elements.enableEmoteOptimization.checked,
  }

  await chrome.storage.local.set({ settings })

  // コンテンツスクリプトに通知
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings })
    } catch (e) {
      // コンテンツスクリプトが存在しない場合は無視
    }
  }

  // 保存完了フィードバック
  elements.saveSettings.textContent = "保存しました"
  setTimeout(() => {
    elements.saveSettings.textContent = "保存"
  }, 1500)
}

/**
 * 統計をリセット
 */
async function resetStats() {
  await chrome.storage.local.set({ stats: DEFAULT_STATS })

  elements.deletedCount.textContent = "0"
  elements.optimizedImages.textContent = "0"
  elements.memorySaved.textContent = "0"
  elements.currentSite.textContent = "-"

  // コンテンツスクリプトに通知
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "RESET_STATS" })
    } catch (e) {
      // コンテンツスクリプトが存在しない場合は無視
    }
  }
}

/**
 * トグル変更時の処理
 */
function handleToggleChange() {
  const enabled = elements.enableToggle.checked
  elements.statusText.textContent = enabled ? "ON" : "OFF"
  elements.statusText.className = `status-text ${enabled ? "on" : "off"}`
}

// イベントリスナー
elements.enableToggle.addEventListener("change", handleToggleChange)
elements.saveSettings.addEventListener("click", saveSettings)
elements.resetStats.addEventListener("click", resetStats)

// 統計の定期更新
setInterval(async () => {
  const result = await chrome.storage.local.get(["stats"])
  const stats = { ...DEFAULT_STATS, ...result.stats }

  elements.deletedCount.textContent = stats.deletedCount.toLocaleString()
  elements.optimizedImages.textContent = stats.optimizedImages.toLocaleString()
  elements.memorySaved.textContent = stats.memorySaved.toLocaleString()
  elements.currentSite.textContent = stats.currentSite
}, 1000)

// 初期化
loadSettings()
