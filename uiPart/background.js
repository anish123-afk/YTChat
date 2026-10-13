// background.js - Service worker for YTChat extension

// Listen for extension icon clicks in browser toolbar
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // Check if we are on YouTube
  if (tab.url && (tab.url.includes("youtube.com") || tab.url.includes("youtu.be"))) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SIDEBAR" });
    } catch (err) {
      console.warn("[YTChat] Could not message content script, injecting now...", err);
      // Re-inject content scripts if needed
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"]
      });
      chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SIDEBAR" });
    }
  } else {
    console.info("[YTChat] Not a YouTube page:", tab.url);
  }
});

