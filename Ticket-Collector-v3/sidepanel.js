let collectedData = [];
let tempCollection = [];
let urlQueue = [];
let proxyList = [];
let currentProxyIndex = 0;
let currentTabId = null;
let processing = false;
let timeoutId = null;
let totalProcessed = 0;

// UI Elements
const urlInput = document.getElementById('urlInput');
const proxyInput = document.getElementById('proxyInput');
const startBtn = document.getElementById('startBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusEl = document.getElementById('status');
const processedEl = document.getElementById('processed');
const totalEl = document.getElementById('total');
const urlCountEl = document.getElementById('urlCount');
const proxyCountEl = document.getElementById('proxyCount');

function updateDisplay(data) {
  const container = document.getElementById('data-container');
  const entry = document.createElement('div');
  entry.className = 'entry';
  entry.innerHTML = `
    <strong>${data.event}</strong><br>
    Total: ${data.total} | Available: ${data.available}<br>
    Date: ${data.date}
  `;
  container.appendChild(entry);
}

function downloadCSV() {
  console.log(collectedData);
  // Sort collectedData by available tickets (low to high)
  const sortedData = [...collectedData].sort((a, b) => {
    // Convert to numbers to ensure proper numeric sorting
    const availableA = parseInt(a.available) || 0;
    const availableB = parseInt(b.available) || 0;
    return availableA - availableB; // Low to high
  });

  const csvContent = [
    ['Event', 'Total Tickets', 'Remaining Tickets', 'Date Collected'].join(','),
    ...sortedData.map(item => [
      `"${item.event.replace(/"/g, '""')}"`,
      item.total,
      item.available,
      item.date
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ticket_data_results.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}


function getNextProxy() {
  if (proxyList.length === 0) return null;
  const proxy = proxyList[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxyList.length; // Rotate through proxies
  return proxy;
}

async function processNextUrl() {
  console.log(urlQueue);
  if (urlQueue.length === 0) {
    processing = false;
    statusEl.textContent = 'Processing complete!';
    startBtn.disabled = false;
    startBtn.textContent = 'Start Collection';

    // Reset proxy when done
    await resetProxy();
    return;
  }

  const url = await urlQueue.shift();

  // Get next proxy if available
  const proxy = await getNextProxy();
  let proxyMessage = '';

  if (proxy) {
    const proxyParts = await proxy.split(':');
    proxyMessage = ` (via proxy ${proxyParts[0]})`;

    // Set up proxy before creating the tab
    const success = await setupProxy(proxy);
    console.log(success);
    if (!success) {
      statusEl.textContent = `Failed to set up proxy for ${url}. Skipping...`;
      setTimeout(processNextUrl, 1000);
      return;
    }
  } else {
    // Reset to direct connection if no proxy is used
    await resetProxy();
  }

  statusEl.textContent = `Processing: ${url}${proxyMessage}`;

  // Create a new tab with the URL
  await chrome.tabs.create({ url, active: true }, (tab) => {
    currentTabId = tab.id;
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        // Remove listener after it's used
        chrome.tabs.onUpdated.removeListener(listener);
      }
    });

    // Set timeout for 2 minutes
    timeoutId = setTimeout(() => {
      if (currentTabId) {
        chrome.tabs.remove(currentTabId);
        currentTabId = null;
        totalProcessed += 1
        processedEl.textContent = totalProcessed;
        //remove data form tempcollection and add to collectionData
        if (tempCollection.length > 0) {
          collectedData.push(...tempCollection);
          tempCollection = [];
        } else {
          //if content.js not injected at all or no data collected at all
          let dateCollected = new Date().toLocaleDateString('en-CA', {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Uses system's local time zone
          });
          collectedData.push({
            event: url,
            total: 0,
            available: 0,
            date: dateCollected
          });
        }
        processNextUrl();
      }
    }, 50000); // 1 minutes
  });
}

// Function to count valid URLs
function updateUrlCount() {
  const urls = urlInput.value.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('http'));

  urlCountEl.textContent = urls.length;
  totalEl.textContent = urls.length;

  // Enable/disable start button based on URL count
  startBtn.disabled = urls.length === 0;
}

// Function to count valid proxies
async function updateProxyCount() {
  const proxies = proxyInput.value.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  proxyCountEl.textContent = proxies.length;
}

// Add event listeners for real-time counting
urlInput.addEventListener('input', updateUrlCount);
proxyInput.addEventListener('input', updateProxyCount);

startBtn.addEventListener('click', () => {
  if (processing) return;

  // Parse URLs from textarea
  urlQueue = urlInput.value.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('http'));

  // Parse proxies from textarea
  proxyList = proxyInput.value.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  currentProxyIndex = 0;

  if (urlQueue.length === 0) {
    statusEl.textContent = 'No valid URLs entered';
    return;
  }

  // Reset counters
  totalProcessed = 0;
  // Make sure background is ready before starting
  processedEl.textContent = 0;
  processing = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Processing...';
  processNextUrl();
});

