async function sendMessage(message) {
    try {
        // Wait for the page to load
        await new Promise(resolve => setTimeout(resolve, 5000));  // Adjust timeout as needed

        const nameElement = document.querySelector('h1.text-heading-xlarge');
        const name = nameElement.textContent;
        const firstName = name.split(' ')[0];
        let updatedMessage = message.replace(/Hi there!|Hi!|Hello!|Hey!/g, `Hi ${firstName}!`);
        // click message button
        const messageBtn = document.querySelector('button[aria-label^="Message"]');
        if (messageBtn) {
            messageBtn.click();

        } else {
            console.log("Direct Message button not found.");
            const moreActions = document.querySelectorAll('button[aria-label="More actions"]');
            moreActions[1].click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            const messageBtn = document.querySelector('div[aria-label^="Message"]');

            messageBtn.click();
        
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        const messageDiv = document.querySelector('.msg-form__contenteditable[contenteditable="true"]');
    
        // Simulate focus state
        messageDiv.focus();
        messageDiv.setAttribute('data-artdeco-is-focused', 'true');
    
        // Write the message with HTML tags
        messageDiv.innerHTML = `<p>${updatedMessage}</p>`;  // Use <p> tags to mimic manual typing
    
        // Dispatch an 'input' event to simulate user interaction
        const event = new Event('input', {
            bubbles: true,
            cancelable: true
        });
        messageDiv.dispatchEvent(event);
    
        await new Promise(resolve => setTimeout(resolve, 2000));
        const sendButton = document.querySelector('button.msg-form__send-btn[type="submit"]');
    
        sendButton.click();
        await new Promise(resolve => setTimeout(resolve, 3000));
    
        closeConversation();
        // Notify background script that the message has been sent
        chrome.runtime.sendMessage({ action: 'messageSent' });


    } catch (error) {
        console.log(error);
        closeConversation();
        // Notify background script that the message has not sent
        chrome.runtime.sendMessage({ action: 'messageNotSent' });
    }
}



async function closeConversation() {
    // Find the button that contains specific text and click it
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        if (button.innerText.includes('Close your conversation')) {
            button.click();
        }
    });

}

// function waitForElement(selector, timeout = 8000) {
//     return new Promise((resolve, reject) => {
//         const startTime = Date.now();

//         function check() {
//             const element = document.querySelector(selector);
//             if (element) {
//                 resolve(element);
//             } else if (Date.now() - startTime > timeout) {
//                 reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms`));
//             } else {
//                 setTimeout(check, 500);  // Retry every 500ms
//             }
//         }

//         check();
//     });
// }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'sendMessage') {
        sendMessage(message.message);
    }
});
console.log('content loaded')