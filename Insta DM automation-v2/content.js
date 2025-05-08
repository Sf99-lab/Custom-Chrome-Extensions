chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendDM') {
        sendDM(request.message, request.tabId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep the message channel open for async response
    }
});

async function checkInLocation1() {
    const sections = document.querySelectorAll('section');
    let clicked = false;

    // Loop through each <section>
    for (const section of sections) {
        if (clicked) return true;

        const divs = section.querySelectorAll('div');
        for (const div of divs) {
            if (div.textContent.trim() === 'Message' && div.getAttribute('role') === 'button') {
                div.click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                clicked = true;
                return true;
            }
        }
    }

    return false; // Return false if no message button is found
}

async function checkInLocation2() {
    // Find all div elements with role="button" and tabindex="0"
    const buttons = document.querySelectorAll('div[role="button"][tabindex="0"]');

    if (buttons.length === 0) {
        return false;
    }

    for (const div of buttons) {
        const svg = div.querySelector('svg[aria-label="Options"]');

        if (svg) {
            div.click();

            // Wait for 3 seconds
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Find all buttons on the page with the specified textContent
            const messageButtons = document.querySelectorAll('button');
            for (const button of messageButtons) {
                if (button.textContent.trim() === 'Send message') {
                    button.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return true;
                }
            }
            return false;
        }
    }

    return false;
}



async function inputMessage(message) {
    const editableDiv = document.querySelector('div[aria-label="Message"][contenteditable="true"]');

    try {
        // Copy to clipboard
        await navigator.clipboard.writeText(message);
        // Ensure window and document are focused
        window.focus();
        document.body.focus();

        // Focus the contenteditable div and wait a bit
        editableDiv.focus();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create keyboard events for Ctrl+V
        const events = [
            new KeyboardEvent('keydown', {
                key: 'Control',
                code: 'ControlLeft',
                keyCode: 17,
                which: 17,
                bubbles: true,
                cancelable: true,
                ctrlKey: true
            }),
            new KeyboardEvent('keydown', {
                key: 'v',
                code: 'KeyV',
                keyCode: 86,
                which: 86,
                bubbles: true,
                cancelable: true,
                ctrlKey: true
            }),
            new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            })
        ];

        // Dispatch all events
        events.forEach(event => {
            editableDiv.dispatchEvent(event);
        });

        // Dispatch input event
        editableDiv.dispatchEvent(new Event('input', { bubbles: true }));

        // Alternative: Try execCommand as fallback
        if (!editableDiv.textContent) {
            document.execCommand('paste');
        }

        return true;
    } catch (error) {
        console.warn('Unable to paste text:', error);

        // Fallback method: Try direct insertion
        try {
            editableDiv.textContent = message;
            const inputEvent = new Event('input', { bubbles: true });
            editableDiv.dispatchEvent(inputEvent);
            return true;
        } catch (fallbackError) {
            console.warn('Fallback method failed:', fallbackError);
            return false;
        }
    }
}



async function clickSend() {
    await new Promise(resolve => setTimeout(resolve, 2500));
    //console.log('clicking send');
    const buttons = document.querySelectorAll('div[role="button"][tabindex="0"]');
    for (let b = 0; b < buttons.length; b++) {
        if (buttons[b].textContent.trim() === 'Send') {
            buttons[b].click();
            return;
        }
    }

}

async function sendDM(message, tabId) {
    return new Promise((resolve, reject) => {
        // Wait for the page to load
        detectElement('svg[aria-label="Options"]').then( async found => {
            if (found) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                // Try to find the message button in different locations
                let messageButtonL1 = await checkInLocation1();
                if (messageButtonL1) {
                    console.log('Message button found');
                    // wait before inputing message
                    detectElement('div[aria-label="Message"][contenteditable="true"]').then(found => {
                        if (found) {
                            let c2 = inputMessage(message);
                            //console.log(c2)
                            if (c2) {
                                clickSend();
                                resolve();
                            }
                        } else {
                            console.log('Element not found.');
                        }
                    });

                } else {
                    console.log('Message button not found in Location 1');

                    let messageButtonL2 = await checkInLocation2();
                    console.log('Message button found in L 2 ', messageButtonL2);
                    if (messageButtonL2) {
                        console.log('Message button found in Location 2');
                        // wait before inputing message
                        // Usage
                        detectElement('div[aria-label="Message"][contenteditable="true"]').then(found => {
                            if (found) {
                                console.log('Element found!');
                                let c2 = inputMessage(message);
                                //console.log(c2)
                                if (c2) {
                                    console.log('Message inputted suscess');
                                    clickSend();
                                    resolve();
                                }
                            } else {
                                console.log('Element not found.');
                            }
                        });

                    }

                }
            } else {
                console.log('Message button not found.');
                reject(new Error('Message button not found.'));
            }
        });
    });
}

function detectElement(selector, maxAttempts = 15, interval = 1000) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const checkElement = setInterval(() => {
            attempts++;
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(checkElement);
                resolve(true);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkElement);
                resolve(false);
            }
        }, interval);
    });
}



console.log('Content script loaded');