downloadBtn.addEventListener('click', downloadCSV);

// Handle incoming messages
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "message_event_intercepted") {
    collectedData.push({
      event: message.event,
      total: message.total,
      available: message.available,
      date: message.date
    });
    //updateDisplay(message);
    totalProcessed++;
    tempCollection = [];
    // Clear timeout and close current tab
    if (timeoutId) clearTimeout(timeoutId);
    processedEl.textContent = totalProcessed;
    if (currentTabId) chrome.tabs.remove(currentTabId);
    currentTabId = null;

    // Process next URL
    processNextUrl();
  }
  if (message.type === "remainingSeatsFound") {
    tempCollection.push({
      event: message.event,
      total: 0,
      available: message.available,
      date: message.date
    });
  }
  //console.log(message);
});

// Initialize counters on page load
document.addEventListener('DOMContentLoaded', () => {
  updateUrlCount();
  updateProxyCount();
});

// Check if there's content in the textareas on page load (for when extension is reopened)
window.addEventListener('load', () => {
  if (urlInput.value) updateUrlCount();
  if (proxyInput.value) updateProxyCount();
});







/////////////////////////Proxy Setup/////////////////////////////////////////

let currentProxy = null;

async function setupProxy(proxyInfo) {
  try {
    // Parse proxy info (format: ip:port:username:password)
    const parts = proxyInfo.split(':');
    const ip = parts[0];
    const port = parts[1];

    if (!ip || !port) {
      console.error("Invalid proxy format:", proxyInfo);
      return false;
    }

    // Update current proxy
    currentProxy = proxyInfo;

    // Configure proxy settings
    const config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "http",
          host: ip,
          port: parseInt(port, 10)
        },
        bypassList: []
      }
    };





    // Apply proxy settings
    await new Promise((resolve, reject) => {
      chrome.proxy.settings.set(
        { value: config, scope: 'regular' },
        () => {
          if (chrome.runtime.lastError) {
            console.error("Error setting proxy:", chrome.runtime.lastError.message);
            reject(chrome.runtime.lastError.message);
          } else {
            console.log(`Proxy set successfully: ${ip}:${port}`);
            resolve(true);
          }
        }
      );
    });

    // Handle credentials if provided
    if (parts.length >= 4) {
      const username = parts[2];
      const password = parts[3];

      await chrome.storage.local.set({
        proxyCredentials: {
          username: username,
          password: password
        }
      });
      console.log(`Credentials stored for proxy: ${ip}:${port}`);
    }

    return true; // Successfully set up the proxy
  } catch (e) {
    console.error("Error setting up proxy:", e);
    return false;
  }
}



// chrome.webRequest.onAuthRequired.addListener(
//   async (details) => {
//     const { proxyCredentials } = await chrome.storage.local.get('proxyCredentials');
//     if (proxyCredentials) {
//         console.log('proxyCredentials', proxyCredentials);
//       return {
//         authCredentials: {
//           username: proxyCredentials.username,
//           password: proxyCredentials.password
//         }
//       };
//     }
//     return {}; // No credentials
//   },
//   { urls: ["<all_urls>"] },
//   ["blocking"]
// );





async function resetProxy() {
  currentProxy = null;

  await chrome.proxy.settings.set({
    value: { mode: "direct" },
    scope: 'regular'
  }, function () {
    console.log("Proxy reset to direct connection");
  });

  // Clear stored credentials
  await chrome.storage.local.remove("proxyCredentials");
}



// Make sure proxy is reset when extension starts
resetProxy();
