let monitorActive = false;
let ticketsAdded = 0;
const processedTickets = new WeakSet();
let previousAvailableTickets = 0;

// Listen for start/stop commands
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    //console.log("Received message: ", request.action);
    if (request.action === "startMonitoring") {
        //Dont auto cart current tickets
        const availableSeats = Array.from(document.querySelectorAll('circle.seat.is-available'));
        const filteredSeats = Array.from(document.querySelectorAll('circle.seat.is-available.is-filtered'));
        const resaleSeats = Array.from(document.querySelectorAll('[class="seat is-available is-filtered is-resale is-custom"]'));

        // Combine both lists and filter out already processed tickets
        const availableTickets = [...availableSeats, ...filteredSeats, ...resaleSeats]; console.log("Current Available Tickets: ", availableTickets.length);
        availableTickets.forEach(ticket => processedTickets.add(ticket));
        monitorActive = true;
        startMonitoring();
    } else if (request.action === "stopMonitoring") {
        monitorActive = false;
    }
    sendResponse({ status: monitorActive ? "started" : "stopped" });
});

function startMonitoring() {
    if (!(monitorActive)) return;
    const ticketCardsDiv = document.querySelector('div[data-testid="TicketCards"] ul');
    const liCount = ticketCardsDiv ? ticketCardsDiv.querySelectorAll('li[data-bdd="ticket-stub-list"]').length : 0;
    ticketsAdded = liCount;
    // Check immediately
    checkForTickets();
}


async function checkForTickets() {
    if (!monitorActive) return;

    try {
        // Update total added to cart tickets
        const ticketCardsDiv = document.querySelector('div[data-testid="TicketCards"] ul');
        const liCount = ticketCardsDiv ? ticketCardsDiv.querySelectorAll('li[data-bdd="ticket-stub-list"]').length : 0;
        ticketsAdded = liCount;

        if (ticketsAdded >= await getTicketQuantity()) {
            console.log(`Already have ${ticketsAdded} tickets, no need to process more`);
            const nextButton = document.getElementById('ticketBag-buynow');
            if (nextButton) nextButton.click();
            return;
        }

        const { minPrice = 100, maxPrice = 150, ticketQuantity = 1, minRow = 0, maxRow = 999 } =
            await chrome.storage.local.get(['minPrice', 'maxPrice', 'ticketQuantity', 'minRow', 'maxRow']);

        // Get available tickets
        const availableTickets = getAvailableTickets();
        console.log('New Tickets to Process: ', availableTickets.length);

        if (availableTickets.length === 0) {
            setTimeout(checkForTickets, 1000);
            return;
        }

        // Process tickets by row
        const ticketsByRow = await groupTicketsByRow(availableTickets, minPrice, maxPrice, minRow, maxRow);
        await processTicketsByBestRow(ticketsByRow, ticketQuantity);
    } catch (error) {
        console.error('Error in checkForTickets:', error);
    }

    // Schedule next check if still monitoring
    if (monitorActive) {
        setTimeout(checkForTickets, 1000);
    }
}

function getAvailableTickets() {
    const availableSeats = Array.from(document.querySelectorAll('circle.seat.is-available'));
    const filteredSeats = Array.from(document.querySelectorAll('circle.seat.is-available.is-filtered'));
    const resaleSeats = Array.from(document.querySelectorAll('[class="seat is-available is-filtered is-resale is-custom"]'));

    return [...availableSeats, ...filteredSeats, ...resaleSeats]
        .filter(ticket => !processedTickets.has(ticket));
}

async function getTicketQuantity() {
    const { ticketQuantity = 1 } = await chrome.storage.local.get(['ticketQuantity']);
    return ticketQuantity;
}

async function groupTicketsByRow(availableTickets, minPrice, maxPrice, minRow, maxRow) {
    const ticketsByRow = {};
    const processedRows = new Set();

    for (let i = 0; i < availableTickets.length; i++) {
        const ticket = availableTickets[i];
        const info = await getTicket_Type_Price_RowNum(ticket);

        // Skip if not meeting criteria
        if (info.type.includes('Official Platinum') ||
            info.price < minPrice ||
            info.price > maxPrice)
        //info.row < minRow || 
        //info.row > maxRow) 
        {
            processedTickets.add(ticket);
            continue;
        }

        // Add to row group
        const row = info.row;
        if (!ticketsByRow[row]) {
            ticketsByRow[row] = [];
        }
        ticketsByRow[row].push({ ticket, ...info });

        // Mark as processed
        processedTickets.add(ticket);
    }

    return ticketsByRow;
}

