// Wait for the DOM to be fully loaded before running the app
document.addEventListener('DOMContentLoaded', () => {

  // --- CONFIGURATION (Hardcoded defaults) ---
  const config = {
    domain: "app.staffbase.com",
    allemailsview: true,
    emaillistlimit: 100,
    defaultemailpagesize: 5,
    defaultrecipientpagesize: 5,
    enablecsvdownload: true,
    emailid: undefined, // Only used if allemailsview is false
    apiTimeout: 2000 // NEW: 2-second timeout for API calls
  };

  // --- GLOBAL STATE ---
  const state = {
    currentView: config.allemailsview ? 'list' : 'detail',
    selectedEmailId: config.allemailsview ? undefined : config.emailid,
    allEmails: [],
    recipientData: null,
    loading: true,
    error: null,
    recipientSearchTerm: "",
    emailListPage: 0,
    recipientPage: 0,
    emailsPerPage: config.defaultemailpagesize,
    recipientsPerPage: config.defaultrecipientpagesize,
    sinceDate: new Date(), // Will be set in init
    untilDate: createSafeNow(), // Will be set in init
    detailSinceDate: new Date(), // Will be set in init
    detailUntilDate: createSafeNow(), // Will be set in init
    emailStats: null,
    sortConfig: { key: null, direction: 'original' },
  };

  // --- DOM ELEMENT REFERENCES ---
  const $ = (selector) => document.querySelector(selector);
  const $id = (id) => document.getElementById(id);

  const loadingContainer = $id('loading-container');
  const errorContainer = $id('error-container');
  const listView = $id('list-view');
  const detailView = $id('detail-view');

  // List View Elements
  const sinceDateInput = $id('sinceDate');
  const untilDateInput = $id('untilDate');
  const emailListContainer = $id('email-list-container');
  const emailPageSizeSelect = $id('email-page-size');
  const emailPrevPageBtn = $id('email-prev-page');
  const emailNextPageBtn = $id('email-next-page');
  const emailPageInfo = $id('email-page-info');

  // Detail View Elements
  const backButton = $id('back-button');
  const detailTitle = $id('detail-title');
  const recipientSearchInput = $id('recipient-search');
  const detailSinceDateInput = $id('detailSinceDate');
  const detailUntilDateInput = $id('detailUntilDate');
  const emailStatsContainer = $id('email-stats-container');
  const exportCsvButton = $id('export-csv-button');
  const recipientTableContainer = $id('recipient-table-container');
  const recipientPageSizeSelect = $id('recipient-page-size');
  const recipientPrevPageBtn = $id('recipient-prev-page');
  const recipientNextPageBtn = $id('recipient-next-page');
  const recipientPageInfo = $id('recipient-page-info');

  // --- API FUNCTIONS (from api.ts) ---

  const userProfileCache = new Map();

  /**
   * NEW: A helper function to fetch with a timeout.
   */
  const fetchWithTimeout = (url, timeout = config.apiTimeout) => {
    const controller = new AbortController();
    const signal = controller.signal;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(new Error('API Timeout'));
      }, timeout);
    });

    const fetchPromise = fetch(url, { signal });

    return Promise.race([fetchPromise, timeoutPromise]);
  };

  const streamEmailEvents = async (domain, emailId, since, until) => {
    const baseUrl = `https://${domain}`;
    const url = `${baseUrl}/api/email-performance/${emailId}/events?since=${since}&until=${until}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    let response;
    try {
      // UPDATED: Use fetchWithTimeout
      response = await fetchWithTimeout(proxyUrl);
    } catch (e) {
      console.error("Fetch failed (timeout or network error):", e);
      throw new Error("API request failed, falling back to dummy data.");
    }
    
    if (!response.ok) {
        throw new Error("Proxy or API request failed.");
    }

    const data = await response.json();
    const textData = data.contents; // allorigins specific

    if (!textData) {
        console.warn("No data from API/proxy, returning empty.");
        return [];
    }
    
    return textData
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.warn("Failed to parse event line:", line, e);
          return null;
        }
      })
      .filter(Boolean);
  };

  const fetchUserProfile = async (domain, userId) => {
    if (userProfileCache.has(userId)) {
      return userProfileCache.get(userId);
    }
    const baseUrl = `https://${domain}`;
    const url = `${baseUrl}/api/profiles/public/${userId}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    // UPDATED: Use fetchWithTimeout
    const response = await fetchWithTimeout(proxyUrl);
    
    if (!response.ok) {
        throw new Error("Failed to fetch user profile");
    }

    const data = await response.json();
    const user = JSON.parse(data.contents); // allorigins specific

    userProfileCache.set(userId, user);
    return user;
  };

  const getAllSentEmails = async (domain, limit) => {
    const baseUrl = `https://${domain}`;
    const url = `${baseUrl}/api/email-service/emails/sent?limit=${limit}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

    // UPDATED: Use fetchWithTimeout
    const response = await fetchWithTimeout(proxyUrl);

    if (!response.ok) {
        throw new Error("Failed to fetch sent emails");
    }

    const data = await response.json();
    const result = JSON.parse(data.contents); // allorigins specific

    return result.data;
  };

  // --- UPDATED DUMMY DATA ---

  const getRelativeDate = (daysAgo, hours = 0, minutes = 0) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(date.getHours() - hours);
    date.setMinutes(date.getMinutes() - minutes);
    return date.toISOString();
  };

  const getDummySentEmails = () => {
    console.warn("Using dummy data for sent emails list.");
    return [
      { id: "dummy-email-1", title: "The Heart Behind the Care 💙", thumbnailUrl: null, sentAt: getRelativeDate(2), sender: { name: "Marcus Barlow" }, targetAudience: { totalRecipients: 150 } },
      { id: "dummy-email-2", title: "Weekly Newsletter", thumbnailUrl: null, sentAt: getRelativeDate(7), sender: { name: "Nicole Adams" }, targetAudience: { totalRecipients: 1200 } },
      { id: "dummy-email-3", title: "Townhall Briefing", thumbnailUrl: null, sentAt: getRelativeDate(15), sender: { name: "Nicole Adams" }, targetAudience: { totalRecipients: 85 } },
    ];
  };
  
  const getDummyData = () => {
    console.warn("Using dummy data for email performance widget.");
    return [
      { user: { id: "dummy1", firstName: "Nicole", lastName: "Adams", avatarUrl: "https://cdn.prod.website-files.com/65b3b9f9bfb500445a7573e5/65dda761c0fad5c4f2e3b9ae_OGS%20Female%20Student.png" }, sentTime: getRelativeDate(1, 2, 5), wasOpened: true, opens: [{ openTime: getRelativeDate(1, 1, 0), clicks: [{ clickTime: getRelativeDate(1, 0, 55), targetUrl: "https://www.staffbase.com/blog/" }] }] },
      { user: { id: "dummy2", firstName: "Eira", lastName: "Topé", avatarUrl: null }, sentTime: getRelativeDate(1, 2, 5), wasOpened: true, opens: [{ openTime: getRelativeDate(0, 20, 0), clicks: [] }] },
      { user: { id: "dummy3", firstName: "Jean", lastName: "Kirstein", avatarUrl: "" }, sentTime: getRelativeDate(1, 2, 5), wasOpened: false, opens: [] },
      { user: { id: "dummy4", firstName: "Ash", lastName: "Krishnan", avatarUrl: null }, sentTime: getRelativeDate(1, 2, 5), wasOpened: true, opens: [{ openTime: getRelativeDate(0, 10, 30), clicks: [] }] },
      { user: { id: "dummy5", firstName: "Shirley", lastName: "Lai", avatarUrl: null }, sentTime: getRelativeDate(1, 2, 5), wasOpened: false, opens: [] },
      { user: { id: "dummy6", firstName: "Jon", lastName: "Lam", avatarUrl: null }, sentTime: getRelativeDate(1, 2, 5), wasOpened: false, opens: [] },
    ];
  };

  // --- DATA FETCHING LOGIC ---

  const getSentEmailsData = async (domain, limit) => {
    if (domain.toLowerCase().includes("dummy")) {
      return getDummySentEmails();
    }
    try {
      const emails = await getAllSentEmails(domain, limit);
      // UPDATED: Load dummy data if API returns empty or null
      if (!emails || emails.length === 0) {
        console.log("No sent emails found. Loading dummy data.");
        return getDummySentEmails();
      }
      return emails;
    } catch (error) {
      console.error(
        `❗️ Failed to get sent emails list (${error.message}). Loading dummy data as fallback.`,
        error
      );
      return getDummySentEmails();
    }
  };
  
  const getEmailPerformanceData = async (emailId, domain, since, until) => {
    if (!emailId || emailId.toLowerCase().includes("dummy")) {
      return getDummyData();
    }
    try {
      const events = await streamEmailEvents(domain, emailId, since, until);
      // UPDATED: Load dummy data if API returns empty
      if (events.length === 0) {
        console.log("No events found for this email. Loading dummy data.");
        return getDummyData();
      }
      
      const results = await processEvents(domain, events);
      // UPDATED: Load dummy data if processing returns empty
      if (results.length === 0) {
          console.log("Event processing resulted in no data. Loading dummy data.");
          return getDummyData();
      }
      return results;
      
    } catch (error) {
      console.error(
        `❗️ Failed to get email performance data (${error.message}). Loading dummy data as fallback.`,
        error
      );
      return getDummyData();
    }
  };

  // --- HELPER FUNCTIONS (from React component) ---

  const toInputDateTimeString = (date) => {
    const pad = (num) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  function createSafeNow() {
    const now = new Date();
    now.setSeconds(now.getSeconds() - 10); // 10 sec buffer
    return now;
  };

  const formatDisplayDateTime = (isoString) => {
    if (!isoString) return "N/A";
    return new Date(isoString).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };
  
  const escapeCsvField = (field) => {
    if (field === null || field === undefined) return '""';
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return `"${stringField}"`;
  };

  // --- EVENT HANDLERS (Fetching) ---
  
  // UPDATED: Simplified fetchAllEmails
  const fetchAllEmails = async () => {
    state.loading = true;
    state.error = null;
    render();
    try {
      // getSentEmailsData now handles all fallback logic
      const result = await getSentEmailsData(config.domain, config.emaillistlimit);
      state.allEmails = result;
    } catch (err) {
      // This catch is for unexpected errors, though getSentEmailsData should be robust
      state.error = "A critical error occurred. Loading dummy data.";
      state.allEmails = getDummySentEmails();
    } finally {
      state.loading = false;
      render();
    }
  };
  
  // UPDATED: Simplified fetchRecipientData
  const fetchRecipientData = async () => {
    state.loading = true;
    state.error = null;
    state.recipientData = null;
    render();
    
    try {
      // getEmailPerformanceData now handles all fallback logic
      const result = await getEmailPerformanceData(
        state.selectedEmailId, 
        config.domain, 
        state.detailSinceDate.toISOString(), 
        state.detailUntilDate.toISOString()
      );
      state.recipientData = result;
    } catch (err) {
      // This catch is for unexpected errors
      state.error = "A critical error occurred. Loading dummy data.";
      state.recipientData = getDummyData();
    } finally {
      state.loading = false;
      render();
    }
  };

  // --- REMAINDER OF THE CODE (UNCHANGED) ---
  
  // --- RENDERING FUNCTIONS (replaces JSX) ---

  const processEvents = async (domain, events) => {
    if (!events || events.length === 0) return [];
    
    const eventsByUser = new Map();
    for (const event of events) {
      if (!event || !event.eventSubject) continue;
      const userIdMatch = event.eventSubject.match(/user\/(.*)/);
      if (userIdMatch && userIdMatch[1]) {
        const userId = userIdMatch[1];
        if (!eventsByUser.has(userId)) {
          eventsByUser.set(userId, []);
        }
        eventsByUser.get(userId).push(event);
      }
    }
    
    const uniqueUserIds = Array.from(eventsByUser.keys());
    const userProfiles = await Promise.all(
      uniqueUserIds.map((id) => fetchUserProfile(domain, id).catch(() => null))
    );
    
    const userProfileMap = new Map(
      userProfiles.filter((p) => p).map((p) => [p.id, p])
    );
    
    const recipientInteractions = [];
    for (const [userId, userEvents] of eventsByUser.entries()) {
      const userProfile = userProfileMap.get(userId);
      if (!userProfile) continue;
      
      userEvents.sort(
        (a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
      );
      
      const interaction = {
        user: userProfile,
        sentTime: null,
        wasOpened: false,
        opens: [],
      };
      
      let lastOpenDetail = null;
      for (const event of userEvents) {
        switch (event.eventType) {
          case "sent":
            interaction.sentTime = event.eventTime;
            break;
          case "open":
            interaction.wasOpened = true;
            lastOpenDetail = { openTime: event.eventTime, clicks: [] };
            interaction.opens.push(lastOpenDetail);
            break;
          case "click":
            if (lastOpenDetail && event.eventTarget) {
              lastOpenDetail.clicks.push({
                clickTime: event.eventTime,
                targetUrl: event.eventTarget,
              });
            }
            break;
        }
      }
      recipientInteractions.push(interaction);
    }
    return recipientInteractions.sort((a, b) =>
      a.user.lastName.localeCompare(b.user.lastName)
    );
  };
  
  const render = () => {
    loadingContainer.style.display = state.loading ? 'block' : 'none';
    errorContainer.style.display = state.error ? 'block' : 'none';
    listView.style.display = (!state.loading && !state.error && state.currentView === 'list') ? 'block' : 'none';
    detailView.style.display = (!state.loading && !state.error && state.currentView === 'detail') ? 'block' : 'none';

    if (state.loading) return;

    if (state.error) {
      errorContainer.textContent = state.error;
      // Don't return; allow rendering to proceed with dummy data if it was loaded
    }

    if (state.currentView === 'list') {
      renderListView();
    } else if (state.currentView === 'detail') {
      renderDetailView();
    }
  };
  
  const renderListView = () => {
    sinceDateInput.value = toInputDateTimeString(state.sinceDate);
    untilDateInput.value = toInputDateTimeString(state.untilDate);
    
    const filteredEmails = state.allEmails.filter(email => {
        const sent = new Date(email.sentAt);
        return sent >= state.sinceDate && sent <= state.untilDate;
    });
    
    const emailPageCount = Math.ceil(filteredEmails.length / state.emailsPerPage);
    // Reset page if current page is out of bounds
    if (state.emailListPage >= emailPageCount && emailPageCount > 0) {
        state.emailListPage = emailPageCount - 1;
    }

    const paginatedEmails = filteredEmails.slice(
        state.emailListPage * state.emailsPerPage, 
        (state.emailListPage + 1) * state.emailsPerPage
    );

    emailListContainer.innerHTML = '';
    if (paginatedEmails.length > 0) {
      paginatedEmails.forEach(email => {
        emailListContainer.appendChild(createEmailListItemElement(email));
      });
    } else {
      // This is where "no emails found" comes from. It's correct if filters match nothing.
      emailListContainer.innerHTML = '<div class="message-container">No emails found for the selected period.</div>';
    }

    emailPageSizeSelect.value = state.emailsPerPage;
    emailPageInfo.textContent = `Page ${state.emailListPage + 1} of ${emailPageCount || 1}`;
    emailPrevPageBtn.disabled = state.emailListPage === 0;
    emailNextPageBtn.disabled = state.emailListPage >= emailPageCount - 1;
  };
  
  const createEmailListItemElement = (email) => {
    const item = document.createElement('div');
    item.className = 'email-list-item';
    item.dataset.emailId = email.id;
    
    const recipientCount = email.targetAudience?.totalRecipients;
    
    item.innerHTML = `
      <div class="email-list-item-left">
        ${email.thumbnailUrl 
          ? `<img src="${email.thumbnailUrl}" alt="" class="email-thumbnail" />`
          : createPlaceholderThumbnailIcon('email-thumbnail')
        }
        <div class="email-info">
          <h4 class="email-title">${email.title || 'Untitled Email'}</h4>
          <p class="email-meta">Sent by ${email.sender.name || 'Unknown'} on ${formatDisplayDateTime(email.sentAt)}</p>
        </div>
      </div>
      <div class="email-list-item-right">
        ${recipientCount !== undefined 
          ? `<span class="recipient-count-pill">${recipientCount} Recipients</span>`
          : ''
        }
        <span class="email-chevron">&#8250;</span>
      </div>
    `;
    
    item.addEventListener('click', () => handleEmailSelect(email.id));
    return item;
  };

  const renderDetailView = () => {
    const selectedEmailTitle = state.allEmails.find(e => e.id === state.selectedEmailId)?.title || "Email";
    detailTitle.textContent = `"${selectedEmailTitle}" Performance`;
    
    recipientSearchInput.value = state.recipientSearchTerm;
    detailSinceDateInput.value = toInputDateTimeString(state.detailSinceDate);
    detailUntilDateInput.value = toInputDateTimeString(state.detailUntilDate);
    backButton.style.display = config.allemailsview ? 'flex' : 'none';
    exportCsvButton.style.display = config.enablecsvdownload ? 'flex' : 'none';
    
    if (state.recipientData && state.recipientData.length > 0) {
      const selectedEmail = state.allEmails.find(e => e.id === state.selectedEmailId);
      const totalRecipients = selectedEmail?.targetAudience?.totalRecipients ?? state.recipientData.length;
      const totalOpens = state.recipientData.reduce((sum, interaction) => sum + interaction.opens.length, 0);
      const uniqueOpens = state.recipientData.filter(interaction => interaction.wasOpened).length;
      state.emailStats = { totalRecipients, totalOpens, uniqueOpens };
    } else {
      state.emailStats = null;
    }
    
    if (state.emailStats) {
      emailStatsContainer.innerHTML = `
        <div class="stat-item">
          <span class="stat-value">${state.emailStats.totalRecipients}</span>
          <span class="stat-label">Recipients</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${state.emailStats.uniqueOpens}</span>
          <span class="stat-label">Unique Opens</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${state.emailStats.totalOpens}</span>
          <span class="stat-label">Total Opens</span>
        </div>
      `;
    } else {
      emailStatsContainer.innerHTML = '';
    }
    
    const sortedRecipients = getSortedRecipients();
    const filteredRecipients = sortedRecipients.filter(r => 
      `${r.user.firstName} ${r.user.lastName}`.toLowerCase().includes(state.recipientSearchTerm.toLowerCase())
    );
    
    const recipientPageCount = Math.ceil(filteredRecipients.length / state.recipientsPerPage);
    if (state.recipientPage >= recipientPageCount && recipientPageCount > 0) {
        state.recipientPage = recipientPageCount - 1;
    }

    const paginatedRecipients = filteredRecipients.slice(
        state.recipientPage * state.recipientsPerPage, 
        (state.recipientPage + 1) * state.recipientsPerPage
    );
    
    recipientTableContainer.innerHTML = '';
    if (paginatedRecipients.length > 0) {
      recipientTableContainer.appendChild(createRecipientTableElement(paginatedRecipients));
    } else {
      recipientTableContainer.innerHTML = `<div class="message-container">${(state.recipientData && state.recipientData.length > 0) ? 'No matching recipients found.' : 'No recipient data available for this email in the selected date range.'}</div>`;
    }
    
    recipientPageSizeSelect.value = state.recipientsPerPage;
    recipientPageInfo.textContent = `Page ${state.recipientPage + 1} of ${recipientPageCount || 1}`;
    recipientPrevPageBtn.disabled = state.recipientPage === 0;
    recipientNextPageBtn.disabled = state.recipientPage >= recipientPageCount - 1;
    
    exportCsvButton.disabled = !filteredRecipients || filteredRecipients.length === 0;
  };
  
  const createRecipientTableElement = (recipients) => {
    const table = document.createElement('table');
    table.className = 'performance-table';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th role="button" data-sort-key="recipient">Recipient</th>
        <th role="button" style="width: 120px" data-sort-key="status">Status</th>
      </tr>
    `;
    thead.querySelectorAll('th[role="button"]').forEach(th => {
      th.addEventListener('click', () => handleSort(th.dataset.sortKey));
    });
    
    const tbody = document.createElement('tbody');
    recipients.forEach(interaction => {
      const [row, detailsRow] = createRecipientRowElements(interaction);
      tbody.appendChild(row);
      tbody.appendChild(detailsRow);
    });
    
    table.appendChild(thead);
    table.appendChild(tbody);
    return table;
  };
  
  const createRecipientRowElements = (interaction) => {
    const row = document.createElement('tr');
    const isExpandable = interaction.sentTime || interaction.opens.length > 0;
    row.className = `recipient-row ${isExpandable ? 'expandable' : ''}`;
    
    let statusHtml;
    if (interaction.wasOpened) {
      const openCount = interaction.opens.length > 1 ? `<span class="open-count">(${interaction.opens.length}x)</span>` : '';
      statusHtml = `<span class="status-badge opened">Opened${openCount}</span>`;
    } else if (interaction.sentTime) {
      statusHtml = `<span class="status-badge sent">Sent</span>`;
    } else {
      statusHtml = `<span class="status-badge unknown">Unknown</span>`;
    }
    
    row.innerHTML = `
      <td>
        <div class="user-info">
          ${(interaction.user.avatarUrl && interaction.user.avatarUrl.startsWith('http'))
            ? `<img src="${interaction.user.avatarUrl}" alt="${interaction.user.firstName} ${interaction.user.lastName}" class="user-avatar" />`
            : createDefaultAvatarIcon('user-avatar')
          }
          <span>${interaction.user.firstName} ${interaction.user.lastName}</span>
        </div>
      </td>
      <td>
        <div class="status-cell">
          ${statusHtml}
          ${isExpandable ? `<span class="chevron">&#9654;</span>` : ''}
        </div>
      </td>
    `;
    
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    
    let detailsHtml = '';
    if (interaction.sentTime) {
      detailsHtml += `<div class="detail-block"><p><strong>Sent at:</strong> ${formatDisplayDateTime(interaction.sentTime)}</p></div>`;
    }
    interaction.opens.forEach((open, index) => {
      let clicksHtml = '';
      if (open.clicks.length > 0) {
        clicksHtml = '<ul>';
        open.clicks.forEach(click => {
          clicksHtml += `
            <li>
              <strong>Clicked link at ${formatDisplayDateTime(click.clickTime)}</strong>
              <a href="${click.targetUrl}" target="_blank" rel="noopener noreferrer">${click.targetUrl}</a>
            </li>
          `;
        });
        clicksHtml += '</ul>';
      }
      detailsHtml += `
        <div class="detail-block">
          <p><strong>Opened at:</strong> ${formatDisplayDateTime(open.openTime)}</p>
          ${clicksHtml}
        </div>
      `;
    });

    detailsRow.innerHTML = `
      <td colspan="2">
        <div class="details-container">
          <h4 style="color: #333; font-size: 1.15rem; font-weight: bold; padding-bottom: 0.7rem;">Interaction Details</h4>
          ${detailsHtml || '<p>No interaction details available.</p>'}
        </div>
      </td>
    `;

    if (isExpandable) {
      row.addEventListener('click', () => {
        detailsRow.classList.toggle('expanded');
        row.querySelector('.chevron').classList.toggle('expanded');
      });
    }
    
    return [row, detailsRow];
  };

  const createDefaultAvatarIcon = (className) => {
    return `
      <div class="${className} user-avatar-placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 18 18">
          <path fill="#E0E0E0" d="M9 0a9 9 0 0 0-9 9 8.654 8.654 0 0 0 .05.92 9 9 0 0 0 17.9 0A8.654 8.654 0 0 0 18 9a9 9 0 0 0-9-9zm5.42 13.42c-.01 0-.06.08-.07.08a6.975 6.975 0 0 1-10.7 0c-.01 0-.06-.08-.07-.08a.512.512 0 0 1-.09-.27.522.522 0 0 1 .34-.48c.74-.25 1.45-.49 1.65-.54a.16.16 0 0 1 .03-.13.49.49 0 0 1 .43-.36l1.27-.1a2.077 2.077 0 0 0-.19-.79v-.01a2.814 2.814 0 0 0-.45-.78 3.83 3.83 0 0 1-.79-2.38A3.38 3.38 0 0 1 8.88 4h.24a3.38 3.38 0 0 1 3.1 3.58 3.83 3.83 0 0 1-.79 2.38 2.814 2.814 0 0 0-.45.78v.01a2.077 2.077 0 0 0-.19.79l1.27.1a.49.49 0 0 1 .43-.36.16.16 0 0 1 .03.13c.2.05.91.29 1.65.54a.49.49 0 0 1 .25.75z"/>
        </svg>
      </div>
    `;
  };
  
  const createPlaceholderThumbnailIcon = (className) => {
    return `
      <div class="${className} placeholder-thumbnail">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 171 171" width="60%" height="60%">
          <g>
            <circle cx="85.5" cy="85.5" r="85.5" fill="#e0e0e0"/>
            <path d="M49.2,53.9,78.8,87a8.94,8.94,0,0,0,6.7,3,9.1,9.1,0,0,0,6.7-3l29.1-32.6a1.56,1.56,0,0,1,.8-.6,10.57,10.57,0,0,0-4-.8H52.9a10.06,10.06,0,0,0-3.9.8A.35.35,0,0,0,49.2,53.9Z" fill="#fff"/>
            <path d="M126.5,58a1.8,1.8,0,0,1-.6.9l-29,32.5a15.38,15.38,0,0,1-11.4,5.1,15.54,15.54,0,0,1-11.4-5.1L44.6,58.3l-.2-.2A9.75,9.75,0,0,0,43,63.2V108a9.94,9.94,0,0,0,10,9.9h65a9.94,9.94,0,0,0,10-9.9V63.2a10.19,10.19,0,0,0-1.5-5.2" fill="#fff"/>
          </g>
        </svg>
      </div>
    `;
  };
  
  const getSortedRecipients = () => {
    if (!state.recipientData) return [];
    const sortableData = [...state.recipientData];

    if (state.sortConfig.key && state.sortConfig.direction !== 'original') {
      sortableData.sort((a, b) => {
        if (state.sortConfig.key === 'recipient') {
          const nameA = `${a.user.firstName} ${a.user.lastName}`;
          const nameB = `${b.user.firstName} ${b.user.lastName}`;
          return state.sortConfig.direction === 'ascending' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
        if (state.sortConfig.key === 'status') {
          const getStatusScore = (item) => {
            if (item.wasOpened) return item.opens.length;
            if (item.sentTime) return 0;
            return -1;
          };
          const scoreA = getStatusScore(a);
          const scoreB = getStatusScore(b);
          return state.sortConfig.direction === 'descending' ? scoreB - scoreA : scoreA - scoreB;
        }
        return 0;
      });
    }
    return sortableData;
  };

  // --- EVENT HANDLERS (UI) ---

  const handleEmailSelect = (id) => {
    const selectedEmail = state.allEmails.find(email => email.id === id);
    if (!selectedEmail) return;

    const sentAtDate = new Date(selectedEmail.sentAt);
    const now = createSafeNow();
    const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;

    const newSince = new Date(sentAtDate.getTime() - 60 * 1000); // 1 min before
    const sentAtPlus30Days = new Date(sentAtDate.getTime() + thirtyDaysInMillis);
    const newUntil = sentAtPlus30Days < now ? sentAtPlus30Days : now;

    state.detailSinceDate = newSince;
    state.detailUntilDate = newUntil;
    state.selectedEmailId = id;
    state.currentView = 'detail';
    state.recipientSearchTerm = "";
    state.recipientPage = 0;
    
    fetchRecipientData();
  };

  const handleBackToList = () => {
    state.selectedEmailId = undefined;
    state.currentView = 'list';
    state.recipientData = null;
    state.sortConfig = { key: null, direction: 'original' };
    state.error = null; // Clear error when going back
    render();
  };

  const handleDetailDateChange = (value, type) => {
    const newDate = new Date(value);
    let since = type === 'since' ? newDate : state.detailSinceDate;
    let until = type === 'until' ? newDate : state.detailUntilDate;
    
    const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;
    const diff = until.getTime() - since.getTime();
    if (diff > thirtyDaysInMillis) {
      if (type === 'since') {
        until = new Date(since.getTime() + thirtyDaysInMillis);
      } else {
        since = new Date(until.getTime() - thirtyDaysInMillis);
      }
    }
    
    state.detailSinceDate = since;
    state.detailUntilDate = until;
    state.recipientPage = 0;
    
    fetchRecipientData(); // Re-fetch data for new date range
  };

  const handleSort = (key) => {
    const prev = state.sortConfig;
    const isNewKey = prev.key !== key;
    
    let newSortConfig;
    if (key === 'recipient') {
      if (isNewKey) newSortConfig = { key: 'recipient', direction: 'ascending' };
      else if (prev.direction === 'ascending') newSortConfig = { key: 'recipient', direction: 'descending' };
      else newSortConfig = { key: null, direction: 'original' };
    } else if (key === 'status') {
      if (isNewKey) newSortConfig = { key: 'status', direction: 'descending' };
      else if (prev.direction === 'descending') newSortConfig = { key: 'status', direction: 'ascending' };
      else newSortConfig = { key: null, direction: 'original' };
    } else {
      newSortConfig = { key: null, direction: 'original' };
    }
    
    state.sortConfig = newSortConfig;
    state.recipientPage = 0;
    render();
  };
  
  const handleCsvExport = () => {
    const sortedRecipients = getSortedRecipients();
    const filteredRecipients = sortedRecipients.filter(r => 
      `${r.user.firstName} ${r.user.lastName}`.toLowerCase().includes(state.recipientSearchTerm.toLowerCase())
    );
    
    if (!filteredRecipients || filteredRecipients.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = ["First Name", "Last Name", "User ID", "Interaction Type", "Interaction Time", "Clicked URL"];
    const csvRows = [headers.join(',')];

    for (const interaction of filteredRecipients) {
      const { user, sentTime, opens } = interaction;
      const baseRow = [escapeCsvField(user.firstName), escapeCsvField(user.lastName), escapeCsvField(user.id)];

      if (sentTime) {
        csvRows.push([...baseRow, escapeCsvField("Sent"), escapeCsvField(formatDisplayDateTime(sentTime)), escapeCsvField("")].join(','));
      }
      for (const open of opens) {
        csvRows.push([...baseRow, escapeCsvField("Open"), escapeCsvField(formatDisplayDateTime(open.openTime)), escapeCsvField("")].join(','));
        for (const click of open.clicks) {
          csvRows.push([...baseRow, escapeCsvField("Click"), escapeCsvField(formatDisplayDateTime(click.clickTime)), escapeCsvField(click.targetUrl)].join(','));
        }
      }
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const emailTitle = (state.allEmails.find(e => e.id === state.selectedEmailId)?.title || "email").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("href", url);
    link.setAttribute("download", `email_performance_${emailTitle}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  // --- INITIALIZATION ---

  const init = () => {
    const now = createSafeNow();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    state.sinceDate = thirtyDaysAgo;
    state.untilDate = now;
    state.detailSinceDate = thirtyDaysAgo;
    state.detailUntilDate = now;
    
    // Attach event listeners
    
    sinceDateInput.addEventListener('change', (e) => {
      state.sinceDate = new Date(e.target.value);
      state.emailListPage = 0;
      render();
    });
    untilDateInput.addEventListener('change', (e) => {
      state.untilDate = new Date(e.target.value);
      state.emailListPage = 0;
      render();
    });
    emailPageSizeSelect.addEventListener('change', (e) => {
      state.emailsPerPage = Number(e.target.value);
      state.emailListPage = 0;
      render();
    });
    emailPrevPageBtn.addEventListener('click', () => {
      if (state.emailListPage > 0) {
        state.emailListPage--;
        render();
      }
    });
    emailNextPageBtn.addEventListener('click', () => {
      state.emailListPage++;
      render();
    });

    backButton.addEventListener('click', handleBackToList);
    recipientSearchInput.addEventListener('input', (e) => {
      state.recipientSearchTerm = e.target.value;
      state.recipientPage = 0;
      render();
    });
    detailSinceDateInput.addEventListener('change', (e) => {
      handleDetailDateChange(e.target.value, 'since');
    });
    detailUntilDateInput.addEventListener('change', (e) => {
      handleDetailDateChange(e.target.value, 'until');
    });
    exportCsvButton.addEventListener('click', handleCsvExport);
    recipientPageSizeSelect.addEventListener('change', (e) => {
      state.recipientsPerPage = Number(e.target.value);
      state.recipientPage = 0;
      render();
    });
    recipientPrevPageBtn.addEventListener('click', () => {
      if (state.recipientPage > 0) {
        state.recipientPage--;
        render();
      }
    });
    recipientNextPageBtn.addEventListener('click', () => {
      state.recipientPage++;
      render();
    });
    
    // Initial data load
    if (state.currentView === 'list') {
      fetchAllEmails();
    } else if (state.currentView === 'detail' && state.selectedEmailId) {
      state.loading = true;
      state.error = null;
      render();
      // First fetch all emails (to get title) then fetch recipient data
      getSentEmailsData(config.domain, config.emaillistlimit)
        .then(emails => {
          state.allEmails = emails;
          fetchRecipientData(); // This will set loading=false and render
        })
        .catch(err => {
          state.error = "Failed to fetch initial email data.";
          state.allEmails = getDummySentEmails(); // Ensure fallback
          state.loading = false;
          render();
        });
    } else {
        state.loading = false;
        state.error = "Configuration error: No view to display.";
        render();
    }
  };

  // Run the app
  init();

});