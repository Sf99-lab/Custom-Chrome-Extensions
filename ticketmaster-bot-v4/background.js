chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Set default prices if not set
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated");
  chrome.storage.local.get(['minPrice', 'maxPrice', 'ticketQuantity'], (data) => {
    if (!data.minPrice) chrome.storage.local.set({minPrice: 0});
    if (!data.maxPrice) chrome.storage.local.set({maxPrice: 100});
    if (!data.ticketQuantity) chrome.storage.local.set({ticketQuantity: 1});
  });
});

