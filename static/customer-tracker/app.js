/**
 * CustomerPulse - Customer Profile & Timeline Tracker
 * Core Application Logic
 */

(function () {
  'use strict';

  // LocalStorage Keys
  const STORAGE_KEY = 'customerpulse_customers_v1';
  const THEME_KEY = 'customerpulse_theme_pref';

  // Global State
  let state = {
    customers: [],
    activeCustomerId: null,
    sortOrder: 'newest', // 'newest' | 'oldest'
    filterCategory: 'ALL',
    searchQuery: '',
    selectedCategory: 'Note'
  };

  // Category Icon SVGs
  const CATEGORY_ICONS = {
    'Note': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    'Meeting': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    'Call': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
    'Follow-up': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    'Milestone': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    'Issue': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
  };

  // DOM Elements
  const elements = {
    // Top Bar
    statCustomerCount: document.getElementById('statCustomerCount'),
    statUpdateCount: document.getElementById('statUpdateCount'),
    btnLoadDemo: document.getElementById('btnLoadDemo'),
    btnDataMenu: document.getElementById('btnDataMenu'),
    dataDropdownMenu: document.getElementById('dataDropdownMenu'),
    btnExportAllCsv: document.getElementById('btnExportAllCsv'),
    btnExportJson: document.getElementById('btnExportJson'),
    fileImportJson: document.getElementById('fileImportJson'),
    btnClearAllData: document.getElementById('btnClearAllData'),
    btnThemeToggle: document.getElementById('btnThemeToggle'),

    // Customer Selection
    customerSelect: document.getElementById('customerSelect'),
    btnOpenNewCustomerModal: document.getElementById('btnOpenNewCustomerModal'),

    // Active Profile Card
    customerProfileSection: document.getElementById('customerProfileSection'),
    profileAvatar: document.getElementById('profileAvatar'),
    profileName: document.getElementById('profileName'),
    profileInitialNote: document.getElementById('profileInitialNote'),
    profileCreatedAt: document.getElementById('profileCreatedAt'),
    profileLastActive: document.getElementById('profileLastActive'),
    profileUpdateCount: document.getElementById('profileUpdateCount'),
    btnExportPdf: document.getElementById('btnExportPdf'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    btnEditCustomer: document.getElementById('btnEditCustomer'),
    btnDeleteCustomer: document.getElementById('btnDeleteCustomer'),

    // Workspace & Welcome
    activeWorkspaceGrid: document.getElementById('activeWorkspaceGrid'),
    noCustomerState: document.getElementById('noCustomerState'),
    btnWelcomeNewCustomer: document.getElementById('btnWelcomeNewCustomer'),
    btnWelcomeDemo: document.getElementById('btnWelcomeDemo'),

    // Update Composer Form
    updateForm: document.getElementById('updateForm'),
    categoryPills: document.getElementById('categoryPills'),
    selectedCategoryInput: document.getElementById('selectedCategory'),
    updateDateTime: document.getElementById('updateDateTime'),
    updateContent: document.getElementById('updateContent'),
    updateTag: document.getElementById('updateTag'),

    // Timeline Controls & Feed
    timelineCounterBadge: document.getElementById('timelineCounterBadge'),
    timelineSearchInput: document.getElementById('timelineSearchInput'),
    timelineCategoryFilter: document.getElementById('timelineCategoryFilter'),
    btnToggleSort: document.getElementById('btnToggleSort'),
    sortOrderLabel: document.getElementById('sortOrderLabel'),
    timelineFeed: document.getElementById('timelineFeed'),
    timelineEmptyState: document.getElementById('timelineEmptyState'),

    // Modals
    modalNewCustomer: document.getElementById('modalNewCustomer'),
    btnCloseNewCustomerModal: document.getElementById('btnCloseNewCustomerModal'),
    btnCancelNewCustomer: document.getElementById('btnCancelNewCustomer'),
    formNewCustomer: document.getElementById('formNewCustomer'),
    inputCustomerName: document.getElementById('inputCustomerName'),
    inputCustomerNotes: document.getElementById('inputCustomerNotes'),

    modalEditCustomer: document.getElementById('modalEditCustomer'),
    btnCloseEditCustomerModal: document.getElementById('btnCloseEditCustomerModal'),
    btnCancelEditCustomer: document.getElementById('btnCancelEditCustomer'),
    formEditCustomer: document.getElementById('formEditCustomer'),
    editCustomerId: document.getElementById('editCustomerId'),
    editCustomerName: document.getElementById('editCustomerName'),
    editCustomerNotes: document.getElementById('editCustomerNotes'),

    modalEditUpdate: document.getElementById('modalEditUpdate'),
    btnCloseEditUpdateModal: document.getElementById('btnCloseEditUpdateModal'),
    btnCancelEditUpdate: document.getElementById('btnCancelEditUpdate'),
    formEditUpdate: document.getElementById('formEditUpdate'),
    editUpdateId: document.getElementById('editUpdateId'),
    editUpdateCategory: document.getElementById('editUpdateCategory'),
    editUpdateDateTime: document.getElementById('editUpdateDateTime'),
    editUpdateContent: document.getElementById('editUpdateContent'),
    editUpdateTag: document.getElementById('editUpdateTag'),

    toastContainer: document.getElementById('toastContainer')
  };

  // =========================================================================
  // Initialization
  // =========================================================================

  function init() {
    initTheme();
    setDefaultDateTime();
    bindEvents();
    loadData();
  }

  // Set default datetime picker to current local time in "YYYY-MM-DDTHH:mm" format
  function setDefaultDateTime() {
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    if (elements.updateDateTime) {
      elements.updateDateTime.value = localIso;
    }
  }

  // =========================================================================
  // Theme Management
  // =========================================================================

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    showToast(`Switched to ${next} mode`, 'info');
  }

  // =========================================================================
  // Centralized Server Persistence & Storage
  // =========================================================================

  let lastServerHash = '';
  let syncInterval = null;

  function getCurrentLoggedInUser() {
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        const u = JSON.parse(stored);
        if (u && (u.fullName || u.username)) {
          return u.fullName || u.username;
        }
      }
    } catch (e) {}
    return 'Operator';
  }

  async function loadData() {
    // Step 1: Immediately load local cache so UI displays instantly without lag
    let localCustomers = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        localCustomers = JSON.parse(raw);
        if (Array.isArray(localCustomers) && localCustomers.length > 0) {
          state.customers = localCustomers;
          lastServerHash = JSON.stringify(localCustomers);
        }
      }
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }

    updateGlobalStats();
    if (state.customers.length > 0) {
      const initialId = state.customers[0].id;
      populateCustomerDropdown(initialId);
      selectCustomer(initialId);
    } else {
      renderApp();
    }

    // Step 2: Fetch and merge with central server database
    try {
      let response;
      if (localCustomers && localCustomers.length > 0) {
        // Automatically sync & merge any previously created local profiles
        response = await fetch('/api/customer-tracker/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customers: localCustomers })
        });
      } else {
        response = await fetch('/api/customer-tracker/data');
      }

      if (response && response.ok) {
        const result = await response.json();
        if (result && result.success && Array.isArray(result.customers)) {
          state.customers = result.customers;
          lastServerHash = JSON.stringify(state.customers);
          localStorage.setItem(STORAGE_KEY, lastServerHash);
          updateGlobalStats();

          if (state.customers.length > 0) {
            const currentId = (state.activeCustomerId && state.customers.some(c => c.id === state.activeCustomerId))
              ? state.activeCustomerId
              : state.customers[0].id;
            populateCustomerDropdown(currentId);
            selectCustomer(currentId);
          } else {
            renderApp();
          }
        }
      }
    } catch (err) {
      console.warn('Backend server sync offline or unreachable, running in local cached mode:', err);
    }

    // Step 3: Start continuous auto-sync polling for real-time collaboration
    startAutoSync();
  }

  function saveData(onSuccess) {
    try {
      // 1. Immediately update local storage as fast cache
      const jsonStr = JSON.stringify(state.customers);
      localStorage.setItem(STORAGE_KEY, jsonStr);
      updateGlobalStats();
    } catch (e) {
      console.error('Failed to save data to localStorage:', e);
    }

    // 2. Persist to central server database
    fetch('/api/customer-tracker/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ customers: state.customers })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        lastServerHash = JSON.stringify(state.customers);
        if (typeof onSuccess === 'function') onSuccess();
      } else {
        console.warn('Server save warning:', data);
      }
    })
    .catch(err => {
      console.error('Failed to sync data to central server:', err);
    });
  }

  function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    // Poll server every 10 seconds for real-time updates from other operators
    syncInterval = setInterval(checkForRemoteUpdates, 10000);

    // Also check immediately when window / tab regains focus
    window.addEventListener('focus', () => {
      checkForRemoteUpdates();
    });
  }

  async function checkForRemoteUpdates() {
    // Do not disrupt user if they are currently typing or a modal dialog is open
    const isModalOpen = document.querySelector('.modal-overlay:not(.hidden)');
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

    try {
      const response = await fetch('/api/customer-tracker/data');
      if (!response.ok) return;
      const result = await response.json();
      if (!result || !result.success || !Array.isArray(result.customers)) return;

      const newHash = JSON.stringify(result.customers);
      if (newHash === lastServerHash) {
        return; // No remote changes
      }

      // Changes detected from another operator!
      lastServerHash = newHash;
      state.customers = result.customers;
      localStorage.setItem(STORAGE_KEY, newHash);
      updateGlobalStats();

      // Only re-render if user is not actively typing in an open form
      if (!isTyping && !isModalOpen) {
        const currentActive = state.activeCustomerId;
        populateCustomerDropdown(currentActive);
        if (currentActive && state.customers.some(c => c.id === currentActive)) {
          renderActiveCustomerProfile();
          renderTimeline();
        } else if (state.customers.length > 0) {
          selectCustomer(state.customers[0].id);
        } else {
          renderApp();
        }
      }
    } catch (e) {
      // Silent catch for background polling
    }
  }

  function updateGlobalStats() {
    const totalCustomers = state.customers.length;
    let totalUpdates = 0;
    state.customers.forEach(c => {
      totalUpdates += (c.updates ? c.updates.length : 0);
    });

    if (elements.statCustomerCount) {
      elements.statCustomerCount.textContent = totalCustomers;
    }
    if (elements.statUpdateCount) {
      elements.statUpdateCount.textContent = totalUpdates;
    }
  }

  // =========================================================================
  // Customer Management
  // =========================================================================

  function createCustomer(name, notes) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Customer name is required', 'error');
      return;
    }

    const currentUser = getCurrentLoggedInUser();
    const newCustomer = {
      id: 'cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: trimmedName,
      notes: notes ? notes.trim() : '',
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      updates: []
    };

    state.customers.unshift(newCustomer);
    saveData();
    populateCustomerDropdown(newCustomer.id);
    selectCustomer(newCustomer.id);
    closeModal(elements.modalNewCustomer);
    elements.formNewCustomer.reset();
    showToast(`Customer "${trimmedName}" created successfully!`, 'success');
  }

  function updateCustomer(id, name, notes) {
    const cust = state.customers.find(c => c.id === id);
    if (!cust) return;

    cust.name = name.trim();
    cust.notes = notes ? notes.trim() : '';
    saveData();

    populateCustomerDropdown(id);
    renderActiveCustomerProfile();
    closeModal(elements.modalEditCustomer);
    showToast('Customer profile updated', 'success');
  }

  function deleteCustomer(id) {
    const cust = state.customers.find(c => c.id === id);
    if (!cust) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${cust.name}" and all their timeline updates? This action cannot be undone.`
    );

    if (!confirmed) return;

    state.customers = state.customers.filter(c => c.id !== id);
    saveData();

    if (state.activeCustomerId === id) {
      state.activeCustomerId = state.customers.length > 0 ? state.customers[0].id : null;
    }

    renderApp();
    showToast(`Customer "${cust.name}" removed`, 'info');
  }

  function selectCustomer(id) {
    state.activeCustomerId = id;
    elements.customerSelect.value = id || '';
    renderApp();
  }

  // Generate 2-letter initials for avatar
  function getInitials(name) {
    if (!name) return 'CU';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // =========================================================================
  // Timeline Updates Management
  // =========================================================================

  function addUpdate(category, dateTime, content, tag) {
    const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
    if (!activeCustomer) {
      showToast('Please select a customer profile first', 'error');
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      showToast('Update content cannot be empty', 'error');
      return;
    }

    const currentUser = getCurrentLoggedInUser();
    const newUpdate = {
      id: 'upd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      category: category || 'Note',
      dateTime: dateTime || new Date().toISOString(),
      content: trimmedContent,
      tag: tag ? tag.trim() : '',
      author: currentUser,
      createdAt: new Date().toISOString()
    };

    if (!activeCustomer.updates) {
      activeCustomer.updates = [];
    }

    activeCustomer.updates.unshift(newUpdate);
    saveData();

    // Reset Form fields
    elements.updateContent.value = '';
    elements.updateTag.value = '';
    setDefaultDateTime();

    renderTimeline();
    renderActiveCustomerProfile();
    showToast('Timeline update added successfully!', 'success');
  }

  function updateTimelineEntry(updateId, category, dateTime, content, tag) {
    const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
    if (!activeCustomer || !activeCustomer.updates) return;

    const entry = activeCustomer.updates.find(u => u.id === updateId);
    if (!entry) return;

    entry.category = category;
    entry.dateTime = dateTime;
    entry.content = content.trim();
    entry.tag = tag ? tag.trim() : '';

    saveData();
    renderTimeline();
    renderActiveCustomerProfile();
    closeModal(elements.modalEditUpdate);
    showToast('Update modified successfully', 'success');
  }

  function deleteTimelineEntry(updateId) {
    const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
    if (!activeCustomer || !activeCustomer.updates) return;

    const confirmed = window.confirm('Delete this timeline update?');
    if (!confirmed) return;

    activeCustomer.updates = activeCustomer.updates.filter(u => u.id !== updateId);
    saveData();
    renderTimeline();
    renderActiveCustomerProfile();
    showToast('Update deleted', 'info');
  }

  // =========================================================================
  // Rendering & UI
  // =========================================================================

  function renderApp() {
    populateCustomerDropdown(state.activeCustomerId);
    updateGlobalStats();

    const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);

    if (!activeCustomer) {
      elements.customerProfileSection.classList.add('hidden');
      elements.activeWorkspaceGrid.classList.add('hidden');
      elements.noCustomerState.classList.remove('hidden');
    } else {
      elements.noCustomerState.classList.add('hidden');
      elements.customerProfileSection.classList.remove('hidden');
      elements.activeWorkspaceGrid.classList.remove('hidden');
      renderActiveCustomerProfile();
      renderTimeline();
    }
  }

  function populateCustomerDropdown(selectedId) {
    elements.customerSelect.innerHTML = '<option value="" disabled>-- Choose a Customer Profile --</option>';

    if (state.customers.length === 0) {
      elements.customerSelect.innerHTML = '<option value="" disabled selected>No customer profiles found (Create one!)</option>';
      return;
    }

    state.customers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      const count = c.updates ? c.updates.length : 0;
      opt.textContent = `${c.name} (${count} update${count === 1 ? '' : 's'})`;
      if (c.id === selectedId) {
        opt.selected = true;
      }
      elements.customerSelect.appendChild(opt);
    });

    if (!selectedId) {
      elements.customerSelect.selectedIndex = 0;
    }
  }

  function renderActiveCustomerProfile() {
    const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
    if (!activeCustomer) return;

    elements.profileAvatar.textContent = getInitials(activeCustomer.name);
    elements.profileName.textContent = activeCustomer.name;
    elements.profileInitialNote.textContent = activeCustomer.notes || 'No extra profile notes provided.';

    // Created Date formatting
    const createdDate = new Date(activeCustomer.createdAt);
    elements.profileCreatedAt.textContent = isValidDate(createdDate)
      ? formatDate(createdDate)
      : 'Recently';

    // Last Active
    let lastActiveText = 'No activity yet';
    if (activeCustomer.updates && activeCustomer.updates.length > 0) {
      // Find latest update
      const latestUpdate = [...activeCustomer.updates].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime))[0];
      lastActiveText = formatRelativeTime(new Date(latestUpdate.dateTime));
    }
    elements.profileLastActive.textContent = lastActiveText;

    // Total updates count
    const count = activeCustomer.updates ? activeCustomer.updates.length : 0;
    elements.profileUpdateCount.textContent = count;
  }

  function renderTimeline() {
    const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
    if (!activeCustomer) return;

    const updates = activeCustomer.updates || [];
    let filtered = [...updates];

    // Filter by Category
    if (state.filterCategory !== 'ALL') {
      filtered = filtered.filter(u => u.category === state.filterCategory);
    }

    // Filter by Search Query
    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        (u.content && u.content.toLowerCase().includes(query)) ||
        (u.tag && u.tag.toLowerCase().includes(query)) ||
        (u.category && u.category.toLowerCase().includes(query))
      );
    }

    // Sort Order
    filtered.sort((a, b) => {
      const dateA = new Date(a.dateTime).getTime() || 0;
      const dateB = new Date(b.dateTime).getTime() || 0;
      return state.sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    // Update counter badge
    elements.timelineCounterBadge.textContent = `${filtered.length} of ${updates.length} entries`;

    // Render cards or empty state
    elements.timelineFeed.innerHTML = '';

    if (filtered.length === 0) {
      elements.timelineEmptyState.classList.remove('hidden');
      if (updates.length > 0 && (state.filterCategory !== 'ALL' || state.searchQuery)) {
        elements.timelineEmptyState.querySelector('h4').textContent = 'No matching updates';
        elements.timelineEmptyState.querySelector('p').textContent = 'Try adjusting your search keyword or category filter above.';
      } else {
        elements.timelineEmptyState.querySelector('h4').textContent = 'No Updates Recorded Yet';
        elements.timelineEmptyState.querySelector('p').textContent = 'Add your first note, call log, or meeting summary using the form on the left to start this customer\'s journey timeline.';
      }
      return;
    }

    elements.timelineEmptyState.classList.add('hidden');

    // Create DOM for each timeline entry
    filtered.forEach(item => {
      const itemEl = createTimelineItemElement(item);
      elements.timelineFeed.appendChild(itemEl);
    });
  }

  function createTimelineItemElement(item) {
    const div = document.createElement('div');
    div.className = 'timeline-item';
    div.dataset.id = item.id;

    const category = item.category || 'Note';
    const catClass = category.toLowerCase().replace(/[^a-z]/g, '');
    const iconSvg = CATEGORY_ICONS[category] || CATEGORY_ICONS['Note'];

    const dateObj = new Date(item.dateTime);
    const readableDate = isValidDate(dateObj) ? formatDateTimeReadable(dateObj) : item.dateTime;
    const relativeTime = isValidDate(dateObj) ? formatRelativeTime(dateObj) : '';

    const tagHtml = item.tag
      ? `<span class="tag-badge">🏷️ ${escapeHtml(item.tag)}</span>`
      : '';

    div.innerHTML = `
      <div class="timeline-node node-${catClass}" title="${category}">
        ${iconSvg}
      </div>
      <div class="timeline-card">
        <div class="timeline-card-header">
          <div class="timeline-tag-row">
            <span class="cat-badge cat-badge-${catClass}">
              <span class="cat-dot dot-${catClass}"></span>
              ${category}
            </span>
            ${tagHtml}
          </div>
          <div class="timeline-time-group">
            <span class="timeline-time" title="${readableDate}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              ${readableDate} (${relativeTime})
            </span>
            ${item.author ? `<span class="timeline-author-badge" style="font-size: 0.72rem; opacity: 0.8; display: inline-flex; align-items: center; gap: 0.25rem; margin-left: 0.35rem; color: var(--text-muted);" title="Logged by ${escapeHtml(item.author)}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${escapeHtml(item.author)}</span>` : ''}
            <div class="timeline-item-actions">
              <button class="btn-item-action btn-edit-entry" data-id="${item.id}" title="Edit this update" aria-label="Edit update">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn-item-action delete btn-delete-entry" data-id="${item.id}" title="Delete this update" aria-label="Delete update">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="timeline-card-content">${escapeHtml(item.content)}</div>
      </div>
    `;

    // Attach click events
    div.querySelector('.btn-edit-entry').addEventListener('click', () => openEditUpdateModal(item));
    div.querySelector('.btn-delete-entry').addEventListener('click', () => deleteTimelineEntry(item.id));

    return div;
  }

  // =========================================================================
  // Modals Management
  // =========================================================================

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    const firstInput = modalEl.querySelector('input:not([type="hidden"]), textarea');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 50);
    }
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('hidden');
  }

  function openEditCustomerModal() {
    const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
    if (!activeCustomer) return;

    elements.editCustomerId.value = activeCustomer.id;
    elements.editCustomerName.value = activeCustomer.name;
    elements.editCustomerNotes.value = activeCustomer.notes || '';
    openModal(elements.modalEditCustomer);
  }

  function openEditUpdateModal(item) {
    elements.editUpdateId.value = item.id;
    elements.editUpdateCategory.value = item.category || 'Note';
    
    // Format datetime for datetime-local input
    if (item.dateTime) {
      const dt = new Date(item.dateTime);
      if (isValidDate(dt)) {
        elements.editUpdateDateTime.value = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      } else {
        elements.editUpdateDateTime.value = item.dateTime;
      }
    }
    
    elements.editUpdateContent.value = item.content || '';
    elements.editUpdateTag.value = item.tag || '';
    openModal(elements.modalEditUpdate);
  }

  // =========================================================================
  // Demo Data & Backup/Restore
  // =========================================================================

  function loadDemoData() {
    const now = new Date();
    const d1 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago
    const d2 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);  // 7 days ago
    const d3 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);  // 2 days ago
    const d4 = new Date(now.getTime() - 3 * 60 * 60 * 1000);       // 3 hours ago

    const demoCustomers = [
      {
        id: 'cust_demo_rahim',
        name: 'Rahim Ahmed (Apex Logistics)',
        notes: 'Managing Director of Apex Logistics. Inquiring for enterprise fiber link and redundancy setup across 3 branches.',
        createdAt: d1.toISOString(),
        updates: [
          {
            id: 'upd_demo_1',
            category: 'Note',
            dateTime: d1.toISOString(),
            content: 'Customer reached out via website inquiry form. Needs a high-availability dedicated connection for Dhaka head office and Chittagong depot.',
            tag: 'Lead Ingestion',
            createdAt: d1.toISOString()
          },
          {
            id: 'upd_demo_2',
            category: 'Call',
            dateTime: new Date(d1.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            content: 'Initial discovery call with Mr. Rahim. Discussed bandwidth requirements (100 Mbps primary + 50 Mbps backup) and budget expectations.',
            tag: 'Discovery Call',
            createdAt: new Date(d1.getTime() + 2 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 'upd_demo_3',
            category: 'Meeting',
            dateTime: d2.toISOString(),
            content: 'Formal technical meeting with their IT manager (Mr. Tanvir) and Rahim Ahmed. Presented technical diagram and fiber route feasibility.',
            tag: 'Tech Proposal',
            createdAt: d2.toISOString()
          },
          {
            id: 'upd_demo_4',
            category: 'Milestone',
            dateTime: d3.toISOString(),
            content: 'Commercial proposal signed and approved! 1-year service agreement finalized. Sent to operations team for fiber pulling and ONT configuration.',
            tag: 'Contract Signed 🚀',
            createdAt: d3.toISOString()
          },
          {
            id: 'upd_demo_5',
            category: 'Follow-up',
            dateTime: d4.toISOString(),
            content: 'Checked with field engineer. Fiber laying complete at Banani office. Scheduled testing and final handover for tomorrow 11:00 AM.',
            tag: 'Installation',
            createdAt: d4.toISOString()
          }
        ]
      },
      {
        id: 'cust_demo_technova',
        name: 'Technova Solutions Ltd.',
        notes: 'Fintech software development firm requiring low-latency cloud connectivity and IP transit.',
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updates: [
          {
            id: 'upd_demo_tech_1',
            category: 'Note',
            dateTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            content: 'Received RFP for data center interconnect and BGP routing setup.',
            tag: 'RFP Submission',
            createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 'upd_demo_tech_2',
            category: 'Meeting',
            dateTime: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            content: 'Online Zoom demonstration of network latency monitoring and SLA guarantee dashboard.',
            tag: 'Product Demo',
            createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
          }
        ]
      },
      {
        id: 'cust_demo_karim',
        name: 'Karim Enterprise',
        notes: 'Retail chain distributor with 5 retail outlets.',
        createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        updates: [
          {
            id: 'upd_demo_k1',
            category: 'Call',
            dateTime: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString(),
            content: 'Called owner regarding renewal discount for their POS internet package.',
            tag: 'Renewal',
            createdAt: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 'upd_demo_k2',
            category: 'Issue',
            dateTime: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            content: 'Temporary connectivity drop reported at Mirpur branch due to road construction fiber cut. NOC team resolved within 45 mins.',
            tag: 'Resolved',
            createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
          }
        ]
      }
    ];

    state.customers = demoCustomers;
    saveData();
    state.activeCustomerId = demoCustomers[0].id;
    renderApp();
    showToast('Demo customers and timeline updates loaded!', 'success');
  }

  // =========================================================================
  // Reports: Excel (CSV) & PDF Print
  // =========================================================================

  function exportCustomerToCSV() {
    const cust = state.customers.find(c => c.id === state.activeCustomerId);
    if (!cust) {
      showToast('Please select a customer profile first', 'error');
      return;
    }

    const rows = [
      ['Customer Name', 'Date & Time', 'Category', 'Reference Tag', 'Update Details']
    ];

    const updates = [...(cust.updates || [])].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
    if (updates.length === 0) {
      rows.push([cust.name, 'N/A', 'N/A', 'N/A', 'No timeline updates recorded yet. Profile notes: ' + (cust.notes || '')]);
    } else {
      updates.forEach(u => {
        const dt = new Date(u.dateTime);
        const readable = isValidDate(dt) ? dt.toLocaleString() : u.dateTime;
        rows.push([
          cust.name,
          readable,
          u.category || 'Note',
          u.tag || '',
          u.content || ''
        ]);
      });
    }

    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Customer report.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Excel CSV Report for "${cust.name}" downloaded!`, 'success');
  }

  function exportAllCustomersToCSV() {
    if (state.customers.length === 0) {
      showToast('No customer data available to export', 'error');
      return;
    }

    const rows = [
      ['Customer Name', 'Profile Notes', 'Created Date', 'Total Updates', 'Update Date & Time', 'Category', 'Reference Tag', 'Update Details']
    ];

    state.customers.forEach(cust => {
      const updates = [...(cust.updates || [])].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
      const createdDt = isValidDate(new Date(cust.createdAt)) ? new Date(cust.createdAt).toLocaleDateString() : cust.createdAt;
      if (updates.length === 0) {
        rows.push([
          cust.name,
          cust.notes || '',
          createdDt,
          0,
          'N/A',
          'N/A',
          'N/A',
          'No updates recorded'
        ]);
      } else {
        updates.forEach(u => {
          const dt = new Date(u.dateTime);
          const readable = isValidDate(dt) ? dt.toLocaleString() : u.dateTime;
          rows.push([
            cust.name,
            cust.notes || '',
            createdDt,
            updates.length,
            readable,
            u.category || 'Note',
            u.tag || '',
            u.content || ''
          ]);
        });
      }
    });

    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Customer report - All Customers.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('All customers exported to Excel CSV report!', 'success');
  }

  function printCustomerPdfReport() {
    const cust = state.customers.find(c => c.id === state.activeCustomerId);
    if (!cust) {
      showToast('Please select a customer profile first', 'error');
      return;
    }

    const updates = [...(cust.updates || [])].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
    const reportDate = new Date().toLocaleString();
    const createdDate = isValidDate(new Date(cust.createdAt)) ? formatDate(new Date(cust.createdAt)) : cust.createdAt;

    let rowsHtml = '';
    if (updates.length === 0) {
      rowsHtml = `<tr><td colspan="4" style="text-align:center; padding: 25px; color: #64748b;">No timeline updates recorded yet for this customer.</td></tr>`;
    } else {
      updates.forEach((u, idx) => {
        const dt = new Date(u.dateTime);
        const readable = isValidDate(dt) ? formatDateTimeReadable(dt) : u.dateTime;
        const tagBadge = u.tag ? `<span style="display:inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-family: monospace; color: #475569;">${escapeHtml(u.tag)}</span>` : '<span style="color:#94a3b8;">—</span>';
        const bgRow = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        rowsHtml += `
          <tr style="background-color: ${bgRow};">
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; white-space: nowrap; vertical-align: top;"><strong>${readable}</strong></td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; vertical-align: top;"><span style="display:inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 700; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;">${escapeHtml(u.category || 'Note')}</span></td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; vertical-align: top;">${tagBadge}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; line-height: 1.5; white-space: pre-wrap; vertical-align: top;">${escapeHtml(u.content || '')}</td>
          </tr>
        `;
      });
    }

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Customer Timeline Report - ${escapeHtml(cust.name)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 35px; }
          .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #059669; padding-bottom: 15px; margin-bottom: 22px; }
          .brand-name { font-size: 24px; font-weight: 800; color: #047857; margin: 0; }
          .report-title { font-size: 13px; font-weight: 700; color: #64748b; letter-spacing: 0.05em; margin-top: 4px; text-transform: uppercase; }
          .report-meta { text-align: right; font-size: 12px; color: #64748b; line-height: 1.6; }
          .customer-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 25px; }
          .cust-title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; }
          .cust-notes { font-size: 13.5px; color: #475569; margin: 0 0 12px 0; line-height: 1.5; }
          .cust-stats { display: flex; gap: 24px; font-size: 12.5px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
          .cust-stats strong { color: #0f172a; }
          .section-heading { font-size: 15px; font-weight: 700; margin: 0 0 10px 0; color: #1e293b; display: flex; justify-content: space-between; align-items: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; border: 1px solid #e2e8f0; }
          th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 11.5px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; border-bottom: 2px solid #cbd5e1; }
          .footer-note { text-align: center; margin-top: 35px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          @media print {
            body { padding: 10px; }
            @page { margin: 1.2cm; size: portrait; }
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div>
            <h1 class="brand-name">CustomerPulse</h1>
            <div class="report-title">Customer Issue & Activity Tracker Report</div>
          </div>
          <div class="report-meta">
            <div>Generated On: <strong>${reportDate}</strong></div>
            <div>Document Type: <strong>Chronological Timeline Export</strong></div>
          </div>
        </div>

        <div class="customer-box">
          <h2 class="cust-title">${escapeHtml(cust.name)}</h2>
          <p class="cust-notes">${escapeHtml(cust.notes || 'No extra profile notes provided.')}</p>
          <div class="cust-stats">
            <div>Customer Created: <strong>${createdDate}</strong></div>
            <div>Total Activity Entries: <strong>${updates.length}</strong></div>
          </div>
        </div>

        <div class="section-heading">
          <span>Activity Timeline History</span>
          <span style="font-size: 12px; font-weight: normal; color: #64748b;">Showing ${updates.length} events</span>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 22%;">Date & Time</th>
              <th style="width: 14%;">Type</th>
              <th style="width: 18%;">Reference Tag</th>
              <th style="width: 46%;">Activity Details / Discussion</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer-note">
          Generated automatically via CustomerPulse Customer Issue Tracker
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          };
        <\/script>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(printHtml);
      printWin.document.close();
      showToast('Opening print view... Select "Save as PDF" to download report.', 'success');
    } else {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write(printHtml);
      iframe.contentDocument.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 60000);
      showToast('Opening print view... Select "Save as PDF" to download report.', 'success');
    }
  }

  function exportToJson() {
    if (state.customers.length === 0) {
      showToast('No customer data to export', 'error');
      return;
    }

    const dataStr = JSON.stringify(state.customers, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `customerpulse_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Customer data exported to JSON!', 'success');
  }

  function importFromJson(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) {
          throw new Error('Invalid file structure: Expected an array of customers.');
        }

        // Validate basic customer object shape
        const valid = parsed.every(c => c.name && c.id);
        if (!valid) {
          throw new Error('Some customer items are missing required "name" or "id" fields.');
        }

        state.customers = parsed;
        saveData();
        state.activeCustomerId = state.customers.length > 0 ? state.customers[0].id : null;
        renderApp();
        showToast(`Successfully imported ${state.customers.length} customer profiles!`, 'success');
      } catch (err) {
        console.error('Import error:', err);
        showToast('Failed to import JSON: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    const confirmed = window.confirm(
      'WARNING: Are you sure you want to erase ALL customers and their timeline history? This cannot be undone.'
    );
    if (!confirmed) return;

    state.customers = [];
    state.activeCustomerId = null;
    saveData();
    renderApp();
    showToast('All customer data cleared', 'info');
  }

  // =========================================================================
  // Event Bindings
  // =========================================================================

  function bindEvents() {
    // Theme toggle
    elements.btnThemeToggle.addEventListener('click', toggleTheme);

    // Customer Select dropdown change
    elements.customerSelect.addEventListener('change', (e) => {
      selectCustomer(e.target.value);
    });

    // New Customer modal triggers
    elements.btnOpenNewCustomerModal.addEventListener('click', () => {
      openModal(elements.modalNewCustomer);
    });
    elements.btnWelcomeNewCustomer.addEventListener('click', () => {
      openModal(elements.modalNewCustomer);
    });

    // Close New Customer modal
    elements.btnCloseNewCustomerModal.addEventListener('click', () => closeModal(elements.modalNewCustomer));
    elements.btnCancelNewCustomer.addEventListener('click', () => closeModal(elements.modalNewCustomer));

    // Submit New Customer form
    elements.formNewCustomer.addEventListener('submit', (e) => {
      e.preventDefault();
      createCustomer(elements.inputCustomerName.value, elements.inputCustomerNotes.value);
    });

    // Edit Customer Profile
    elements.btnEditCustomer.addEventListener('click', openEditCustomerModal);
    elements.btnCloseEditCustomerModal.addEventListener('click', () => closeModal(elements.modalEditCustomer));
    elements.btnCancelEditCustomer.addEventListener('click', () => closeModal(elements.modalEditCustomer));

    elements.formEditCustomer.addEventListener('submit', (e) => {
      e.preventDefault();
      updateCustomer(
        elements.editCustomerId.value,
        elements.editCustomerName.value,
        elements.editCustomerNotes.value
      );
    });

    // Delete Customer Profile
    elements.btnDeleteCustomer.addEventListener('click', () => {
      if (state.activeCustomerId) {
        deleteCustomer(state.activeCustomerId);
      }
    });

    // Category pills/tabs selection in Composer
    elements.categoryPills.querySelectorAll('.cat-tab, .category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        elements.categoryPills.querySelectorAll('.cat-tab, .category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        state.selectedCategory = cat;
        elements.selectedCategoryInput.value = cat;
      });
    });

    // Submit Update Form
    elements.updateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addUpdate(
        elements.selectedCategoryInput.value,
        elements.updateDateTime.value,
        elements.updateContent.value,
        elements.updateTag.value
      );
    });

    // Keyboard shortcut in Composer Textarea: Ctrl+Enter or Cmd+Enter to submit
    elements.updateContent.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        elements.updateForm.requestSubmit();
      }
    });

    // Edit Update Modal actions
    elements.btnCloseEditUpdateModal.addEventListener('click', () => closeModal(elements.modalEditUpdate));
    elements.btnCancelEditUpdate.addEventListener('click', () => closeModal(elements.modalEditUpdate));

    elements.formEditUpdate.addEventListener('submit', (e) => {
      e.preventDefault();
      updateTimelineEntry(
        elements.editUpdateId.value,
        elements.editUpdateCategory.value,
        elements.editUpdateDateTime.value,
        elements.editUpdateContent.value,
        elements.editUpdateTag.value
      );
    });

    // Timeline search input
    elements.timelineSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderTimeline();
    });

    // Timeline category filter
    elements.timelineCategoryFilter.addEventListener('change', (e) => {
      state.filterCategory = e.target.value;
      renderTimeline();
    });

    // Sort order toggle
    elements.btnToggleSort.addEventListener('click', () => {
      state.sortOrder = state.sortOrder === 'newest' ? 'oldest' : 'newest';
      elements.sortOrderLabel.textContent = state.sortOrder === 'newest' ? 'Newest First' : 'Oldest First';
      renderTimeline();
    });

    // Data dropdown menu
    elements.btnDataMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.dataDropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      elements.dataDropdownMenu.classList.remove('show');
    });

    elements.dataDropdownMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Report Export Actions
    if (elements.btnExportPdf) {
      elements.btnExportPdf.addEventListener('click', printCustomerPdfReport);
    }
    if (elements.btnExportCsv) {
      elements.btnExportCsv.addEventListener('click', exportCustomerToCSV);
    }
    if (elements.btnExportAllCsv) {
      elements.btnExportAllCsv.addEventListener('click', () => {
        elements.dataDropdownMenu.classList.remove('show');
        exportAllCustomersToCSV();
      });
    }

    // Data Menu Actions
    elements.btnExportJson.addEventListener('click', () => {
      elements.dataDropdownMenu.classList.remove('show');
      exportToJson();
    });

    elements.fileImportJson.addEventListener('change', (e) => {
      elements.dataDropdownMenu.classList.remove('show');
      if (e.target.files && e.target.files[0]) {
        importFromJson(e.target.files[0]);
        e.target.value = '';
      }
    });

    elements.btnClearAllData.addEventListener('click', () => {
      elements.dataDropdownMenu.classList.remove('show');
      clearAllData();
    });

    // Demo Data buttons
    elements.btnLoadDemo.addEventListener('click', loadDemoData);
    elements.btnWelcomeDemo.addEventListener('click', loadDemoData);

    // Global escape key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal(elements.modalNewCustomer);
        closeModal(elements.modalEditCustomer);
        closeModal(elements.modalEditUpdate);
      }
    });

    // Click outside modal card to close
    [elements.modalNewCustomer, elements.modalEditCustomer, elements.modalEditUpdate].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modal);
        }
      });
    });
  }

  // =========================================================================
  // Date & Formatting Helpers
  // =========================================================================

  function isValidDate(d) {
    return d instanceof Date && !isNaN(d.getTime());
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatDateTimeReadable(d) {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRelativeTime(date) {
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 0) {
      // Future date
      const futureSec = Math.abs(diffSec);
      if (futureSec < 60) return 'In a few seconds';
      if (futureSec < 3600) return `In ${Math.floor(futureSec / 60)} mins`;
      if (futureSec < 86400) return `In ${Math.floor(futureSec / 3600)} hours`;
      return `In ${Math.floor(futureSec / 86400)} days`;
    }

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'Yesterday';
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return formatDate(date);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // Toast Notifications
  // =========================================================================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = `ℹ️`;
    if (type === 'success') icon = `✓`;
    if (type === 'error') icon = `✕`;

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
