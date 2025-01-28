const processedLinks = new Set();
const extractedData = []; // To store extracted information
let maxExternalLinks = 0; // Tracks the maximum number of external links

document.getElementById("start").addEventListener("click", async () => {
    //const searchUrl = "https://www.youtube.com/results?search_query=crypto&sp=EgIQAg%253D%253D";
    const searchUrl = document.getElementById('searchUrl').value;

    if (searchUrl == '') {
        alert('Please enter a search URL')
        return
    }
    // Open the YouTube search URL in a new tab
    const tab = await chrome.tabs.create({ url: searchUrl });

    try {
        // Wait for tab to be completely loaded
        await chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: extractChannelLinks,
                });
            }
        });

    } catch (error) {
        console.error('Script execution failed:', error);
    }

});

document.getElementById("download").addEventListener("click", () => {
    // Convert extracted data to CSV
    const csvContent = generateCSV(extractedData);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    // Create a link to download the file
    const link = document.createElement("a");
    link.href = url;
    link.download = "youtube_scraper_results.csv";
    link.click();

    URL.revokeObjectURL(url);
});

// Function to extract channel links from search results
async function extractChannelLinks() {
    //console.log('Extracting channel links');
    if (!window.processedLinks) window.processedLinks = new Set();

    while (true) {
        const channelLinks = Array.from(document.querySelectorAll("a.channel-link"))
            .map(link => link.getAttribute("href"));

        // Process links sequentially
        for (const link of channelLinks) {

            if (!window.processedLinks.has(link)) {
                window.processedLinks.add(link);

                // Update processed count
                chrome.runtime.sendMessage({ action: "updateProcessedCount", count: window.processedLinks.size });

                try {
                    //console.log('Processing link:', link);

                    // Send message to create tab and wait for response
                    // Send message to create tab and wait for response
                    const response = await new Promise((resolve, reject) => {
                        chrome.runtime.sendMessage({
                            action: "createTab",
                            url: `https://www.youtube.com${link}`
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('Runtime error:', chrome.runtime.lastError);
                                reject(chrome.runtime.lastError);
                                return;
                            }
                            //console.log('Received response from background:', response);
                            resolve(response);
                        });
                    });


                    // Wait for tab processing to complete
                    // await new Promise((resolve) => {
                    //     chrome.runtime.onMessage.addListener(function listener(msg) {
                    //         if (msg.action === "processingComplete") {
                    //             chrome.runtime.onMessage.removeListener(listener);
                    //             resolve();
                    //         }
                    //     });
                    // });

                    //console.log('Finished processing link:', link);

                    // Add small delay before processing next link
                    await new Promise(resolve => setTimeout(resolve, 1500));

                } catch (error) {
                    console.error('Error processing link:', link, error);
                }
            }
        }

        // Scroll to load more content
        window.scrollBy(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)); await new Promise(resolve => setTimeout(resolve, 5000));

        // Check if more content has loaded
        const newChannelLinks = Array.from(document.querySelectorAll("a.channel-link"))
            .map(link => link.getAttribute("href"));

        if (newChannelLinks.every(link => window.processedLinks.has(link))) {
            console.log("No new channel links found. Stopping...");
            break;
        }
    }
}


// Generate CSV content from extracted data
function generateCSV(data) {
    const header = ["Channel Link", "Subscribers", "Email", ...Array.from({ length: extractedData }, (_, i) => `External Link ${i + 1}`)];
    const rows = data.map(row => {
        // Fill missing columns with empty strings
        while (row.length < header.length) row.push("");
        return row.map(item => `"${item}"`).join(",");
    });
    return [header.join(","), ...rows].join("\n");
}

// Listen for messages to update UI or save data
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateProcessedCount") {
        // Update processed links count in the UI
        const countElement = document.getElementById("processed-count");
        countElement.textContent = `Processed Channels: ${request.count}`;
    } else if (request.action === "saveData") {
        //console.log('Saving Data: ', request.rowData)
        const rowData = request.rowData;
        extractedData.push(rowData);
    }
});





















//////////////////////////////////////////////////

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "createTab") {
        // Create new tab
        chrome.tabs.create({
            url: request.url,
            active: true
        }, async (tab) => {
            try {
                // Wait for tab to load completely
                await new Promise((resolve) => {
                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === tab.id && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    });
                });

                // Execute script in the tab
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: processChannelPage
                });

                // Wait for processing
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Close the tab
                await chrome.tabs.remove(tab.id);

                // Notify that processing is complete
                chrome.runtime.sendMessage({
                    action: "processingComplete"
                });

                // Send response back to the original message
                sendResponse({ success: true });

            } catch (error) {
                console.error('Error in tab processing:', error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true; // Will respond asynchronously
    }
});

async function processChannelPage() {

    try {
        const button = document.querySelector('.truncated-text-wiz__absolute-button');
        if (button) {
            button.click(); //click see more button
        }

        await new Promise(resolve => setTimeout(resolve, 4000));
        const subscriberCount = await getSubscriber();
        const email = await getEmail();
        const links = await getLinks();
        // console.log('Subscriber Count:', subscriberCount);
        // console.log('Email:', email);
        // console.log('Links:', links);


        const channelLink = window.location.href;

        // Prepare the row data
        const rowData = [channelLink, subscriberCount, email, ...links];
        chrome.runtime.sendMessage({ action: "saveData", rowData });

    } catch (error) {
        console.error('Error in processChannelPage:', error);
    }

    async function getSubscriber() {
        // Select the container by its ID
        const additionalInfoContainer = document.querySelector('#additional-info-container');
    
        // Check if the element exists
        if (additionalInfoContainer) {
            // Extract the text content of the div
            const subscribersText = additionalInfoContainer.innerText;
    
            // Use a regular expression to extract the subscriber count
            const subscriberMatch = subscribersText.match(/(\d[\d.,]*\s*[KM]?)\s+subscribers/i);
    
            if (subscriberMatch) {
                let subscriberCount = 'N/A'
                subscriberCount = subscriberMatch[1].trim(); // Extracted subscriber count
                //console.log('Subscriber Count:', subscriberCount);
                return subscriberCount;
            } else {
                console.log('Subscriber count not found in the text.');
            }
        } else {
            console.log('The #additional-info-container element was not found.');
        }
    
    }
    
    async function getEmail() {
        // Extract email if available
        // Get the container element with ID "about-container"
        const externalLinks = document.getElementById('about-container');
    
        // Variable to store the first email
        let email = 'Null';
    
        if (externalLinks) {
            // Get the text content of the container
            const txt = document.querySelectorAll('yt-attributed-string#description-container');
    
            // Regular expression to match email addresses
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
    
            // Find the first match using the regex
            const match = txt[0].textContent.match(emailRegex);
    
            if (match) {
                email = match[0]; // Get the first match
            }
            return email;
        } else {
            console.log('Container #about-container not found.');
        }
    }
    
    async function getLinks() {
        // Select the container with ID 'link-list-container'
        const linkListContainer = document.querySelector('#link-list-container');
        const externalLinks = [];
        // Check if the container exists
        if (linkListContainer) {
            // Select all <a> elements within the container
            const links = linkListContainer.querySelectorAll('a');
    
            // Extract and log the text content of each link
            links.forEach(link => {
                //console.log(link.textContent.trim());
                externalLinks.push(link.textContent.trim());
            });
            return externalLinks;
        } else {
            console.log('The #link-list-container element was not found.');
        }
    
    }
}


