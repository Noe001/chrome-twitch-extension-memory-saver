/**
 * YouTube & Twitch Live Chat Memory Saver
 *
 * 目的: ライブチャットのDOM・画像リソースを軽量化し、メモリ増加を抑制
 */

;(() => {
  // ===== 設定（デフォルト値、storageから上書き可能） =====
  const CONFIG = {
    MAX_CHAT_ITEMS: 120,
    ICON_SIZE: 16,
    ENABLE_EMOTE_OPTIMIZATION: true,
    TRANSPARENT_GIF: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
  }

  // ===== 統計 =====
  let STATS = {
    deletedCount: 0,
    optimizedImages: 0,
    memorySaved: 0,
    currentSite: "-",
  }

  // ===== サイト判定 =====
  const isYouTube = window.location.hostname.includes("youtube.com")
  const isTwitch = window.location.hostname.includes("twitch.tv")

  if (isYouTube) {
    STATS.currentSite = "YouTube"
  } else if (isTwitch) {
    STATS.currentSite = "Twitch"
  }

  // ===== セレクタ定義 =====
  const SELECTORS = {
    youtube: {
      chatContainer: [
        "#items.yt-live-chat-item-list-renderer",
        "#chat-messages #items",
        "yt-live-chat-item-list-renderer #items",
      ],
      chatImages: ["yt-img-shadow img", "#chat img", "yt-live-chat-author-chip img", "#author-photo img"],
    },
    twitch: {
      chatContainer: [
        ".chat-scrollable-area__message-container",
        ".scrollable-area__message-container",
        '[data-test-selector="chat-scrollable-area__message-container"]',
        ".chat-messages",
        ".chat-list__lines .simplebar-content",
      ],
      chatImages: [
        ".chat-author__display-name img",
        ".chat-line__message img",
        ".chat-badge img",
        ".chat-image img",
        '[data-a-target="chat-badge"] img',
      ],
      thirdPartyEmotes: [
        ".seventv-emote",
        ".seventv-chat-emote",
        '[data-provider="7TV"] img',
        ".bttv-emote",
        ".bttv-gif-emote",
        '[data-provider="BTTV"] img',
        ".ffz-emote",
        '[data-provider="FFZ"] img',
        ".emote-picker__emote img",
      ],
    },
  }

  // ===== ユーティリティ関数 =====

  function queryFirst(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el) return el
    }
    return null
  }

  function queryAllMultiple(selectors) {
    const results = []
    const seen = new WeakSet()

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector)
        elements.forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el)
            results.push(el)
          }
        })
      } catch (e) {
        // セレクタが無効な場合はスキップ
      }
    }
    return results
  }

  function isElementVisible(el) {
    const rect = el.getBoundingClientRect()
    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0
  }

  async function saveStats(chrome) {
    try {
      await chrome.storage.local.set({ stats: STATS })
    } catch (e) {
      // storage APIが利用できない場合は無視
    }
  }

  async function loadSettings(chrome) {
    try {
      const result = await chrome.storage.local.get(["settings"])
      if (result.settings) {
        CONFIG.MAX_CHAT_ITEMS = result.settings.maxItems || 120
        CONFIG.ICON_SIZE = result.settings.iconSize || 16
        CONFIG.ENABLE_EMOTE_OPTIMIZATION = result.settings.enableEmoteOptimization !== false

        // 有効/無効の切り替え
        if (result.settings.enabled === false) {
          stopObserver()
          isActive = false
        } else {
          isActive = true
          startObserver()
        }
      }
    } catch (e) {
      // storage APIが利用できない場合はデフォルト値を使用
    }
  }

  // ===== YouTube用処理 =====

  function optimizeYouTubeImageUrl(url) {
    if (!url || typeof url !== "string") return url
    return url.replace(/=s\d+-c/g, `=s${CONFIG.ICON_SIZE}-c`).replace(/\/s\d+-c\//g, `/s${CONFIG.ICON_SIZE}-c/`)
  }

  function optimizeYouTubeImages() {
    const images = queryAllMultiple(SELECTORS.youtube.chatImages)

    images.forEach((img) => {
      if (img.__ytOptimized) return

      const src = img.src || img.getAttribute("src")
      if (!src) return

      const optimizedUrl = optimizeYouTubeImageUrl(src)
      if (optimizedUrl !== src) {
        const sizeDiff = (src.length - optimizedUrl.length) * 2 // 概算
        STATS.memorySaved += Math.max(0, sizeDiff)
        STATS.optimizedImages++

        img.src = optimizedUrl
      }

      img.style.width = `${CONFIG.ICON_SIZE}px`
      img.style.height = `${CONFIG.ICON_SIZE}px`
      img.style.minWidth = `${CONFIG.ICON_SIZE}px`
      img.style.minHeight = `${CONFIG.ICON_SIZE}px`

      img.__ytOptimized = true
    })
  }

  // ===== Twitch用処理 =====

  function optimizeTwitchImageUrl(url) {
    if (!url || typeof url !== "string") return url
    return url.replace(/-\d+x\d+\.(png|jpe?g|gif|webp)/gi, `-${CONFIG.ICON_SIZE}x${CONFIG.ICON_SIZE}.$1`)
  }

  function optimizeTwitchImages() {
    const images = queryAllMultiple(SELECTORS.twitch.chatImages)

    images.forEach((img) => {
      if (img.__ttvOptimized) return

      const src = img.src || img.getAttribute("src")
      if (!src) return

      const optimizedUrl = optimizeTwitchImageUrl(src)
      if (optimizedUrl !== src) {
        const sizeDiff = (src.length - optimizedUrl.length) * 2
        STATS.memorySaved += Math.max(0, sizeDiff)
        STATS.optimizedImages++

        img.src = optimizedUrl
      }

      img.style.width = `${CONFIG.ICON_SIZE}px`
      img.style.height = `${CONFIG.ICON_SIZE}px`
      img.style.maxWidth = `${CONFIG.ICON_SIZE}px`
      img.style.maxHeight = `${CONFIG.ICON_SIZE}px`

      img.__ttvOptimized = true
    })
  }

  function optimizeThirdPartyEmotes() {
    if (!CONFIG.ENABLE_EMOTE_OPTIMIZATION || !isTwitch) return

    const emotes = queryAllMultiple(SELECTORS.twitch.thirdPartyEmotes)

    emotes.forEach((emote) => {
      if (emote.__emoteOptimized) return

      // エモートサイズを制限（28px以下に）
      const maxEmoteSize = 28

      if (emote.tagName === "IMG") {
        const src = emote.src || ""

        // 7TV, BTTV, FFZ のCDN URLを検出して最適化
        if (src.includes("7tv.io") || src.includes("betterttv.net") || src.includes("frankerfacez.com")) {
          // サイズパラメータを調整
          let optimizedUrl = src

          // 7TV: /3x → /1x
          if (src.includes("7tv.io")) {
            optimizedUrl = src.replace(/\/[234]x\./g, "/1x.")
          }

          // BTTV: ?size=3 → ?size=1
          if (src.includes("betterttv.net")) {
            optimizedUrl = src.replace(/size=[23]/g, "size=1")
          }

          // FFZ: ?scale=2 → ?scale=1
          if (src.includes("frankerfacez.com")) {
            optimizedUrl = src.replace(/scale=[234]/g, "scale=1")
          }

          if (optimizedUrl !== src) {
            emote.src = optimizedUrl
            STATS.optimizedImages++
            STATS.memorySaved += 500 // 概算
          }
        }

        emote.style.maxWidth = `${maxEmoteSize}px`
        emote.style.maxHeight = `${maxEmoteSize}px`
      }

      emote.__emoteOptimized = true
    })
  }

  // ===== 共通処理 =====

  function transparentizeOffscreenImages() {
    const selectors = isYouTube ? SELECTORS.youtube.chatImages : SELECTORS.twitch.chatImages
    const images = queryAllMultiple(selectors)

    images.forEach((img) => {
      const visible = isElementVisible(img)

      if (!visible) {
        if (!img.__orig && img.src && img.src !== CONFIG.TRANSPARENT_GIF) {
          img.__orig = img.src
        }
        if (img.src !== CONFIG.TRANSPARENT_GIF) {
          img.src = CONFIG.TRANSPARENT_GIF
        }
      } else {
        if (img.__orig && img.src === CONFIG.TRANSPARENT_GIF) {
          img.src = img.__orig
          img.__ytOptimized = false
          img.__ttvOptimized = false
        }
      }
    })
  }

  function pruneDOM() {
    const containerSelectors = isYouTube ? SELECTORS.youtube.chatContainer : SELECTORS.twitch.chatContainer
    const container = queryFirst(containerSelectors)
    if (!container) return

    const children = container.children
    const excess = children.length - CONFIG.MAX_CHAT_ITEMS

    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        const child = children[0]
        if (child) {
          const imgs = child.querySelectorAll("img")
          imgs.forEach((img) => {
            img.__orig = null
            img.src = ""
          })
          child.remove()

          STATS.deletedCount++
          STATS.memorySaved += 1 // 概算 1KB/要素
        }
      }
    }
  }

  // ===== MutationObserver による効率的な監視 =====

  let observer = null
  let isActive = true
  let processingScheduled = false

  function processChanges(chrome) {
    if (!isActive) return
    processingScheduled = false

    try {
      if (isYouTube) {
        optimizeYouTubeImages()
      } else if (isTwitch) {
        optimizeTwitchImages()
        optimizeThirdPartyEmotes()
      }

      transparentizeOffscreenImages()
      pruneDOM()

      // 統計を定期的に保存
      saveStats(chrome)
    } catch (e) {
      console.error("[Memory Saver] Error:", e)
    }
  }

  function scheduleProcessing() {
    if (processingScheduled) return
    processingScheduled = true
    requestAnimationFrame(processChanges)
  }

  function startObserver(chrome) {
    if (observer) return

    const containerSelectors = isYouTube ? SELECTORS.youtube.chatContainer : SELECTORS.twitch.chatContainer

    // コンテナが見つかるまで待機
    const findAndObserve = () => {
      const container = queryFirst(containerSelectors)

      if (container) {
        observer = new MutationObserver((mutations) => {
          // 新しいチャットメッセージが追加されたときのみ処理
          const hasRelevantChanges = mutations.some(
            (m) => m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0),
          )

          if (hasRelevantChanges) {
            scheduleProcessing()
          }
        })

        observer.observe(container, {
          childList: true,
          subtree: true,
        })

        console.log("[Memory Saver] MutationObserver started")

        // 初回処理
        scheduleProcessing()
      } else {
        // コンテナが見つからない場合は再試行
        setTimeout(findAndObserve, 1000)
      }
    }

    findAndObserve()
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect()
      observer = null
      console.log("[Memory Saver] MutationObserver stopped")
    }
  }

  // ===== タブ可視性の監視 =====

  document.addEventListener("visibilitychange", (chrome) => {
    if (document.visibilityState === "visible") {
      isActive = true
      startObserver(chrome)
    } else {
      isActive = false
      stopObserver()
    }
  })

  let scrollTimeout = null
  window.addEventListener(
    "scroll",
    (chrome) => {
      if (scrollTimeout) clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        transparentizeOffscreenImages()
      }, 100)
    },
    { passive: true },
  )

  window.chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SETTINGS_UPDATED") {
      CONFIG.MAX_CHAT_ITEMS = message.settings.maxItems || 120
      CONFIG.ICON_SIZE = message.settings.iconSize || 16
      CONFIG.ENABLE_EMOTE_OPTIMIZATION = message.settings.enableEmoteOptimization !== false

      if (message.settings.enabled === false) {
        stopObserver()
        isActive = false
      } else {
        isActive = true
        startObserver(window.chrome)
      }

      console.log("[Memory Saver] Settings updated:", CONFIG)
    }

    if (message.type === "RESET_STATS") {
      STATS = {
        deletedCount: 0,
        optimizedImages: 0,
        memorySaved: 0,
        currentSite: isYouTube ? "YouTube" : isTwitch ? "Twitch" : "-",
      }
      saveStats(window.chrome)
    }
  })

  // ===== 初期化 =====

  async function init(chrome) {
    console.log(`[Memory Saver] Initializing for ${isYouTube ? "YouTube" : isTwitch ? "Twitch" : "Unknown"}`)

    // 設定を読み込む
    await loadSettings(chrome)

    // 統計を保存
    await saveStats(chrome)

    // MutationObserverを開始
    setTimeout(() => {
      if (isActive) {
        startObserver(chrome)
      }
    }, 1000)
  }

  if (document.readyState === "complete") {
    init(window.chrome)
  } else {
    window.addEventListener("load", () => init(window.chrome))
  }
})(window.chrome)
