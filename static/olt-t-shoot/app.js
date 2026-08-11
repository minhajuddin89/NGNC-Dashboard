function document_ready(fn) {
    if (document.readyState !== 'loading') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

document_ready(() => {
    // --- Session Management ---
    function getSession() {
        const data = sessionStorage.getItem('oltSession');
        return data ? JSON.parse(data) : null;
    }

    function setSession(session) {
        sessionStorage.setItem('oltSession', JSON.stringify(session));
    }

    function clearSession() {
        sessionStorage.removeItem('oltSession');
    }

    // --- DOM Elements ---
    const screenLogin = document.getElementById('screen-login');
    const screenDashboard = document.getElementById('screen-dashboard');
    const loginForm = document.getElementById('login-form');
    const loginBrand = document.getElementById('login-brand');
    const loginEnablePasswordGroup = document.getElementById('login-enable-password-group');
    const loginEnablePassword = document.getElementById('login-enable-password');
    const connectionHeaderPanel = document.getElementById('connection-header-panel');
    
    // Autocomplete elements
    const deviceSearchInput = document.getElementById('device-search-input');
    const deviceSuggestionsList = document.getElementById('device-suggestions-list');
    const btnToggleSuggestions = document.getElementById('btn-toggle-suggestions');

    // Load OLT database on initialize
    let oltProfiles = [];
    async function loadOltProfiles() {
        try {
            const res = await fetch('/api/olt/olts');
            if (res.ok) {
                oltProfiles = await res.json();
            }
        } catch (err) {
            console.error("Failed to load OLT profiles:", err);
        }
    }
    loadOltProfiles();

    function renderSuggestions(query = "") {
        const cleanQuery = query.trim().toLowerCase();
        deviceSuggestionsList.innerHTML = "";
        
        let filtered = oltProfiles;
        if (cleanQuery) {
            filtered = filtered.filter(p => 
                (p.name && p.name.toLowerCase().includes(cleanQuery)) || 
                (p.host && p.host.toLowerCase().includes(cleanQuery))
            );
        }
        
        if (filtered.length === 0) {
            const div = document.createElement("div");
            div.className = "suggestion-item-empty";
            div.textContent = "No matching OLTs found";
            deviceSuggestionsList.appendChild(div);
            deviceSuggestionsList.classList.remove("hidden");
            return;
        }
        
        // Show first 15 results for performance
        const displayList = filtered.slice(0, 15);
        displayList.forEach(p => {
            const div = document.createElement("div");
            div.className = "suggestion-item";
            div.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="font-weight:600; color:var(--text-primary);">${p.name}</span>
                    <span style="font-size:0.75rem; color:var(--text-secondary);">${p.brand.toUpperCase()}</span>
                </div>
                <span style="font-family:var(--font-mono); color:var(--primary); font-size:0.8rem;">${p.host}</span>
            `;
            
            div.addEventListener("click", () => {
                deviceSearchInput.value = p.name;
                document.getElementById('login-host').value = p.host;
                document.getElementById('login-port').value = p.port || 23;
                
                let brandVal = p.brand.toLowerCase();
                if (brandVal === 'vsol') brandVal = 'vsol_gpon';
                if (brandVal === 'cdata') brandVal = 'cdata_gpon';
                if (brandVal === 'huawei') brandVal = 'huawei_gpon';
                loginBrand.value = brandVal;
                
                // Trigger change event to toggle enable password box
                toggleEnablePasswordView();
                
                deviceSuggestionsList.classList.add("hidden");
            });
            deviceSuggestionsList.appendChild(div);
        });
        
        deviceSuggestionsList.classList.remove("hidden");
    }

    function detectBrandFromName(name) {
        const cleanName = name.toLowerCase();
        if (cleanName.includes("vsol")) return "vsol_gpon";
        if (cleanName.includes("huawei")) return "huawei_gpon";
        if (cleanName.includes("cdata")) return "cdata_gpon";
        return null;
    }

    deviceSearchInput.addEventListener("input", (e) => {
        renderSuggestions(e.target.value);
        const detected = detectBrandFromName(e.target.value);
        if (detected) {
            loginBrand.value = detected;
        }
    });

    deviceSearchInput.addEventListener("focus", (e) => {
        renderSuggestions(e.target.value);
    });

    btnToggleSuggestions.addEventListener("click", (e) => {
        e.stopPropagation();
        if (deviceSuggestionsList.classList.contains("hidden")) {
            renderSuggestions(deviceSearchInput.value);
        } else {
            deviceSuggestionsList.classList.add("hidden");
        }
    });

    document.addEventListener("click", (e) => {
        if (!deviceSearchInput.contains(e.target) && !deviceSuggestionsList.contains(e.target) && !btnToggleSuggestions.contains(e.target)) {
            deviceSuggestionsList.classList.add("hidden");
        }
    });
    
    // Search elements
    const searchQueryInput = document.getElementById('search-query-input');
    const btnSubmitSearch = document.getElementById('btn-submit-search');
    const searchLoadingCard = document.getElementById('search-loading-card');
    const loadingStatusTitle = document.getElementById('loading-status-title');
    const loadingStatusDesc = document.getElementById('loading-status-desc');
    
    // Results panels
    const vlanResultsCard = document.getElementById('vlan-results-card');
    const lblVlanId = document.getElementById('lbl-vlan-id');
    const vlanMacCountBadge = document.getElementById('vlan-mac-count-badge');
    const vlanResultsBody = document.getElementById('vlan-results-body');
    
    // VLAN Details elements
    const vlanDetailsCard = document.getElementById('vlan-details-card');
    const vlanLblId = document.getElementById('vlan-lbl-id');
    const vlanLblName = document.getElementById('vlan-lbl-name');
    const vlanLblMac = document.getElementById('vlan-lbl-mac');
    const vlanLblTagged = document.getElementById('vlan-lbl-tagged');
    const vlanLblUntagged = document.getElementById('vlan-lbl-untagged');
    
    const macResultsCard = document.getElementById('mac-results-card');
    const lblSearchedMac = document.getElementById('lbl-searched-mac');
    const macStatusBadge = document.getElementById('mac-status-badge');
    const macLblPort = document.getElementById('mac-lbl-port');
    const macLblOntId = document.getElementById('mac-lbl-ont-id');
    const macLblVlan = document.getElementById('mac-lbl-vlan');
    const macLblSn = document.getElementById('mac-lbl-sn');
    const macLblDesc = document.getElementById('mac-lbl-desc');
    const macLblRx = document.getElementById('mac-lbl-rx');
    const macLblTx = document.getElementById('mac-lbl-tx');
    const macLblOltRx = document.getElementById('mac-lbl-olt-rx');
    const macLblTemp = document.getElementById('mac-lbl-temp');
    const macLblRxDesc = document.getElementById('mac-lbl-rx-desc');
    
    const btnMacShowConfig = document.getElementById('btn-mac-show-config');
    const btnMacReboot = document.getElementById('btn-mac-reboot');
    const btnMacDeleteStatic = document.getElementById('btn-mac-delete-static');
    
    const searchEmptyCard = document.getElementById('search-empty-card');
    const searchEmptyTitle = document.getElementById('search-empty-title');
    const searchEmptyDesc = document.getElementById('search-empty-desc');
    
    // Config modal elements
    const configModal = document.getElementById('config-modal');
    const btnCloseConfigModal = document.getElementById('btn-close-config-modal');
    const configModalTitle = document.getElementById('config-modal-title');
    const configModalRawOutput = document.getElementById('config-modal-raw-output');
    
    // Static MAC modal elements
    const staticMacModal = document.getElementById('static-mac-modal');
    const btnCloseStaticModal = document.getElementById('btn-close-static-modal');
    const btnCancelStatic = document.getElementById('btn-cancel-static');
    const btnConfirmStatic = document.getElementById('btn-confirm-static');
    const staticMacInputMac = document.getElementById('static-mac-input-mac');
    const staticMacInputVlan = document.getElementById('static-mac-input-vlan');
    const staticMacInputPort = document.getElementById('static-mac-input-port');
    
    // Live CLI Console Elements
    const liveConsoleBox = document.getElementById('live-console-box');
    const btnClearConsole = document.getElementById('btn-clear-console');
    const consoleHistoryText = document.getElementById('console-history-text');
    const consoleInlineInput = document.getElementById('console-inline-input');
    const btnOpenPutty = document.getElementById('btn-open-putty');
    
    // --- Static MAC Modal Handlers ---
    function openStaticMacModal(mac, vlan, port) {
        staticMacInputMac.value = mac;
        staticMacInputVlan.value = vlan;
        staticMacInputPort.value = port || '';
        
        staticMacModal.classList.remove('hidden');
    }

    btnCloseStaticModal.addEventListener('click', () => {
        staticMacModal.classList.add('hidden');
    });

    btnCancelStatic.addEventListener('click', () => {
        staticMacModal.classList.add('hidden');
    });

    btnConfirmStatic.addEventListener('click', async () => {
        const session = getSession();
        if (!session) {
            showToast('No active session.', 'error');
            return;
        }
        
        const mac = staticMacInputMac.value.trim();
        const vlan = staticMacInputVlan.value.trim();
        const port = staticMacInputPort.value.trim();
        
        if (!port) {
            showToast('Please specify a port.', 'error');
            return;
        }
        
        const origHtml = btnConfirmStatic.innerHTML;
        btnConfirmStatic.disabled = true;
        btnConfirmStatic.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Binding...`;
        
        try {
            const res = await fetch('/api/olt/action/static-mac', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: session.host,
                    port: session.port,
                    username: session.username,
                    password: session.password,
                    enable_password: session.enable_password,
                    brand: session.brand,
                    port_name: port,
                    vlan: parseInt(vlan),
                    mac: mac
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Static MAC binding configured successfully on port ${port}!`, 'success');
                appendConsoleLog(`Static MAC mapping configured on port ${port} (VLAN ${vlan}) for MAC ${data.formatted_mac || mac}.`, 'system');
                appendConsoleLog(data.output);
                staticMacModal.classList.add('hidden');
                // Refresh if we were on that search query
                const searchVal = searchQueryInput.value.trim();
                if (searchVal) executeSearch(searchVal);
            } else {
                showToast(data.error || 'Failed to configure static MAC.', 'error');
                appendConsoleLog(data.console_log);
                appendConsoleLog(data.error || 'Static MAC configuration failed.', 'error');
            }
        } catch (err) {
            showToast('Network error setting static MAC.', 'error');
            appendConsoleLog(`Network error: ${err.message || err}`, 'error');
        } finally {
            btnConfirmStatic.disabled = false;
            btnConfirmStatic.innerHTML = origHtml;
        }
    });

    btnMacDeleteStatic.addEventListener('click', async () => {
        const session = getSession();
        if (!session) {
            showToast('No active session.', 'error');
            return;
        }
        
        const mac = btnMacDeleteStatic.getAttribute('data-mac');
        const vlan = btnMacDeleteStatic.getAttribute('data-vlan');
        const port = btnMacDeleteStatic.getAttribute('data-port');
        
        if (!mac || !vlan || !port) {
            showToast('Invalid target details for static MAC deletion.', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete static MAC ${mac} from port ${port} (VLAN ${vlan})?`)) {
            return;
        }
        
        const origHtml = btnMacDeleteStatic.innerHTML;
        btnMacDeleteStatic.disabled = true;
        btnMacDeleteStatic.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...`;
        
        try {
            const res = await fetch('/api/olt/action/delete-static', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: session.host,
                    port: session.port,
                    username: session.username,
                    password: session.password,
                    enable_password: session.enable_password,
                    brand: session.brand,
                    port_name: port,
                    vlan: parseInt(vlan),
                    mac: mac
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Static MAC binding deleted successfully!`, 'success');
                appendConsoleLog(`Static MAC mapping removed on port ${port} (VLAN ${vlan}) for MAC ${data.formatted_mac || mac}.`, 'system');
                appendConsoleLog(data.output);
                btnMacDeleteStatic.style.display = 'none';
                // Refresh query
                executeSearch(mac);
            } else {
                showToast(data.error || 'Failed to delete static MAC.', 'error');
                appendConsoleLog(data.console_log);
                appendConsoleLog(data.error || 'Static MAC deletion failed.', 'error');
            }
        } catch (err) {
            showToast('Network error deleting static MAC.', 'error');
            appendConsoleLog(`Network error: ${err.message || err}`, 'error');
        } finally {
            btnMacDeleteStatic.disabled = false;
            btnMacDeleteStatic.innerHTML = origHtml;
        }
    });
    
    // Toast notification
    const toast = document.getElementById('toast');
    
    // Global active diagnostic target info
    let currentDiagTarget = null; // { port, ont_id }

    // --- Toast Handler ---
    function showToast(message, type = 'info') {
        const icon = document.getElementById('toast-icon');
        const msg = document.getElementById('toast-message');
        
        toast.className = 'toast show';
        msg.textContent = message;
        
        if (type === 'success') {
            toast.style.borderLeft = '4px solid var(--success)';
            icon.className = 'fa-solid fa-circle-check';
            icon.style.color = 'var(--success)';
        } else if (type === 'error') {
            toast.style.borderLeft = '4px solid var(--danger)';
            icon.className = 'fa-solid fa-triangle-exclamation';
            icon.style.color = 'var(--danger)';
        } else {
            toast.style.borderLeft = '4px solid var(--primary)';
            icon.className = 'fa-solid fa-circle-info';
            icon.style.color = 'var(--primary)';
        }
        
        setTimeout(() => {
            toast.className = 'toast hidden';
        }, 4000);
    }

    // --- Dynamic Input Width Autosizer ---
    function adjustInputWidth() {
        consoleInlineInput.style.width = Math.max(15, (consoleInlineInput.value.length + 2) * 8) + 'px';
    }
    consoleInlineInput.addEventListener('input', adjustInputWidth);

    // --- Console Logger Helpers ---
    function appendConsoleLog(logText, type = 'normal') {
        if (!logText) return;
        
        const timestamp = new Date().toLocaleTimeString();
        let formatted = '';
        
        if (type === 'system') {
            formatted = `\n<span style="color: #66d9ef;">[${timestamp} System]</span> ${logText}\n`;
        } else if (type === 'error') {
            formatted = `\n<span style="color: var(--danger);">[${timestamp} Error]</span> ${logText}\n`;
        } else {
            formatted = logText
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .replace(/(OLT[>#\(config\)]+)/g, '<span style="color: var(--primary); font-weight: bold;">$1</span>');
        }
        
        consoleHistoryText.innerHTML += formatted;
        liveConsoleBox.scrollTop = liveConsoleBox.scrollHeight;
        adjustInputWidth();
        if (!consoleInlineInput.disabled) {
            consoleInlineInput.focus();
        }
    }

    // --- Brand Dropdown Toggle ---
    function toggleEnablePasswordView() {
        // Permanently visible & optional for all brands
    }

    // --- View Swapper ---
    function updateAppView() {
        const session = getSession();
        if (session) {
            screenLogin.classList.add('hidden');
            screenDashboard.classList.remove('hidden');
            
            btnOpenPutty.style.display = 'inline-flex';
            btnOpenPutty.setAttribute('href', `telnet://${session.host}:${session.port}`);
            
            connectionHeaderPanel.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0, 242, 254, 0.1); border: 1px solid var(--primary); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; color: var(--primary);">
                        <i class="fa-solid fa-server"></i>
                        <span>Connected to ${session.hostname && session.hostname !== session.host ? session.hostname + ' (' + session.host + ':' + session.port + ')' : session.host + ':' + session.port} (${session.brand.toUpperCase()})</span>
                    </div>
                    <button class="btn btn-danger btn-sm" id="btn-disconnect" style="padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600;">
                        <i class="fa-solid fa-arrow-right-from-bracket"></i> Disconnect
                    </button>
                </div>
            `;
            
            document.getElementById('btn-disconnect').addEventListener('click', async () => {
                try {
                    await fetch('/api/olt/auth/disconnect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ host: session.host, port: session.port })
                    });
                } catch (err) {
                    console.error("Disconnect API error:", err);
                }
                clearSession();
                currentDiagTarget = null;
                searchQueryInput.value = '';
                hideAllResultsPanels();
                updateAppView();
                appendConsoleLog('Session disconnected by user.', 'system');
                showToast('Disconnected from OLT.', 'info');
            });
        } else {
            screenLogin.classList.remove('hidden');
            screenDashboard.classList.add('hidden');
            
            btnOpenPutty.style.display = 'none';
            btnOpenPutty.setAttribute('href', '#');
            
            connectionHeaderPanel.innerHTML = `
                <div class="connection-status-badge offline" style="display: flex; align-items: center; gap: 0.5rem; background: rgba(244, 63, 94, 0.1); border: 1px solid var(--danger); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; color: var(--danger);">
                    <i class="fa-solid fa-circle-dot" style="font-size: 0.75rem;"></i>
                    <span>Not Connected</span>
                </div>
            `;
        }
    }

    function hideAllResultsPanels() {
        vlanResultsCard.classList.add('hidden');
        vlanDetailsCard.classList.add('hidden');
        macResultsCard.classList.add('hidden');
        searchLoadingCard.classList.add('hidden');
        searchEmptyCard.classList.add('hidden');
    }

    // --- Authentication Submit ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const host = document.getElementById('login-host').value.trim();
        const port = document.getElementById('login-port').value.trim();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const enable_password = loginEnablePassword.value;
        
        const searchVal = deviceSearchInput.value.trim();
        let brand = loginBrand.value;
        const detected = detectBrandFromName(searchVal);
        if (detected) {
            brand = detected;
            loginBrand.value = detected;
        }
        
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const origHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...`;
        
        try {
            const matchedProfile = oltProfiles.find(p => p.host === host);
            const hostname = searchVal || (matchedProfile ? matchedProfile.name : host);

            const res = await fetch('/api/olt/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host, port, username, password, enable_password, brand })
            });
            const data = await res.json();
            
            if (data.success) {
                setSession({ host, port, username, password, enable_password, brand, hostname });
                updateAppView();
                showToast('Authentication succeeded!', 'success');
                appendConsoleLog(`Authenticated session successfully on brand [${brand.toUpperCase()}].`, 'system');
                appendConsoleLog(data.console_log);
            } else {
                showToast(data.error || 'Authentication failed. Verify credentials.', 'error');
                appendConsoleLog(data.console_log);
                appendConsoleLog(data.error || 'Login sequence failed.', 'error');
            }
        } catch (err) {
            showToast('Network error connecting to authentication server.', 'error');
            appendConsoleLog(`Network error: ${err.message || err}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origHtml;
        }
    });

    // --- Diagnostics Search Submit ---
    async function executeSearch(customQuery = null) {
        const session = getSession();
        if (!session) {
            showToast('Session expired. Please log in again.', 'error');
            updateAppView();
            return;
        }
        
        const query = customQuery || searchQueryInput.value.trim();
        if (!query) {
            showToast('Please enter a MAC address or VLAN ID.', 'info');
            return;
        }
        
        if (customQuery) {
            searchQueryInput.value = customQuery;
        }
        
        hideAllResultsPanels();
        searchLoadingCard.classList.remove('hidden');
        loadingStatusTitle.textContent = "Connecting & Querying OLT...";
        loadingStatusDesc.textContent = `Running CLI lookup commands on ${session.host} via Telnet...`;
        appendConsoleLog(`Initiating lookup query for: "${query}"...`, 'system');
        
        try {
            const res = await fetch('/api/olt/query/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: session.host,
                    port: session.port,
                    username: session.username,
                    password: session.password,
                    enable_password: session.enable_password,
                    brand: session.brand,
                    query: query
                })
            });
            
            const data = await res.json();
            searchLoadingCard.classList.add('hidden');
            appendConsoleLog(data.console_log);
            
            if (!data.success) {
                showToast(data.message || 'Invalid search format.', 'error');
                return;
            }
            
            if (data.type === 'vlan') {
                // Populate VLAN Details Summary Card
                if (data.vlan_info) {
                    vlanLblId.textContent = data.vlan_info.vlan_id || data.vlan;
                    vlanLblName.textContent = data.vlan_info.name || 'N/A';
                    vlanLblMac.textContent = data.vlan_info.mac_address || 'N/A';
                    vlanLblTagged.textContent = data.vlan_info.tagged_ports || 'None';
                    vlanLblUntagged.textContent = data.vlan_info.untagged_ports || 'None';
                    vlanDetailsCard.classList.remove('hidden');
                } else {
                    vlanDetailsCard.classList.add('hidden');
                }
                
                lblVlanId.textContent = data.vlan;
                vlanMacCountBadge.textContent = `${data.macs.length} MACs`;
                vlanResultsBody.innerHTML = '';
                
                if (data.macs.length === 0) {
                    vlanResultsBody.innerHTML = `
                        <tr>
                            <td colspan="8" class="empty-state" style="padding: 3rem 1rem;">
                                <i class="fa-solid fa-network-wired placeholder-icon"></i>
                                <p>No MAC addresses learned on VLAN ${data.vlan}.</p>
                            </td>
                        </tr>
                    `;
                } else {
                    data.macs.forEach(m => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-family: var(--font-mono); font-weight: 500;">${m.mac}</td>
                            <td>${m.vlan}</td>
                            <td>${m.sport || '-'}</td>
                            <td style="font-family: var(--font-mono);">${m.port}</td>
                            <td>${m.ont_id || '-'}</td>
                            <td>${m.gemid || '-'}</td>
                            <td><span style="background: rgba(255,255,255,0.05); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">${m.type}</span></td>
                            <td class="actions-cell">
                                ${(!m.ont_id && (m.port.toLowerCase().startsWith('ge') || m.port.toLowerCase().startsWith('xe') || m.port.toLowerCase().startsWith('xge') || m.port.toLowerCase().startsWith('tg') || m.port.toLowerCase().startsWith('ethernet'))) ? `
                                    <button class="btn btn-primary btn-sm btn-static-mac" data-port="${m.port}" data-vlan="${m.vlan}" data-mac="${m.mac}"><i class="fa-solid fa-anchor"></i> Make Static</button>
                                    <button class="btn btn-danger btn-sm btn-delete-static-mac" data-port="${m.port}" data-vlan="${m.vlan}" data-mac="${m.mac}" style="margin-left: 5px;"><i class="fa-solid fa-trash-can"></i> Delete</button>
                                ` : `<button class="btn btn-secondary btn-sm btn-diag-mac" data-mac="${m.mac}"><i class="fa-solid fa-magnifying-glass-chart"></i> Diagnose Line</button>`}
                            </td>
                        `;
                        vlanResultsBody.appendChild(tr);
                    });
                    
                    document.querySelectorAll('.btn-diag-mac').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const selectedMac = btn.getAttribute('data-mac');
                            executeSearch(selectedMac);
                        });
                    });

                    document.querySelectorAll('.btn-static-mac').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const vlan = btn.getAttribute('data-vlan');
                            const defaultMac = btn.getAttribute('data-mac') || '';
                            const port = btn.getAttribute('data-port') || '';
                            openStaticMacModal(defaultMac, vlan, port);
                        });
                    });
                    
                    document.querySelectorAll('.btn-delete-static-mac').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const port = btn.getAttribute('data-port');
                            const vlan = btn.getAttribute('data-vlan');
                            const defaultMac = btn.getAttribute('data-mac') || '';
                            
                            if (!confirm(`Are you sure you want to delete static MAC ${defaultMac} from port ${port} (VLAN ${vlan})?`)) {
                                return;
                            }
                            
                            const submitBtn = btn;
                            const origHtml = submitBtn.innerHTML;
                            submitBtn.disabled = true;
                            submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting...`;
                            
                            try {
                                const res = await fetch('/api/olt/action/delete-static', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        host: session.host,
                                        port: session.port,
                                        username: session.username,
                                        password: session.password,
                                        enable_password: session.enable_password,
                                        brand: session.brand,
                                        port_name: port,
                                        vlan: parseInt(vlan),
                                        mac: defaultMac.trim()
                                    })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    showToast(`Static MAC binding deleted successfully for ${data.formatted_mac || defaultMac}!`, 'success');
                                    appendConsoleLog(`Static MAC mapping removed on port ${port} (VLAN ${vlan}) for MAC ${data.formatted_mac || defaultMac}.`, 'system');
                                    appendConsoleLog(data.output);
                                    // Refresh search query if active
                                    const searchVal = searchQueryInput.value.trim();
                                    if (searchVal) executeSearch(searchVal);
                                } else {
                                    showToast(data.error || 'Failed to delete static MAC.', 'error');
                                    appendConsoleLog(data.console_log);
                                    appendConsoleLog(data.error || 'Static MAC deletion failed.', 'error');
                                }
                            } catch (err) {
                                showToast('Network error deleting static MAC.', 'error');
                                appendConsoleLog(`Network error: ${err.message || err}`, 'error');
                            } finally {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = origHtml;
                            }
                        });
                    });
                }
                
                vlanResultsCard.classList.remove('hidden');
                appendConsoleLog(`VLAN ${data.vlan} search complete. Found ${data.macs.length} MAC addresses.`, 'system');
                
            } else if (data.type === 'mac') {
                if (!data.found) {
                    searchEmptyTitle.textContent = "MAC Address Not Found";
                    searchEmptyDesc.textContent = `The MAC address '${query}' was not found in the OLT MAC address table.`;
                    searchEmptyCard.classList.remove('hidden');
                    appendConsoleLog(`MAC Address ${query} lookup finished - Not Found in OLT tables.`, 'system');
                    return;
                }
                
                currentDiagTarget = { port: data.port, ont_id: data.ont_id };
                
                lblSearchedMac.textContent = data.mac;
                macLblPort.textContent = `GPON ${data.port}`;
                macLblOntId.textContent = data.ont_id;
                macLblVlan.textContent = data.vlan;
                macLblSn.textContent = data.ont_sn;
                macLblDesc.textContent = data.ont_desc || 'No description set on OLT.';
                
                if (data.ont_status === 'online') {
                    macStatusBadge.className = 'status-badge online';
                    macStatusBadge.innerHTML = `<i class="fa-solid fa-circle-play"></i> Online`;
                } else {
                    macStatusBadge.className = 'status-badge offline';
                    macStatusBadge.innerHTML = `<i class="fa-solid fa-circle-stop"></i> Offline`;
                }
                
                const opt = data.optical;
                macLblRx.textContent = opt.rx_power || 'N/A';
                macLblTx.textContent = opt.tx_power || 'N/A';
                macLblOltRx.textContent = opt.olt_rx_power || 'N/A';
                macLblTemp.textContent = opt.temperature || 'N/A';
                
                if (opt.rx_power && opt.rx_power !== 'N/A') {
                    const match = opt.rx_power.match(/-?\d+\.?\d*/);
                    if (match) {
                        const val = parseFloat(match[0]);
                        if (val >= -26.0 && val <= -8.0) {
                            macLblRx.style.color = 'var(--success)';
                            macLblRxDesc.textContent = 'Ideal Signal Quality';
                            macLblRxDesc.style.color = 'var(--success)';
                        } else if (val < -26.0 && val >= -28.0) {
                            macLblRx.style.color = 'var(--warning)';
                            macLblRxDesc.textContent = 'Marginal / High Attenuation';
                            macLblRxDesc.style.color = 'var(--warning)';
                        } else {
                            macLblRx.style.color = 'var(--danger)';
                            macLblRxDesc.textContent = 'Critical / Low Signal (LOS Risk)';
                            macLblRxDesc.style.color = 'var(--danger)';
                        }
                    }
                } else {
                    macLblRx.style.color = 'var(--text-primary)';
                    macLblRxDesc.textContent = 'Signal power level';
                    macLblRxDesc.style.color = 'var(--text-secondary)';
                }
                
                // Configure Delete Static MAC button
                btnMacDeleteStatic.setAttribute('data-mac', data.mac);
                btnMacDeleteStatic.setAttribute('data-vlan', data.vlan);
                btnMacDeleteStatic.setAttribute('data-port', data.port);
                if (data.mac_type && data.mac_type.toLowerCase() === 'static') {
                    btnMacDeleteStatic.style.display = 'inline-block';
                } else {
                    btnMacDeleteStatic.style.display = 'none';
                }
                
                macResultsCard.classList.remove('hidden');
                appendConsoleLog(`MAC ${query} diagnostic analysis completed successfully.`, 'system');
            }
            
        } catch (err) {
            searchLoadingCard.classList.add('hidden');
            showToast(err.message || 'Error occurred while querying OLT.', 'error');
            
            searchEmptyTitle.textContent = "Diagnostic Query Failed";
            searchEmptyDesc.textContent = `The connection to the OLT timed out or returned an error: ${err.message || err}`;
            searchEmptyCard.classList.remove('hidden');
            appendConsoleLog(`Query error: ${err.message || err}`, 'error');
        }
    }

    btnSubmitSearch.addEventListener('click', () => executeSearch());
    searchQueryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executeSearch();
    });

    // --- Action: View Running Configuration Modal ---
    btnMacShowConfig.addEventListener('click', async () => {
        const session = getSession();
        if (!session || !currentDiagTarget) {
            showToast('Active OLT session or diagnostic target missing.', 'error');
            return;
        }
        
        configModalTitle.textContent = `Fetching running configuration for ONT ${currentDiagTarget.ont_id} on Port ${currentDiagTarget.port}...`;
        configModalRawOutput.textContent = "Connecting to OLT CLI and running show running-config...";
        configModal.classList.remove('hidden');
        appendConsoleLog(`Fetching configuration for ONT index ${currentDiagTarget.ont_id} on Port ${currentDiagTarget.port}...`, 'system');
        
        try {
            const res = await fetch('/api/olt/query/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: session.host,
                    port: session.port,
                    username: session.username,
                    password: session.password,
                    enable_password: session.enable_password,
                    brand: session.brand,
                    gpon_port: currentDiagTarget.port,
                    ont_id: currentDiagTarget.ont_id
                })
            });
            const data = await res.json();
            appendConsoleLog(data.console_log);
            
            if (data.success) {
                configModalRawOutput.textContent = data.config;
            } else {
                configModalRawOutput.textContent = `Error: ${data.error || 'Failed to fetch OLT config details.'}`;
            }
        } catch (err) {
            configModalRawOutput.textContent = 'Error: Network communication failure.';
            appendConsoleLog(`Config retrieval error: ${err.message || err}`, 'error');
        }
    });

    btnCloseConfigModal.addEventListener('click', () => {
        configModal.classList.add('hidden');
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === configModal) {
            configModal.classList.add('hidden');
        }
    });

    // --- Action: Reboot ONT ---
    btnMacReboot.addEventListener('click', async () => {
        const session = getSession();
        if (!session || !currentDiagTarget) {
            showToast('Active OLT session or diagnostic target missing.', 'error');
            return;
        }
        
        const confirmReboot = confirm(`Are you sure you want to send a remote REBOOT command to ONT ID ${currentDiagTarget.ont_id} on GPON Port ${currentDiagTarget.port}?`);
        if (!confirmReboot) return;
        
        const origHtml = btnMacReboot.innerHTML;
        btnMacReboot.disabled = true;
        btnMacReboot.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Rebooting...`;
        appendConsoleLog(`Sending REBOOT ONT signal to index ${currentDiagTarget.ont_id} on GPON Port ${currentDiagTarget.port}...`, 'system');
        
        try {
            const res = await fetch('/api/olt/action/reboot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: session.host,
                    port: session.port,
                    username: session.username,
                    password: session.password,
                    enable_password: session.enable_password,
                    brand: session.brand,
                    gpon_port: currentDiagTarget.port,
                    ont_id: currentDiagTarget.ont_id
                })
            });
            const data = await res.json();
            appendConsoleLog(data.console_log);
            
            if (data.success) {
                showToast(`Reboot signal sent successfully! OLT response:\n${data.raw || ''}`, 'success');
            } else {
                showToast(data.error || 'Failed to execute reboot command.', 'error');
            }
        } catch (err) {
            showToast('Network error executing reboot action.', 'error');
            appendConsoleLog(`Reboot error: ${err.message || err}`, 'error');
        } finally {
            btnMacReboot.disabled = false;
            btnMacReboot.innerHTML = origHtml;
        }
    });

    // --- Action: Live CLI Send Custom Command ---
    async function sendConsoleCustomCmd() {
        try {
            const session = getSession();
            if (!session) {
                showToast('No active OLT session. Please log in first.', 'error');
                return;
            }
            
            const cmd = consoleInlineInput.value;
            consoleInlineInput.value = '';
            adjustInputWidth();
            consoleInlineInput.disabled = true;
            
            const res = await fetch('/api/olt/action/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: session.host,
                    port: session.port,
                    username: session.username,
                    password: session.password,
                    enable_password: session.enable_password,
                    brand: session.brand,
                    command: cmd
                })
            });
            const data = await res.json();
            
            if (data.success) {
                appendConsoleLog(data.console_log);
            } else {
                appendConsoleLog(data.console_log);
                appendConsoleLog(`CLI Error: ${data.error || 'Failed to execute custom command.'}`, 'error');
            }
        } catch (err) {
            console.error("sendConsoleCustomCmd error:", err);
            appendConsoleLog(`Network Error: ${err.message || err}`, 'error');
        } finally {
            consoleInlineInput.disabled = false;
            adjustInputWidth();
            consoleInlineInput.focus();
        }
    }

    liveConsoleBox.addEventListener('click', () => {
        consoleInlineInput.focus();
    });

    let lastTabWord = '';
    let lastTabMatches = [];
    let lastTabMatchIndex = 0;

    consoleInlineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendConsoleCustomCmd();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            
            const value = consoleInlineInput.value;
            const words = value.split(' ');
            const lastWord = words[words.length - 1];
            
            // Cycle matches on repeat Tab press
            if (lastTabWord && lastWord && lastTabMatches.length > 0 && 
                (lastWord.trim() === lastTabMatches[lastTabMatchIndex] || lastTabMatches[lastTabMatchIndex].startsWith(lastWord.trim()))) {
                lastTabMatchIndex = (lastTabMatchIndex + 1) % lastTabMatches.length;
                words[words.length - 1] = lastTabMatches[lastTabMatchIndex];
                consoleInlineInput.value = words.join(' ') + (lastTabMatches.length === 1 ? ' ' : '');
                adjustInputWidth();
                return;
            }
            
            if (!lastWord) return;
            
            const session = getSession();
            const brand = session ? session.brand.toLowerCase() : 'vsol_gpon';
            
            const dictionary = [
                'show', 'config', 'interface', 'gpon', 'mac', 'address-table', 'mac-address-table', 'mac-address',
                'terminal', 'length', 'enable', 'exit', 'reboot', 'reset', 'status', 'display', 'ctc'
            ];
            
            if (brand.includes('cdata')) {
                dictionary.push('ont');
                dictionary.push('onu');
                dictionary.push('opm-diagnosis');
            } else if (brand.includes('huawei')) {
                dictionary.push('ont');
                dictionary.push('optical-info');
            } else if (brand.includes('fhnet')) {
                dictionary.push('onu-status');
                dictionary.push('onu-opm-diagnosis');
            } else if (brand.includes('phyhome')) {
                dictionary.push('ont-auth-info');
                dictionary.push('mac-table');
            } else if (brand.includes('utstarcom')) {
                dictionary.push('epon-olt');
                dictionary.push('opm-diagnisos');
            } else {
                dictionary.push('onu');
                dictionary.push('optical-info');
            }
            
            const matches = dictionary.filter(cmd => cmd.toLowerCase().startsWith(lastWord.toLowerCase()));
            
            if (matches.length > 0) {
                lastTabWord = lastWord;
                lastTabMatches = matches;
                lastTabMatchIndex = 0;
                
                words[words.length - 1] = matches[0];
                const suffix = matches.length === 1 ? ' ' : '';
                consoleInlineInput.value = words.join(' ') + suffix;
                adjustInputWidth();
            }
        } else {
            // Reset autocomplete memory
            lastTabWord = '';
            lastTabMatches = [];
            lastTabMatchIndex = 0;
        }
    });

    const btnFullscreenConsole = document.getElementById('btn-fullscreen-console');
    const workspaceRight = document.querySelector('.workspace-right');

    btnFullscreenConsole.addEventListener('click', () => {
        workspaceRight.classList.toggle('fullscreen-active');
        const isActive = workspaceRight.classList.contains('fullscreen-active');
        if (isActive) {
            btnFullscreenConsole.innerHTML = '<i class="fa-solid fa-compress"></i> Restore';
        } else {
            btnFullscreenConsole.innerHTML = '<i class="fa-solid fa-expand"></i> Maximize';
        }
        consoleInlineInput.focus();
    });

    btnClearConsole.addEventListener('click', () => {
        consoleHistoryText.innerHTML = '<span style="color: #66d9ef;">[System]</span> Console logs cleared.\n';
        consoleInlineInput.focus();
    });

    // --- Init App view on page load ---
    updateAppView();
});
