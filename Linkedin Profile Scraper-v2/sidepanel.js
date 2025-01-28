// Store references to DOM elements
const startButton = document.getElementById('startButton');
const downloadButton = document.getElementById('download');
const collectedProfiles = document.getElementById('collectedProfiles');
const urlInput = document.getElementById('urlInput');
let currentUrls = [];
let currentUrlIndex = 0;
let profileLinks = new Set(); // Use Set to avoid duplicate links
let isScrapingActive = false;
let hasNextPage = [];
hasNextPage[0] = { result: false };

// Add event listeners
startButton.addEventListener('click', handleStartClick);
downloadButton.addEventListener('click', handleDownloadClick);

async function handleStartClick() {
    if (!isScrapingActive) {
        profileLinks.clear()
        isScrapingActive = true;
        startButton.textContent = 'Stop';
        downloadButton.disabled = false;

        // just to be more careful
        if (currentUrlIndex >= currentUrls.length) {
            currentUrlIndex = 0;
        }

        // Get and validate URLs
        currentUrls = urlInput.value.split('\n')
            .map(url => url.trim())
            .filter(url => url.length > 0);

        if (currentUrls.length === 0) {
            alert('Please enter at least one URL');
            return;
        }

        try {
            await processNextUrl();
        } catch (error) {
            console.error('Error during scraping:', error);
        }

    } else {
        isScrapingActive = false;
        startButton.textContent = 'Start';
        downloadButton.disabled = false;
    }
}

// function to process URLs sequentially
async function processNextUrl() {
    if (!isScrapingActive || currentUrlIndex >= currentUrls.length) {
        isScrapingActive = false;
        startButton.textContent = 'Start';
        downloadButton.disabled = false;
        return;
    }


    const currentUrl = currentUrls[currentUrlIndex];

    // if (!hasNextPage[0].result) {
    //     hasNextPage[0] = { result: true };
    // Create a new tab with the current URL
    chrome.tabs.create({ url: currentUrl, active: true }, async function (tab) {
        // Wait for the tab to load
        await new Promise(resolve => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            });
        });

        // Process the tab
        await extractLinkedInProfiles(tab.id);
        //if complete process
        if (currentUrlIndex === currentUrls.length - 1) {
            alert('Linkedin Profile Extraction Completed');

        }
        // Close the tab when done
        chrome.tabs.remove(tab.id);

        // Move to next URL
        currentUrlIndex++;
        await processNextUrl();
    });
    // } else {

    //     // Process the tab
    //     chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    //         const currentTabId = tabs[0].id;
    //         // Use the tab ID here
    //         extractLinkedInProfiles(currentTabId);
    //     });


    // }
}

function handleDownloadClick() {
    if (profileLinks.size === 0) {
        alert('No profiles collected yet!');
        return;
    }
    downloadCSV(profileLinks);
}
// Helper function to download CSV
function downloadCSV(dataSet, filename = 'linkedin_profiles.csv') {
    // Step 1: Convert Set to an array
    const profiles = Array.from(dataSet);

    if (profiles.length === 0) {
        console.error('No data to download.');
        return;
    }

    // Step 2: Convert the array of objects to CSV format
    const headers = Object.keys(profiles[0]).join(','); // Get the headers (keys of the object)
    const rows = profiles.map(profile =>
        Object.values(profile).map(value => `"${value}"`).join(',')
    ); // Convert each object to a CSV row

    const csvContent = [headers, ...rows].join('\n'); // Combine headers and rows

    // Step 3: Create a blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


async function extractLinkedInProfiles(tabId) {
    // Helper function to scroll to the bottom of the page
    async function scrollToBottom() {
        return new Promise(async (resolve) => {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    window.scrollTo(0, document.body.scrollHeight);
                }
            });
            resolve();
        });
    }

    // Helper function to extract profile links
    async function getProfileLinks() {
        return new Promise(async (resolve) => {
            const result = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    // return Array.from(
                    //     document.querySelectorAll('a.scale-down')
                    // ).map(link => link.href);

                    const lists = document.querySelectorAll('ul[role="list"]');
                    let foundList = null;

                    for (let lis of lists) {
                        let i = lis.querySelectorAll('li');
                        if (i.length > 3) {
                            foundList = lis; // Store the found list
                            break; // Stop the loop
                        }
                    }


                    if (foundList) { // Ensure lists is not null
                        const items = foundList.querySelectorAll('li');
                        //console.log(items);

                        let profiles = [];

                        items.forEach((list) => {
                            const verifiedBadge = list.querySelector('svg[aria-label="Verified member"]');
                            const premiumBadge = list.querySelector('li-icon[aria-label="Premium member"]');
                            const linkFound = list.querySelector('a.scale-down');

                            if (linkFound) {
                                //console.log(linkFound.href);

                                // Construct a profile object
                                let profile = {
                                    profile_URL: linkFound.href,
                                    Account_Type: verifiedBadge ? 'Verified' : premiumBadge ? 'Premium' : ''
                                };

                                profiles.push(profile); // Add profile object to the array
                            }
                        });

                        //console.log(profiles); // Log the final array of profiles
                        return profiles;
                    } else {
                        console.error('No list found with the specified selector.');
                    }

                }
            });

            // Add the links to the Set
            if (result && result[0] && result[0].result) {
                result[0].result.forEach(profile => {
                    profileLinks.add(profile); // Add each profile object or link
                });

                updateStatus();
            }

            resolve();
        });
    }

    // Function to update status
    function updateStatus() {
        collectedProfiles.textContent = `Collected Profiles: (${profileLinks.size})`;
    }

    // Main loop
    while (isScrapingActive) {
        await scrollToBottom();
        if (!isScrapingActive) break;

        await getProfileLinks();

        hasNextPage = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const nextButton = document.querySelector('button[aria-label="Next"]') ||
                    document.querySelector('a[aria-label="Next"]');

                if (nextButton) {
                    if (nextButton.disabled) {
                        return false;
                    } else {
                        nextButton.click();
                        return true;
                    }
                } else {
                    //console.log("Button not found.");
                }
            }
        });
        //console.log(hasNextPage);

        if (hasNextPage[0].result === null) {
            //console.log("Button not found.");
        } else if (hasNextPage[0].result === true) {
            //console.log("Button is enabled.");
        } else if (hasNextPage[0].result === false) {
            // console.log("Button is disabled.");
            break;
        }
        // if (!hasNextPage[0].result) {
        //     // isScrapingActive = false;
        //     // startButton.textContent = 'Start';
        //     // downloadButton.disabled = false;
        //     break;
        // }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

