// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ adUrls: [], isRunning: false });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));