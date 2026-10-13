// content.js - Injected into YouTube pages to mount YTChat beside videos

(() => {
  if (window.__YTCHAT_INJECTED__) return;
  window.__YTCHAT_INJECTED__ = true;

  let sidebarIframe = null;
  let toggleBtn = null;
  let isOpen = false;
  let currentVideoId = null;
  let lastCheckedHref = "";

  // Helper: Extract Video ID from URL
  function extractVideoId(url = window.location.href) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.searchParams.has("v")) {
        return parsedUrl.searchParams.get("v");
      }
      const shortsMatch = parsedUrl.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) {
        return shortsMatch[1];
      }
      const liveMatch = parsedUrl.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
      if (liveMatch) {
        return liveMatch[1];
      }
    } catch {
      // Fallback regex
      const match = url.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    }
    return null;
  }

  // Get current video title
  function getVideoTitle() {
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, #title h1, h1.title");
    return titleEl ? titleEl.textContent.trim() : document.title.replace(" - YouTube", "").trim();
  }

  // Create or retrieve Sidebar Iframe
  function getOrCreateIframe() {
    if (sidebarIframe) return sidebarIframe;

    sidebarIframe = document.createElement("iframe");
    sidebarIframe.id = "ytchat-sidebar-frame";
    sidebarIframe.src = chrome.runtime.getURL("sidebar.html");
    sidebarIframe.allow = "clipboard-write";

    // Wait until iframe loads to send initial video ID
    sidebarIframe.addEventListener("load", () => {
      sendVideoInfoToIframe();
    });

    document.body.appendChild(sidebarIframe);
    return sidebarIframe;
  }

  // Create floating trigger button on YouTube page
  function createToggleButton() {
    if (toggleBtn) return toggleBtn;

    toggleBtn = document.createElement("div");
    toggleBtn.id = "ytchat-toggle-btn";
    toggleBtn.title = "Open YTChat Assistant (or click extension icon)";
    toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.08L2 22l5.08-1.38C8.58 21.5 10.15 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
      </svg>
      <span>YTChat</span>
      <span class="ytchat-badge"></span>
    `;

    toggleBtn.addEventListener("click", () => {
      toggleSidebar();
    });

    document.body.appendChild(toggleBtn);
    return toggleBtn;
  }

  // Send video information to the sidebar iframe
  function sendVideoInfoToIframe() {
    if (!sidebarIframe || !sidebarIframe.contentWindow) return;
    const videoId = extractVideoId();
    currentVideoId = videoId;
    const videoTitle = getVideoTitle();

    sidebarIframe.contentWindow.postMessage(
      {
        source: "YTCHAT_CONTENT_SCRIPT",
        type: "VIDEO_INFO",
        data: {
          videoId: videoId,
          title: videoTitle,
          url: window.location.href
        }
      },
      "*"
    );
  }

  // Toggle sidebar visibility
  function toggleSidebar(forceState) {
    const iframe = getOrCreateIframe();
    isOpen = typeof forceState === "boolean" ? forceState : !isOpen;

    if (isOpen) {
      iframe.classList.add("ytchat-open");
      sendVideoInfoToIframe();
    } else {
      iframe.classList.remove("ytchat-open");
    }
  }

  // Handle messages from the iframe (e.g., timestamp seek, close sidebar)
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "YTCHAT_SIDEBAR") return;

    if (data.type === "CLOSE_SIDEBAR") {
      toggleSidebar(false);
    } else if (data.type === "REQUEST_VIDEO_INFO") {
      sendVideoInfoToIframe();
    } else if (data.type === "SEEK_VIDEO") {
      const seconds = Number(data.seconds);
      if (!isNaN(seconds)) {
        const video = document.querySelector("video");
        if (video) {
          video.currentTime = seconds;
          video.play().catch(() => {});
        }
      }
    }
  });

  // Listen for messages from background script (extension icon click)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "TOGGLE_SIDEBAR") {
      toggleSidebar();
      sendResponse({ success: true, isOpen });
    }
  });

  // Monitor SPA navigation on YouTube
  function onUrlOrVideoChange() {
    const newId = extractVideoId();
    if (newId !== currentVideoId || window.location.href !== lastCheckedHref) {
      lastCheckedHref = window.location.href;
      currentVideoId = newId;
      // Slight delay for YouTube title to update
      setTimeout(() => {
        sendVideoInfoToIframe();
      }, 500);
    }
  }

  // YouTube's custom navigation events
  window.addEventListener("yt-navigate-finish", onUrlOrVideoChange);
  window.addEventListener("popstate", onUrlOrVideoChange);

  // Fallback poller for YouTube URL changes
  setInterval(() => {
    if (window.location.href !== lastCheckedHref) {
      onUrlOrVideoChange();
    }
  }, 1000);

  // Initialize UI when page is ready
  function init() {
    createToggleButton();
    currentVideoId = extractVideoId();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

