// Flag to track if we've already sent a message for STORE event
let storeMessageSent = false;

// Declare handler as a named function
const messageHandler = (event) => {
    //console.log("Message intercepted:", event.data);
    if (event.data.type === "workerData") {
        // console.log("Worker data intercepted:", event.data);
        // 1. event.data.data is the JSON string
        let obj;
        try {
            obj = typeof event.data.data === "string"
                ? JSON.parse(event.data.data)
                : event.data;
        } catch (e) {
            console.error("Failed to parse workerData JSON:", e);
            return;
        }

        // 2. Safely grab the geometry array
        const geometry = obj.payload?.geometry;
        if (!Array.isArray(geometry)) {
            console.error("No geometry array found in payload:", obj.payload);
            return;
        }

        // 3. Sum all totalSeatCount values
        const totalSeats = geometry.reduce((sum, seg) => {
            return sum + (seg.totalSeatCount || 0);
        }, 0);


        // 3. Sum all availableSeatCount values
        const availableSeats = geometry.reduce((sum, seg) => {
            return sum + (seg.availableSeatCount || 0);
        }, 0);

        console.log("Available seats:", availableSeats); // → 1290

        console.log("Total seats:", totalSeats); // → 1733


        window.removeEventListener('message', messageHandler);
        //get current url
        let currentUrl = window.location.href;
        let dateCollected = new Date().toLocaleDateString('en-CA', {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Uses system's local time zone
        });
        chrome.runtime.sendMessage({
            type: "message_event_intercepted",
            event: currentUrl,
            total: totalSeats,
            available: availableSeats,
            date: dateCollected,
            source: event.origin
        });

    } else if (event.data?.type === "STORE" && event.data?.text?.eventLevelAvailability && !storeMessageSent) {
        //display the array
        //console.log("facets:", event.data.text.eventLevelAvailability.facets);
        try {
            const data = event.data.text.eventLevelAvailability.facets;
            if (Array.isArray(data)) {
                const remainingSeats = data.reduce((total, item) => total + (item.count || 0), 0);
                console.log("Remaining Seats:", remainingSeats);
                let currentUrl = window.location.href;
                let dateCollected = new Date().toLocaleDateString('en-CA', {
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Uses system's local time zone
                });
                chrome.runtime.sendMessage({
                    type: "remainingSeatsFound",
                    event: currentUrl,
                    total: 'N/A',
                    available: remainingSeats,
                    date: dateCollected,
                    source: event.origin
                });

                // Set flag to prevent sending more messages
                storeMessageSent = true;
                console.log("STORE message sent, no more will be sent");
            } else {
                console.error("Data is not an array. Cannot compute total seats.");
            }
        } catch (e) {
            console.error("Failed to get remaining seats");
        }
    }


};

// Remove duplicate event listener - only need one
window.addEventListener("message", messageHandler);

// Confirm injection
console.log("Message interceptor content script loaded");