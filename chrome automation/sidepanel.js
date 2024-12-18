let totalClicks = 0;
let visitedSites = 0;
let startTime = null;

const uploadFileInput = document.getElementById('upload-file');
const uploadText = document.querySelector('label[for="upload-file"] span');
// Add an event listener to the file input
uploadFileInput.addEventListener('change', async function (event) {
    const file = event.target.files[0]; // Get the selected file

    // Update the upload text with the filename
    uploadText.textContent = file.name;
});


document.getElementById('startButton').addEventListener('click', () => {

    const file = uploadFileInput.files[0];
    if (!file) {
        alert('Please upload a file first');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        const csvContent = event.target.result;
        // Split into lines and remove empty lines
        const lines = csvContent.split('\n').filter(line => line.trim());

        // Process the data
        const data = lines.map(line => {
            // Split by tabs and trim each value
            return line.split('\t').map(value => value.trim());
        });

        // Remove header row
        const header = data[0];
        const rows = data.slice(1);

        // Create structured data
        const websiteData = rows.map(row => {
            return row[0];
        });

        // Alternative structure with named properties
        const structuredData = websiteData.map(item => {
            const [website, ...numbers] = item.split(',');
            return {
                website: website,
                stay_time: {
                    stay_time1: parseInt(numbers[0]),
                    stay_time2: parseInt(numbers[1]),
                    stay_time3: parseInt(numbers[2]),
                    stay_time4: parseInt(numbers[3]),
                    stay_time5: parseInt(numbers[4]),
                    stay_time6: parseInt(numbers[5])
                }
            };
        });

        // console.log('Structured Data:', structuredData);

        // structuredData.forEach(item => {
        //     console.log(`Website: ${item.website}`);
        //     console.log('Values:', item.stay_time);
        //     console.log('-------------------');
        // });
        //chrome.runtime.sendMessage({ command: "start", attachment: structuredData });

        totalClicks = 0;
        visitedSites = 0;
        processWebsites(structuredData);
        setInterval(liveTimeCount, 1000);

    };

    reader.onerror = function (event) {
        console.error("File reading failed:", event.target.error);
    };

    reader.readAsText(file);
});


function liveTimeCount() {
    if(startTime != null){
    const elapsedTime = Date.now() - startTime; // Elapsed time in milliseconds
    const seconds = Math.floor(elapsedTime / 1000) % 60;
    const minutes = Math.floor(elapsedTime / 60000) % 60;
    const hours = Math.floor(elapsedTime / 3600000) % 24;
    const days = Math.floor(elapsedTime / 86400000);

    const timeString = `${days}d ${hours}h ${minutes}m ${seconds}`; // Format time as "Xd Xh Xm Xs"
    document.getElementById("time-running").textContent = `Time Running: ${timeString}s`;
    }
}

function updateUI() {

    
    // chrome.runtime.sendMessage({
    //     type: "updateUI",
    //     timeRunning: timeString,
    //     visited: visitedSites,
    //     clicks: totalClicks
    // });

    document.getElementById("visited").textContent = `Visited Sites: ${visitedSites}`;
    document.getElementById("number-of-clicks").textContent = `Number of Clicks: ${totalClicks}`;
}


async function visitWebsite(tabId, site) {
    return new Promise(async (resolve) => {
        // Navigate to website
        chrome.scripting.executeScript({
            target: { tabId },
            func: (url) => { window.location.href = url; },
            args: [site.website]
        });

        // Wait for page load
        await new Promise((res) => setTimeout(res, 3000));

        // Perform actions for each stay_time
        for (const key in site.stay_time) {
            const timeToWait = site.stay_time[key] * 60000; // gives waiting time in minutes.
            await new Promise((res) => setTimeout(res, timeToWait));
            chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const buttons = document.querySelectorAll("button, a, input[type='button'], input[type='submit']");

                    // Filter out links that have target="_blank" (links that open in new tabs)
                    const clickableElements = Array.from(buttons).filter(element => {
                        if (element.tagName === "A" && element.target === "_blank") {
                            return false; // Skip links that open in a new tab
                        }
                        return true; // Keep other elements
                    });
                    
                    // Randomly click on one of the valid elements
                    if (clickableElements.length > 0) {
                        const randomButton = clickableElements[Math.floor(Math.random() * clickableElements.length)];
                        randomButton.click();
                    }
                    
                }
            });
            totalClicks++;
            updateUI();
            //await new Promise((res) => setTimeout(res, timeToWait));
        }
        resolve();
    });
}

async function processWebsites(data) {
    
    // Process each website in sequence
    for (let i = 0; i < data.length; i++) {
        const site = data[i];
        visitedSites++;
        updateUI();

        await new Promise((resolve) => {
            // Create a new tab for the website
            chrome.tabs.create({ url: site.website, active: true }, async (tab) => {
                startTime = Date.now();
                // Perform the visit actions on the website
                await visitWebsite(tab.id, site);
                // Close the tab after processing
                chrome.tabs.remove(tab.id);
                resolve(); // Resolve the promise to move to the next website
            });
        });
    }

    // After finishing all websites, restart the process
    processWebsites(data);
}


// chrome.runtime.onMessage.addListener((message) => {
//     if (message.command === "start" ) {
//         totalClicks = 0;
//         visitedSites = 0;
//         startTime = Date.now();
//         processWebsites(message.attachment);
//     }
// });



////////////////// Update the Screen ////////////////////
// chrome.runtime.onMessage.addListener((message) => {
//     if (message.type === "updateUI") {
//         document.getElementById("time-running").textContent = `Time Running: ${message.timeRunning}s`;
//         document.getElementById("visited").textContent = `Visited Sites: ${message.visited}`;
//         document.getElementById("number-of-clicks").textContent = `Number of Clicks: ${message.clicks}`;
//     }
// });


  