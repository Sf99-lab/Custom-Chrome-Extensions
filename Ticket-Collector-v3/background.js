chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// chrome.webRequest.onAuthRequired.addListener((details, callback) => {
//     console.log('onAuthRequired2', details);
//     callback({
//         authCredentials: {
//             username: 'guest',
//             password: 'guest'
//         }
//     });
// },
//     { urls: ["<all_urls>"] },
//     ['asyncBlocking']
// );
