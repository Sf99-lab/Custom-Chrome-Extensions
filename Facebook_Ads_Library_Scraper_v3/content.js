const adUrlSet = new WeakSet();
let isExtracting = false;
let scrollInterval;
let lastAdCount = 0;
let noNewAdsCounter = 0;
const MAX_NO_NEW_ADS_COUNT = 60;
const SCROLL_RETRY_STRATEGY = [5, 10, 15, 25, 40, 55];
const SCROLL_BACK_AMOUNTS = [-3000, -5000, -3000, -10000, -15000, -5000];
const MAX_HOVER_ATTEMPTS = 5;
const HOVER_DELAY_MS = 500;
const SCROLL_DELAY_MS = 2000;
const SCROLL_AMOUNT = 3000;

// Error handling wrapper for chrome.storage operations
async function safeStorageOperation(operation) {
    try {
        return await operation();
    } catch (error) {
        console.error('Storage operation failed:', error);
        return null;
    }
}

// Message handler with error protection
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        if (message.action === 'start') {
            startExtracting();
            sendResponse({ success: true });
        } else if (message.action === 'stop') {
            stopExtracting();
            sendResponse({ success: true });
        }
    } catch (error) {
        console.error('Message handler error:', error);
        sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message port open for sendResponse
});

function startExtracting() {
    if (isExtracting) {
        console.warn('Extraction already in progress');
        return;
    }

    isExtracting = true;
    lastAdCount = 0;
    noNewAdsCounter = 0;

    // Initial extraction with error handling
    try {
        extractUrls();
    } catch (error) {
        console.error('Initial extraction failed:', error);
    }

    // Track if extraction is in progress
    let extractionInProgress = false;
    
    // Start auto-scrolling with sequential execution
    scrollInterval = setInterval(async () => {
        // Skip if previous extraction is still running
        if (extractionInProgress) {
            console.log('Skipping scroll - previous extraction still in progress');
            return;
        }
        
        try {
            extractionInProgress = true;
            window.scrollBy(0, SCROLL_AMOUNT);
            await checkForNewAds();
            await extractUrls();
        } catch (error) {
            console.error('Scroll interval operation failed:', error);
            stopExtracting();
        } finally {
            extractionInProgress = false;
        }
    }, SCROLL_DELAY_MS);
}

function stopExtracting(reason = 'userStopped') {
    if (!isExtracting) return;

    isExtracting = false;
    clearInterval(scrollInterval);

    if (window.adExtractorObserver) {
        try {
            window.adExtractorObserver.disconnect();
        } catch (error) {
            console.error('Observer disconnect failed:', error);
        }
    }

    // Send stop notification with error handling
    chrome.runtime.sendMessage({
        action: 'extractionStopped',
        reason: noNewAdsCounter >= MAX_NO_NEW_ADS_COUNT ? 'noMoreAds' : reason
    }).catch(error => {
        console.error('Failed to send stop message:', error);
    });
}

async function checkForNewAds() {
    try {
        const data = await safeStorageOperation(() => 
            new Promise(resolve => chrome.storage.local.get(['adUrls'], resolve))
        );
        
        if (!data) return;

        const currentAdCount = data.adUrls?.length || 0;

        if (currentAdCount === lastAdCount) {
            noNewAdsCounter++;
            console.log(`No new ads found: ${noNewAdsCounter}/${MAX_NO_NEW_ADS_COUNT}`);

            if (noNewAdsCounter >= MAX_NO_NEW_ADS_COUNT) {
                console.log('Stopping extraction - no new ads found');
                stopExtracting('noMoreAds');
                return;
            }

            // Handle scroll back strategy
            const strategyIndex = SCROLL_RETRY_STRATEGY.indexOf(noNewAdsCounter);
            if (strategyIndex !== -1) {
                window.scrollBy(0, SCROLL_BACK_AMOUNTS[strategyIndex]);
            }
        } else {
            noNewAdsCounter = 0;
            lastAdCount = currentAdCount;
        }
    } catch (error) {
        console.error('Failed to check for new ads:', error);
    }
}

async function extractUrls() {
    try {
        const allDivs = document.querySelectorAll('div.xh8yej3');
        const validDivs = Array.from(allDivs).filter(div => 
            div.attributes.length === 1 && 
            div.hasAttribute('class') && 
            div.classList.length === 1
        ).filter(div => {
            const firstChild = div.querySelector('div');
            return firstChild && firstChild.attributes.length === 0;
        });

        console.log(`Found ${validDivs.length} potential ad divs`);

        const newUrls = [];
       // const batchSize = 5; // Process ads in batches to avoid UI freeze
        //const processingBatch = validDivs.slice(0, batchSize);

        for (const div of validDivs) {
            if (adUrlSet.has(div)) continue;
            adUrlSet.add(div);

            const anchors = div.querySelectorAll('a');
            if (!anchors.length) continue;

            const companyUrl = await extractAdUrl(anchors[0]);
            const adUrl = anchors[1]?.href ? decodeURIComponent(new URL(anchors[1].href).searchParams.get('u')) : null;
            newUrls.push({
                fbUrl: anchors[0]?.href || 'Not found',
                companyUrl: companyUrl || 'Not found',
                adUrl: adUrl || 'Not found'
            });
        }

        if (newUrls.length > 0) {
            await updateStorageWithNewUrls(newUrls);
        }
    } catch (error) {
        console.error('Extraction failed:', error);
    }
}

async function extractAdUrl(anchorElement, attempt = 1) {
    if (attempt > MAX_HOVER_ATTEMPTS) return null;

    try {
        console.log(`Hover attempt ${attempt}/${MAX_HOVER_ATTEMPTS}`);
        
        // Dispatch hover event
        const mouseoverEvent = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        anchorElement.dispatchEvent(mouseoverEvent);

        // Wait for tooltip to appear
        return await new Promise(resolve => {
            setTimeout(async () => {
                try {
                    const tooltipUrl = await findUrlInTooltip();
                    resolve(tooltipUrl);
                } finally {
                    // Clean up hover state
                    const mouseoutEvent = new MouseEvent('mouseout', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    anchorElement.dispatchEvent(mouseoutEvent);
                }
            }, HOVER_DELAY_MS);
        });
    } catch (error) {
        console.error(`Hover attempt ${attempt} failed:`, error);
        return await extractAdUrl(anchorElement, attempt + 1);
    }
}

async function findUrlInTooltip() {
    const contextualLayers = document.querySelectorAll('div[data-testid="ContextualLayerRoot"]');
    
    for (const layer of contextualLayers) {
        const anchor = layer.querySelector('a');
        if (anchor?.textContent) {
            return anchor.textContent.trim();
        }
    }
    return null;
}

async function updateStorageWithNewUrls(newUrls) {
    try {
        const data = await safeStorageOperation(() => 
            new Promise(resolve => chrome.storage.local.get(['adUrls'], resolve))
        );
        
        if (!data) return;

        const existingUrls = data.adUrls || [];
        const allUrls = [...existingUrls, ...newUrls];
        
        await safeStorageOperation(() => 
            new Promise(resolve => chrome.storage.local.set({ adUrls: allUrls }, resolve))
        );
    } catch (error) {
        console.error('Failed to update storage:', error);
    }
}

// Initialize with error handling
(async function init() {
    try {
        await safeStorageOperation(() => 
            new Promise(resolve => chrome.storage.local.set({ adUrls: [] }, resolve))
        );
    } catch (error) {
        console.error('Initialization failed:', error);
    }
})();