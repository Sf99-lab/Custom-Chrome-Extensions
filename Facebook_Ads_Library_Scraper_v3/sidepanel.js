const startStopBtn = document.getElementById('startStopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const urlCountElement = document.getElementById('urlCount');
const statusElement = document.getElementById('status');

let isRunning = false;

// Update UI from storage
chrome.storage.local.get(['adUrls', 'isRunning'], (data) => {
  urlCountElement.textContent = data.adUrls?.length || 0;
  isRunning = data.isRunning || false;
  updateButtonState();
});

// Start/Stop button click handler
startStopBtn.addEventListener('click', () => {
  isRunning = !isRunning;
  chrome.storage.local.set({ isRunning });
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0].url.includes('facebook.com/ads/library')) {
      chrome.tabs.sendMessage(tabs[0].id, { action: isRunning ? 'start' : 'stop' });
    }
  });
  
  updateButtonState();
});

// Download button click handler
downloadBtn.addEventListener('click', () => {
  chrome.storage.local.get(['adUrls'], (data) => {
    if (data.adUrls && data.adUrls.length > 0) {
      console.log(`Total URLs to download: ${data.adUrls.length}`);
      
      // Add CSV header row
      const csvHeader = "Facebook Page URL, Company URL, Ad Website URL\n";
      
      // Create CSV content in chunks to handle large datasets
      let csvContent = csvHeader;
      
      // Process all entries without filtering
      for (let i = 0; i < data.adUrls.length; i++) {
        const item = data.adUrls[i];
        csvContent += `"${item.fbUrl}","${item.companyUrl}",${item.adUrl}\n`;
      }
      
      // Use Blob instead of data URI to handle larger files
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "facebook_ad_urls.csv");
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    }
  });
});


// Update button states
function updateButtonState() {
  startStopBtn.textContent = isRunning ? 'Stop' : 'Start';
  downloadBtn.disabled = isRunning;
  statusElement.textContent = isRunning 
    ? 'Extracting URLs... Scrolling the page to collect more.' 
    : 'Ready to start';
}

// Listen for URL count updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.adUrls) {
    urlCountElement.textContent = changes.adUrls.newValue.length;
    downloadBtn.disabled = changes.adUrls.newValue.length === 0 || isRunning;
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'extractionStopped') {
    isRunning = false;
    chrome.storage.local.set({ isRunning: false });
    updateButtonState();
    
    if (message.reason === 'noMoreAds') {
      statusElement.textContent = 'Extraction complete: No more ads found';
    } else {
      statusElement.textContent = 'Extraction stopped';
    }
  }
});