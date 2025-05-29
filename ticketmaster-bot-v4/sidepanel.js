document.addEventListener('DOMContentLoaded', () => {
  // Store extracted data
  let extractedTicketData = [];

  // Load saved settings and any stored data
  chrome.storage.local.get(['minPrice', 'maxPrice', 'ticketQuantity', 'isMonitoring', 'extractedTicketData'], (data) => {
    document.getElementById('minPrice').value = data.minPrice || 0;
    document.getElementById('maxPrice').value = data.maxPrice || 100;
    document.getElementById('ticketQuantity').value = data.ticketQuantity || 1;
    //document.getElementById('minRow').value = data.minRow || 0;
    //document.getElementById('maxRow').value = data.maxRow || 999;
    updateStatus(data.isMonitoring);
    
    // If we have stored data, display it
    if (data.extractedTicketData && data.extractedTicketData.length > 0) {
      extractedTicketData = data.extractedTicketData;
      displayData(extractedTicketData);
    }
  });

  // Start button
  document.getElementById('startBtn').addEventListener('click', () => {
    const minPrice = parseFloat(document.getElementById('minPrice').value);
    const maxPrice = parseFloat(document.getElementById('maxPrice').value);
    const ticketQuantity = parseInt(document.getElementById('ticketQuantity').value);
    //const minRow = parseInt(document.getElementById('minRow').value);
    //const maxRow = parseInt(document.getElementById('maxRow').value);
    
    if (minPrice >= maxPrice) {
      updateStatus(false, "Min price must be less than max price");
      return;
    }
    
    // if (minRow >= maxRow) {
    //   updateStatus(false, "Min row must be less than max row");
    //   return;
    // }
    
    if (ticketQuantity < 1) {
      updateStatus(false, "Ticket quantity must be at least 1");
      return;
    }
    
    chrome.storage.local.set({ minPrice, maxPrice, ticketQuantity, isMonitoring: true }, () => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {action: "startMonitoring"})
            .catch(err => console.log("Error sending message to tab:", err));
        } else {
          console.log("No active tab found");
        }
      });
      updateStatus(true, "Monitoring started");
    });
  });

  // Stop button
  document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.storage.local.set({isMonitoring: false}, () => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {action: "stopMonitoring"})
            .catch(err => console.log("Error sending message to tab:", err));
        }
      });
      updateStatus(false, "Monitoring stopped");
    });
  });

  // Download button
  document.getElementById('downloadBtn').addEventListener('click', () => {
    if (extractedTicketData.length === 0) {
      alert('No data available to download');
      return;
    }
    
    // Get event title and venue from storage
    chrome.storage.local.get(['eventTitle', 'venue'], (data) => {
      const eventTitle = data.eventTitle || 'unknown-event';
      const venue = data.venue || 'unknown-venue';
      
      // Calculate total tickets
      const totalTickets = extractedTicketData.reduce((sum, item) => sum + (item.count || 0), 0);
      
      // Create CSV content
      const headers = ['Section', 'Count', 'Max Price', 'Inventory Types'];
      let csvContent = [
        headers.join(','),
        ...extractedTicketData.map(item => 
          `${item.section},${item.count},${item.maxPrice},${item.inventoryTypes.join('|')}`)
      ].join('\n');
      
      // Add total tickets at the end
      csvContent += `\n\nTotal Tickets,${totalTickets}`;
      
      // Format the current date
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Create a safe filename (remove invalid characters)
      const safeEventTitle = eventTitle.replace(/[\\/:*?"<>|]/g, '_');
      const safeVenue = venue.replace(/[\\/:*?"<>|]/g, '_');
      const fileName = `${safeEventTitle}_${safeVenue}_${currentDate}.csv`;
      
      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // Listen for messages from content script via background script
  chrome.runtime.onMessage.addListener((message) => {
    //console.log("Sidepanel received message:", message);
    if (message.type === "extracted-data" && message.data) {
      extractedTicketData = message.data;
      displayData(extractedTicketData);
      
      // Also store in local storage
      chrome.storage.local.set({ extractedTicketData });
    }
  });

  function displayData(data) {
    const dataContainer = document.getElementById('dataContainer');
    const totalTicketsElement = document.getElementById('totalTickets');
    
    if (!data || data.length === 0) {
      dataContainer.innerHTML = '<p>No data available yet. Open Ticket Flipping extension to collect ticket data.</p>';
      totalTicketsElement.textContent = 'Total Available Tickets: 0';
      return;
    }
    
    dataContainer.innerHTML = '';
    
    // Calculate total tickets
    const totalTickets = data.reduce((sum, item) => sum + (item.count || 0), 0);
    totalTicketsElement.textContent = `Total Available Tickets: ${totalTickets}`;
    
    // Create a simple table to display the data
    const table = document.createElement('table');
    
    // Add header row
    const headerRow = document.createElement('tr');
    ['Section', 'Count', 'Max Price', 'Type'].forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    // Add data rows
    data.forEach(item => {
      const row = document.createElement('tr');
      
      const sectionCell = document.createElement('td');
      sectionCell.textContent = item.section;
      
      const countCell = document.createElement('td');
      countCell.textContent = item.count;
      
      const priceCell = document.createElement('td');
      priceCell.textContent = `${item.maxPrice}`;
      
      const typeCell = document.createElement('td');
      typeCell.textContent = item.inventoryTypes.join(', ');
      
      row.appendChild(sectionCell);
      row.appendChild(countCell);
      row.appendChild(priceCell);
      row.appendChild(typeCell);
      
      table.appendChild(row);
    });
    
    dataContainer.appendChild(table);
  }

  function updateStatus(isMonitoring, message) {
    const status = document.getElementById('status');
    if (message) {
      status.textContent = message;
    } else {
      status.textContent = isMonitoring ? 'Monitoring Active' : 'Monitoring has stop';
    }
    status.style.color = isMonitoring ? 'green' : 'red';
  }
});