// Add error handling
window.addEventListener('error', function (event) {
    console.error('An error occurred:', event.error);
    isScrapingActive = false;
    startButton.textContent = 'Start';
    downloadButton.disabled = false;
});

// Initialize button states
downloadButton.disabled = profileLinks.size === 0;









///////////////////////// Real-time monitoring of textarea //////////////////////////////////////////

// Add event listeners for real-time monitoring
urlInput.addEventListener('input', handleTextareaChange);
urlInput.addEventListener('paste', handleTextareaChange);
urlInput.addEventListener('paste', handlePaste);

// Enhanced textarea change handler
function handleTextareaChange(event) {
    const content = urlInput.value;
    const urls = content.split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

    let warningMessage = '';
    const invalidUrls = [];

    urls.forEach((url, index) => {
        if (!isValidLinkedInUrl(url)) {
            invalidUrls.push(`Line ${index + 1}: ${url}`);
        }
    });

    // Update warning display
    const warningElement = document.getElementById('urlWarning') ||
        createWarningElement();

    if (invalidUrls.length > 0) {
        warningElement.textContent = `Invalid URLs found:\n${invalidUrls.join('\n')}`;
        warningElement.style.display = 'block';
        startButton.disabled = true;
    } else if (urls.length === 0) {
        currentUrlIndex = 0; //make sure to start from Start if new Urls are entered
        warningElement.textContent = 'Please enter at least one URL';
        warningElement.style.display = 'block';
        startButton.disabled = true;
    } else {
        warningElement.style.display = 'none';
        startButton.disabled = false;
    }

    updateUrlCounter(urls.length);
}

function createWarningElement() {
    const warningDiv = document.createElement('div');
    warningDiv.id = 'urlWarning';
    warningDiv.className = 'url-warning';
    urlInput.parentNode.insertBefore(warningDiv, urlInput.nextSibling);
    return warningDiv;
}

// Function to validate LinkedIn URLs (basic check)
function isValidLinkedInUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('linkedin.com');
    } catch {
        return false;
    }
}

// Add paste event listener
function handlePaste(event) {
    // Get the current selection range
    const startPos = urlInput.selectionStart;
    const endPos = urlInput.selectionEnd;
    const currentContent = urlInput.value;

    // Check if all content is selected
    const isAllSelected = (startPos === 0 && endPos === currentContent.length && currentContent.length > 0);

    if (isAllSelected) {
        //console.log('All content selected, replacing content');
        // After paste cleanup
        setTimeout(() => {
            // Reset URL index since content was replaced
            currentUrlIndex = 0;

            // Update URL counter if it exists
            const urls = urlInput.value.split('\n')
                .map(url => url.trim())
                .filter(url => url.length > 0);
            updateUrlCounter(urls.length);
        }, 0);
    }
}


// Function to update URL counter display
function updateUrlCounter(count) {
    // Assuming you add this element to your HTML
    const counterElement = document.getElementById('urlCounter');
    if (counterElement) {
        counterElement.textContent = `${count} URL${count !== 1 ? 's' : ''} entered`;
    }
}

