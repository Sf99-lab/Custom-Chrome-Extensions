let profiles = [];
let currentIndex = 0;
let isRunning = false;
let sentCount = 0;
let timerInterval;
let nextMessageTime = 0;

document.getElementById('csvFile').addEventListener('change', isFileUpload);
document.getElementById('startBtn').addEventListener('click', startSending);
document.getElementById('stopBtn').addEventListener('click', stopSending);


function isFileUpload() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];

    if (!file) {
        logMessage('Please select a CSV file first', 'error');
        return;
    }

    document.getElementById('startBtn').disabled = false;
    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        parseCSV(content);
    };
    reader.readAsText(file);
}

function parseCSV(content) {
    // Parse CSV using Papa Parse
    const parseResult = Papa.parse(content, {
        skipEmptyLines: true,  // Skip empty lines
        delimiter: ',',        // Use comma as delimiter
    });

    profiles = [];
    const lines = parseResult.data;

    // Skip header row if exists
    const startRow = 1;

    for (let i = startRow; i < lines.length; i++) {
        const row = lines[i];

        // Ensure we have at least 2 columns
        if (row.length >= 2) {
            const url = row[0].trim();
            // Combine all remaining columns as the message in case message contains commas
            const message = row.slice(1).join(',').trim();

            if (url && message) {
                profiles.push({
                    url: url,
                    message: message
                });
            }
        }
    }

    document.getElementById('profileCount').textContent = profiles.length;
    document.getElementById('startBtn').disabled = profiles.length === 0;
    logMessage(`Successfully imported ${profiles.length} profiles`, 'success');
}


function startSending() {
    if (profiles.length === 0) {
        logMessage('No profiles to process', 'error');
        return;
    }

    isRunning = true;
    currentIndex = 0;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;

    logMessage('Starting DM automation...', 'success');
    //console.log(profiles);
    processNextProfile();
}

function stopSending() {
    isRunning = false;
    clearInterval(timerInterval);
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    logMessage('Process stopped', 'error');
}
// Try to write to clipboard in a user-gesture context
async function writeToClipboard(text) {
    try {
        // Bring focus back to the side panel (if in an extension UI)
        window.focus();

        // Small delay to ensure focus (optional but helpful)
        await new Promise(resolve => setTimeout(resolve, 50));

        await navigator.clipboard.writeText(text);
        console.log('Copied:', text);
    } catch (err) {
        console.error('Clipboard API failed, falling back:', err);
    }
}



let previousTabId = null;
function processNextProfile() {
    if (!isRunning || currentIndex >= profiles.length) {
        stopSending();
        logMessage('All messages processed!', 'success');
        return;
    }

    // Close previous tab if it exists
    if (previousTabId) {
        chrome.tabs.remove(previousTabId);
    }

    const profile = profiles[currentIndex];

    //writeToClipboard(profile.message);

    logMessage(`Processing profile ${currentIndex + 1}/${profiles.length}: ${profile.url}`);

    // Calculate delay between messages (4-6 minutes to stay within 10-15 messages/hour)
    const delay = Math.floor(Math.random() * 120000) + 240000; // 4-6 minutes in milliseconds
    // delay for 15 to 20 seconds
    //const delay = Math.floor(Math.random() * 5000) + 15000;

    // Open the profile in a new tab
    chrome.tabs.create({ url: profile.url, active: true }, (tab) => {
        // Store the current tab id for closing in next iteration
        previousTabId = tab.id;
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                tabId = tab.id;
                // Remove listener after it's used
                chrome.tabs.onUpdated.removeListener(listener);

                // Execute the content script in the new tab
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                }, () => {
                    // Send the message to the content script
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'sendDM',
                        message: profile.message,
                        tabId: tab.id
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            logMessage(`Error processing ${profile.url}: ${chrome.runtime.lastError.message}`, 'error');
                        } else if (response && response.alreadyContacted && response.success) {
                            logMessage(`The person ${profile.url} has already been contacted`, 'duplicate');
                            sentCount++;
                            document.getElementById('sentCount').textContent = sentCount;
                        }
                        else if (response && response.success) {
                            sentCount++;
                            document.getElementById('sentCount').textContent = sentCount;
                            logMessage(`Message sent to ${profile.url}`, 'success');
                        } else {
                            logMessage(`Failed to send message to ${profile.url}`, 'error');
                        }

                        // Close the tab after processing
                        setTimeout(() => {
                            chrome.tabs.remove(tab.id);
                        }, 6000);

                        // Schedule next message
                        currentIndex++;
                        updateTimer(delay);
                        setTimeout(processNextProfile, delay);
                    });
                });
            }
        });
    });
};


function updateTimer(delay) {
    nextMessageTime = Date.now() + delay;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((nextMessageTime - Date.now()) / 1000));
        document.getElementById('timer').textContent = remaining;

        if (remaining <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

function logMessage(message, type = '') {
    const logContainer = document.getElementById('logContainer');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}


