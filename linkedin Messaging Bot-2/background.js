let urls = [];
let messages = [];
let dayOfTheWeek = [];
let currentIndex = 0;
let startOverIndex = 0;
let currentTabId = null;
let selectedSpeed = '';

// Function to send a message to the side panel
function sendMessageToSidePanel(data, remainingUrls) {
    chrome.runtime.sendMessage({
        action: 'updateSidePanel',
        payload: data, remainingUrls: remainingUrls
    });
}

function getRandomDelay(speed) {
    const speedRanges = {
        slow: [5000, 30000],
        medium: [2000, 10000],
        fast: [1000, 2000]
    };

    const [min, max] = speedRanges[speed] || [0, 0]; // Default to 0 if speed is invalid
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    const remainingUrls = urls.length - (currentIndex + 1);
    sendMessageToSidePanel(delay, remainingUrls);
    return delay;
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'SEND_MESSAGE') {
        currentIndex = 0;
        startOverIndex = 0;
        urls = [];
        messages = [];
        dayOfTheWeek = [];
        urls = message.urls;
        messages = message.messages;
        selectedSpeed = message.speed;
        //console.log(urls, messages, selectedSpeed);
        startMessaging();
    } else if (message.action === 'messageSent') {
        if (currentTabId) {
            await new Promise(resolve => setTimeout(resolve, getRandomDelay(selectedSpeed)));
            chrome.tabs.remove(currentTabId, () => {
                currentIndex++;
                openNextTab();
            });
        }
    } else if (message.action === 'messageNotSent') {
        if (currentTabId) {
            await new Promise(resolve => setTimeout(resolve, getRandomDelay(selectedSpeed)));
           chrome.tabs.remove(currentTabId, () => {
                currentIndex++;
                openNextTab();
            });
        }
    }else if(message.action === 'RESUME'){
        urls = message.urls;
        messages = message.messages;
        selectedSpeed = message.speed;
        startMessaging();
    }
});

function startMessaging() {
    if (urls.length > 0) {
        openNextTab();
    }
}

function openNextTab() {
    //check pause resume state
    chrome.storage.local.get('pauseResumeState', (result) => {
        const state = result['pauseResumeState'] || 'resume';
        if (state === 'resume') {
            if (currentIndex >= urls.length) {
                //setting index back to zero when all done
                currentIndex = 0;
                startOverIndex = 0;
                urls = [];
                messages = [];
                dayOfTheWeek = [];

                return;
            }


            const url = urls[currentIndex];
            let message = messages[currentIndex];
            //handle if there is no message in the current index
            if (message === undefined) {
                message = messages[startOverIndex];
                startOverIndex++;
                if (startOverIndex == 20) {
                    startOverIndex = 0;
                }
            }
            chrome.tabs.create({ url: url, active: true }, (tab) => {
                currentTabId = tab.id;  // Store the tab ID for later use

                chrome.tabs.onUpdated.addListener(function onUpdated(tabId, changeInfo) {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        // Inject content.js after the tab is fully loaded
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['content.js']
                        }).then(() => {
                            // Send message only after content.js is injected
                            chrome.tabs.sendMessage(tab.id, { action: 'sendMessage', message: message });
                        }).catch(error => console.error('Script injection failed:', error));

                        // Remove the listener to prevent multiple executions
                        chrome.tabs.onUpdated.removeListener(onUpdated);
                    }
                });
            });
        }

    });
}

chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

