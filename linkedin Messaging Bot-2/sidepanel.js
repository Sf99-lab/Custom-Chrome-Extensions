let urls = [];
let messages = [];
let selectedSpeed = '';
const uploadFileInput = document.getElementById('upload-file');
const uploadText = document.querySelector('label[for="upload-file"] span');
// Add an event listener to the file input
uploadFileInput.addEventListener('change', async function (event) {
    const file = event.target.files[0]; // Get the selected file

    // Update the upload text with the filename
    uploadText.textContent = file.name;
});

document.getElementById('startButton').addEventListener('click', () => {
    urls = [];
    messages = [];
    selectedSpeed = '';
    //if start button is clicked make the pause button resume if it is pause
    const pauseResumeButtonState = document.getElementById('pauseResumeButton').textContent;
    const pauseResumeButton = document.getElementById('pauseResumeButton');
    pauseResumeButton.textContent = pauseResumeButtonState === 'Pause' ? 'Pause' : 'Pause';
    setPauseResumeState('resume');

    //clean screen
    document.getElementById('status').style.display = 'block'; 
    document.getElementById('status').innerText = '';
    document.getElementById('remainingUrls').innerText = '';
    document.getElementById('pause').innerText = '';
    const speedSelector = document.getElementById('speed-selector');
    selectedSpeed = speedSelector.value;

    const file = uploadFileInput.files[0];
    if (!file) {
        alert('Please upload a file first');
        return;
    }

    const reader = new FileReader();

    reader.onload = function(event) {
        const csvContent = event.target.result; 
        const lines = csvContent.split('\n'); 


        // URL, Message
        //const data = lines.slice(1) // Skip the header row
        const data = lines.map(line => line.split(',')) // Split each line by commas into [URL, Message]
            .filter(row => row.length === 2); // Filter out any malformed rows

        data.forEach(row => {
            urls.push(row[0].trim());  
            messages.push(row[1].trim());    
        });

        // Send the extracted URLs and messages to the background script
            chrome.runtime.sendMessage({
                action: 'SEND_MESSAGE',
                urls: urls,
                messages: messages,
                speed: selectedSpeed
            });
 
    };

    reader.readAsText(file);

});

// sidepanel.js
let intervalId = '';
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateSidePanel') {
        const milliseconds = message.payload;
        const seconds = millisecondsToSeconds(milliseconds);

        let remainingSeconds = seconds;
        // const pauseResumeContainers = document.getElementsByClassName('pause-resume-container');

        // for (let i = 0; i < pauseResumeContainers.length; i++) {
        //     pauseResumeContainers[i].style.display = 'block';
        // }
        document.getElementById('remainingUrls').innerText = `Users left to message: ${message.remainingUrls}`;
        if (message.remainingUrls !== 0) {
            intervalId = setInterval(() => {
                if (remainingSeconds <= 0) {
                    clearInterval(intervalId);
                    document.getElementById('status').innerText = 'Sending Message in Progress ⏳';
                } else {
                    document.getElementById('status').innerText = `Sending Next Message in:⏱ ${remainingSeconds}`;

                    remainingSeconds--;
                }
            }, 1000);
        } else {
            document.getElementById('status').innerText = 'Complete';
        }

    }
});
function millisecondsToSeconds(milliseconds) {
    return Math.floor(milliseconds / 1000);
}


const pauseResumeButton = document.getElementById('pauseResumeButton');

// Function to get the stored value
function getPauseResumeState(callback) {
    chrome.storage.local.get('pauseResumeState', (result) => {
        const state = result['pauseResumeState'] || 'resume'; // Default to 'resume' if no value is stored
        callback(state); // Call the callback function with the state
    });
}

// Function to store the value
function setPauseResumeState(state) {
    chrome.storage.local.set({ 'pauseResumeState': state });
}

// Button click event listener
pauseResumeButton.addEventListener('click', () => {
    getPauseResumeState((currentState) => {
        const newState = currentState === 'pause' ? 'resume' : 'pause';
        setPauseResumeState(newState);

        // Update button text based on the new state
        pauseResumeButton.textContent = newState === 'pause' ? 'Resume' : 'Pause';

        // If the new state is 'resume', perform any additional actions
        if (newState === 'resume') {

                chrome.runtime.sendMessage({
                    action: 'RESUME',
                    urls: urls,
                    messages: messages,
                    speed: selectedSpeed
                });
                document.getElementById('status').style.display = 'block';
                document.getElementById('status').innerText = '';
                document.getElementById('pause').innerText = '';
        } else if (newState === 'pause') {
            if (intervalId) {
                clearInterval(intervalId);
            }
            document.getElementById('status').style.display = 'none';
            document.getElementById('pause').innerText = 'Message sending paused';
        }
    });
});

// Get the initial state and update button text
getPauseResumeState((state) => {
    pauseResumeButton.textContent = state === 'pause' ? 'Resume' : 'Pause';
});