async function processTicketsByBestRow(ticketsByRow, ticketQuantity) {
    // Sort rows numerically (best/lowest row first)
    const sortedRows = Object.keys(ticketsByRow)
        .map(Number)
        .sort((a, b) => a - b);

    // console.log('Sorted Rows: ', sortedRows);

    // Process tickets from best rows first
    for (const row of sortedRows) {
        const rowTickets = ticketsByRow[row];

        // Only process this row if it has enough tickets
        if (rowTickets.length >= ticketQuantity) {
            console.log(`Processing row ${row} with ${rowTickets.length} tickets`);

            // Process up to ticketQuantity tickets from this row
            for (let i = 0; i < Math.min(ticketQuantity, rowTickets.length); i++) {
                if (ticketsAdded >= ticketQuantity) {
                    const nextButton = document.getElementById('ticketBag-buynow');
                    if (nextButton) nextButton.click();
                    return;
                }

                addToCart(rowTickets[i].ticket);
                ticketsAdded++;

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (ticketsAdded >= ticketQuantity) return;
        }
    }
}

async function getTicket_Type_Price_RowNum(ticket) {
    // Simulate hover to trigger the DOM updates
    simulateHover(ticket);

    // Use a shorter delay and check if the required DOM updates have occurred
    let parentDiv;
    for (let attempts = 0; attempts < 8; attempts++) {
        parentDiv = document.querySelector('div[data-bdd="listing-desc"]');
        if (parentDiv) break; // Exit loop if parentDiv is found
        await new Promise(resolve => setTimeout(resolve, 50)); // Short delay
    }

    if (!parentDiv) {
        console.error('Parent div not found after multiple attempts.');
        return { type: 'dummyReturn', price: 0 };
    }

    try {
        // Extract the listing type
        const listingTypeElement = parentDiv.querySelector('div[data-bdd="listing-type"]');
        const listingType = listingTypeElement?.textContent.trim() || 'Unknown';

        // Extract the listing price
        const listingPriceElement = parentDiv.querySelector('div[data-bdd="listing-price"]');
        const listingPrice = listingPriceElement
            ? parseFloat(listingPriceElement.textContent.trim().replace('$', ''))
            : 0;

        const rowNumElement = document.querySelector('span[data-bdd="stub-row-value"]');
        const rowNum = rowNumElement ? parseFloat(rowNumElement.textContent.trim()) : '0';

        // console.log('Listing row Number: ', rowNum);
        // console.log('Listing Type:', listingType);
        // console.log('Listing Price:', listingPrice);

        return { type: listingType, price: listingPrice, row: rowNum };
    } catch (error) {
        console.error('Error extracting ticket information:', error);
        return { type: 'dummyReturn', price: 0 };
    }
}


function simulateHover(element) {
    element.classList.add('is-hover');
    const mouseOver = new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
        view: window
    });
    element.dispatchEvent(mouseOver);
}

function addToCart(element) {
    //console.log('Adding to cart...');
    simulateHover(element);

    const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
    });
    element.dispatchEvent(clickEvent);

    setTimeout(() => {
        const buyFromTooltip = document.getElementById('resale-tooltip-checkout-button');
        if (buyFromTooltip) {
            //console.log('Buy from tooltip clicked');
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            buyFromTooltip.dispatchEvent(clickEvent);
        }
    }, 500);
}

function getExtensionData(event) {
    // Extract the event title (first <h1> inside the section with aria-label="Event Header")
    const eventTitle = document.querySelector('section[aria-label="Event Header"] h1')?.textContent.trim();
    const venue = document.querySelector('section[aria-label="Event Header"] span a')?.textContent.trim();

    // Store event title and venue in local storage for use in sidepanel
    chrome.storage.local.set({ eventTitle, venue });

    let parsedData;
    try {
        parsedData = JSON.parse(event.data.text);

        if (parsedData && parsedData.facets) {
            // Extract the facets array and filter for inventoryTypes = ["primary"]
            const facets = parsedData.facets.filter(facet =>
                facet.inventoryTypes &&
                facet.inventoryTypes.length === 1 &&
                facet.inventoryTypes[0] === "primary"
            );

            // Map over filtered facets to extract required fields
            const extractedData = facets.map(facet => ({
                section: facet.section || "Unknown",
                count: facet.count || 0,
                maxPrice: facet.listPriceRange && facet.listPriceRange[0] ? facet.listPriceRange[0].max : 0,
                inventoryTypes: facet.inventoryTypes || []
            }));

            //console.log("Sending extracted data:", extractedData);
            // Also store in local storage
            chrome.storage.local.set({ extractedTicketData: extractedData });

            // Send data to sidepanel
            chrome.runtime.sendMessage({
                type: "extracted-data",
                data: extractedData
            }).then(() => {
                //remove listener
                //window.removeEventListener("message", messageHandler);
            });
        }
    } catch (e) {
        console.log('Error processing data:', e);
    }
}
function checkDropTickets(event) {
    const availableTickets = event.data?.text?.eventLevelAvailability?.facets.reduce((sum, item) => sum + item.count, 0);

    // Log the current count
    console.log(`Available tickets: ${availableTickets} (previous: ${previousAvailableTickets})`);

    // Check if tickets have increased
    if (availableTickets > previousAvailableTickets && previousAvailableTickets !== 0) {
        console.log(`Tickets increased by ${availableTickets - previousAvailableTickets}!`);

        for (ticketsAdded = 0; ticketsAdded <= getTicketQuantity(); ticketsAdded++) {
            // Select all <path> elements with a class attribute that includes 'is-available'
            const element = document.querySelector('path[class*="is-available"]');
            if (element) {
                // Simulate a click event
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                element.dispatchEvent(event);
            }
            setTimeout(() => {
                // Select the button using its 'data-bdd' attribute
                const button = document.querySelector('button[data-bdd="tooltip-subtotal-add"]');
                if (button) {
                    button.click();
                } else {
                    console.log('Button not found!');
                }

            }, 1000);
        }
    }

    // Update the previous count for next comparison
    previousAvailableTickets = availableTickets;
}
// Declare handler as a named function
const messageHandler = (event) => {
    //console.log('EVENT listener:', event.data);
    if (event.data.type === "FROM_PAGE2") {
        getExtensionData(event);
        // console.log('From page 2:', event.data);

    } else if (event.data.type === "GET_REQUEST") {
        getExtensionData(event);
        //console.log('Get request..', event.data)
    }

    // Then modify your event handler for STORE events
    else if (event.data.type === "STORE") {
        //console.log('Store data:', event.data?.text?.eventLevelAvailability?.facets);
        checkDropTickets(event);

    }


};

// Add event listener
window.addEventListener("message", messageHandler);