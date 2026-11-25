document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = '/api';

    // Theme Mode Init
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    const themeToggleIcon = document.getElementById('themeToggleIcon');
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeToggleIcon) {
            themeToggleIcon.setAttribute('data-lucide', 'moon');
        }
    } else {
        document.body.classList.remove('light-theme');
        if (themeToggleIcon) {
            themeToggleIcon.setAttribute('data-lucide', 'sun');
        }
    }

    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            if (themeToggleIcon) {
                themeToggleIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
            }
            if (window.lucide) {
                window.lucide.createIcons();
            }
            updateWorkloadChart();
        });
    }

    // Auth State
    let currentUser = null;

    // State Variables
    let allTasks = [];
    let allUsers = [];
    let allRoster = [];
    let activeShifts = {};
    let allQuickLinks = [];
    let currentView = 'table';
    let selectedStatusFilter = 'ALL';
    let selectedScopeFilter = 'ALL';
    let selectedUserFilter = 'ALL';
    let selectedSort = 'DEFAULT';
    let searchQuery = '';
    let selectedDependencyTaskId = null;
    let selectedDependencyTaskDesc = null;
    let selectedEscalationTaskId = null;
    let selectedEscalationTaskDesc = null;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // DOM Elements - Auth & Workspace
    const loginOverlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    
    const appWorkspace = document.getElementById('appWorkspace');
    const headerUserName = document.getElementById('headerUserName');
    const headerUserRole = document.getElementById('headerUserRole');
    const btnLogout = document.getElementById('btnLogout');
    const btnChangePassword = document.getElementById('btnChangePassword');
    const changePasswordModal = document.getElementById('changePasswordModal');
    const btnCloseChangePasswordModal = document.getElementById('btnCloseChangePasswordModal');
    const btnCancelChangePassword = document.getElementById('btnCancelChangePassword');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const changeCurrentPassInput = document.getElementById('currentPasswordInput');
    const changeNewPassInput = document.getElementById('newPasswordInput');
    const changeConfirmPassInput = document.getElementById('confirmNewPasswordInput');
    const changePasswordUserLabel = document.getElementById('changePasswordUserLabel');
    const btnAdminConsole = document.getElementById('btnAdminConsole');
    const activeOwnerNameLabel = document.getElementById('activeOwnerName');

    // DOM Elements - Control Deck (User Sketch)
    const taskDescriptionInput = document.getElementById('taskDescription');
    const timeDisplay = document.getElementById('timeDisplay');
    const btnStart = document.getElementById('btnStart');
    const btnFinish = document.getElementById('btnFinish');
    const btnExportFull = document.getElementById('btnExportFull');
    const btnExportDateWise = document.getElementById('btnExportDateWise');
    const taskControlCenter = document.querySelector('.task-control-center');

    // DOM Elements - Dashboard Filters
    const searchQueryInput = document.getElementById('searchQuery');
    const filterStatusSelect = document.getElementById('filterStatus');
    const filterScopeSelect = document.getElementById('filterScope');
    const filterUserSelect = document.getElementById('filterUser');
    const sortTasksSelect = document.getElementById('sortTasks');
    const thOwner = document.getElementById('thOwner');
    const ownerSortIndicator = document.getElementById('ownerSortIndicator');
    const viewGridBtn = document.getElementById('viewGrid');
    const viewTableBtn = document.getElementById('viewTable');

    // DOM Elements - Display Areas
    const tasksGrid = document.getElementById('tasksGrid');
    const tasksTableContainer = document.getElementById('tasksTableContainer');
    const tasksTableBody = document.getElementById('tasksTableBody');
    const emptyState = document.getElementById('emptyState');

    // DOM Elements - Metrics
    const metricTotal = document.getElementById('metricTotal');
    const metricPending = document.getElementById('metricPending');
    const metricProgress = document.getElementById('metricProgress');
    const metricCompleted = document.getElementById('metricCompleted');

    // DOM Elements - Edit Modal
    const editModal = document.getElementById('editModal');
    const editTaskForm = document.getElementById('editTaskForm');
    const editTaskIdInput = document.getElementById('editTaskId');
    const modalTaskIdLabel = document.getElementById('modalTaskId');
    const editDescriptionInput = document.getElementById('editDescription');
    const editOwnerInput = document.getElementById('editOwner');
    const editStartTimeInput = document.getElementById('editStartTime');
    const editEndTimeInput = document.getElementById('editEndTime');
    const editStatusSelect = document.getElementById('editStatus');
    const editMisStatusSelect = document.getElementById('editMisStatus');
    const editPendingReasonGroup = document.getElementById('editPendingReasonGroup');
    const editPendingReasonInput = document.getElementById('editPendingReason');
    const editEscalationHistoryGroup = document.getElementById('editEscalationHistoryGroup');
    const editEscalationHistoryInput = document.getElementById('editEscalationHistory');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnCancelEdit = document.getElementById('btnCancelEdit');

    // DOM Elements - Task Detail Terminal Modal
    const taskDetailModal = document.getElementById('taskDetailModal');
    const btnCloseDetailModal = document.getElementById('btnCloseDetailModal');
    const btnCloseDetailModalFooter = document.getElementById('btnCloseDetailModalFooter');
    const terminalTimestamp = document.getElementById('terminalTimestamp');
    const detailTaskId = document.getElementById('detailTaskId');
    const detailDescription = document.getElementById('detailDescription');
    const detailReference = document.getElementById('detailReference');
    const detailCategory = document.getElementById('detailCategory');
    const detailOwner = document.getElementById('detailOwner');
    const detailStatus = document.getElementById('detailStatus');
    const detailStartTime = document.getElementById('detailStartTime');
    const detailEndTime = document.getElementById('detailEndTime');
    const detailDuration = document.getElementById('detailDuration');
    const detailPendingReason = document.getElementById('detailPendingReason');
    const detailEscalationHistory = document.getElementById('detailEscalationHistory');
    const detailAssignedTime = document.getElementById('detailAssignedTime');
    const detailAssignmentHistory = document.getElementById('detailAssignmentHistory');

    // DOM Elements - Implementation Tracker
    const btnOpenImplTracker = document.getElementById('btnOpenImplTracker');
    const implTrackerModal = document.getElementById('implTrackerModal');
    const btnCloseImplTrackerModal = document.getElementById('btnCloseImplTrackerModal');
    const implTrackerSearch = document.getElementById('implTrackerSearch');
    const implTrackerStatusFilter = document.getElementById('implTrackerStatusFilter');
    const implTrackerVerifyFilter = document.getElementById('implTrackerVerifyFilter');
    const implTrackerTableBody = document.getElementById('implTrackerTableBody');
    const statImplTotal = document.getElementById('statImplTotal');
    const statImplProgress = document.getElementById('statImplProgress');
    const statImplCompleted = document.getElementById('statImplCompleted');
    const statImplVerified = document.getElementById('statImplVerified');

    // DOM Elements - Admin Modal
    const adminModal = document.getElementById('adminModal');
    const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
    const createUserForm = document.getElementById('createUserForm');
    const newUsernameInput = document.getElementById('newUsername');
    const newFullNameInput = document.getElementById('newFullName');
    const newPasswordInput = document.getElementById('newPassword');
    const adminUsersTableBody = document.getElementById('adminUsersTableBody');
    const importRosterForm = document.getElementById('importRosterForm');
    const rosterFileInput = document.getElementById('rosterFile');
    const btnClearAllTasks = document.getElementById('btnClearAllTasks');
    const shiftsConfigContainer = document.getElementById('shiftsConfigContainer');
    const btnAddShiftRow = document.getElementById('btnAddShiftRow');
    const btnSaveShiftsConfig = document.getElementById('btnSaveShiftsConfig');
    
    // Workload Chart Elements
    const adminDashboardSection = document.getElementById('adminDashboardSection');
    const workloadChartType = document.getElementById('workloadChartType');

    // Quick Links Elements
    const quickLinksContainer = document.getElementById('quickLinksContainer');
    const quickLinksConfigContainer = document.getElementById('quickLinksConfigContainer');
    const btnAddLinkRow = document.getElementById('btnAddLinkRow');
    const btnSaveLinksConfig = document.getElementById('btnSaveLinksConfig');

    // DOM Elements - Roster Modal
    const btnOpenTShoot = document.getElementById('btnOpenTShoot');
    const btnOpenScriptGen = document.getElementById('btnOpenScriptGen');
    const btnOpenCustomerTracker = document.getElementById('btnOpenCustomerTracker');
    const btnViewRoster = document.getElementById('btnViewRoster');
    const rosterModal = document.getElementById('rosterModal');
    const btnCloseRosterModal = document.getElementById('btnCloseRosterModal');
    const rosterModalAdminSection = document.getElementById('rosterModalAdminSection');
    const rosterModalUploadForm = document.getElementById('rosterModalUploadForm');
    const rosterModalFileInput = document.getElementById('rosterModalFile');
    const btnSaveRosterChanges = document.getElementById('btnSaveRosterChanges');
    const rosterModalFooter = document.getElementById('rosterModalFooter');
    
    // DOM Elements - Finish Task Selection Modal
    const finishTaskModal = document.getElementById('finishTaskModal');
    const btnCloseFinishModal = document.getElementById('btnCloseFinishModal');
    const btnCancelFinishModal = document.getElementById('btnCancelFinishModal');
    const finishTasksList = document.getElementById('finishTasksList');

    // DOM Elements - Pending Dependency Wizard Modal & Button
    const btnPendingDependency = document.getElementById('btnPendingDependency');
    const dependencyModal = document.getElementById('dependencyModal');
    const dependencyStepSelect = document.getElementById('dependencyStepSelect');
    const dependencyStepInput = document.getElementById('dependencyStepInput');
    const dependencyTasksList = document.getElementById('dependencyTasksList');
    const dependencyTaskPreview = document.getElementById('dependencyTaskPreview');
    const dependencyReasonInput = document.getElementById('dependencyReasonInput');
    const btnSubmitDependency = document.getElementById('btnSubmitDependency');

    // DOM Elements - Task Escalation Wizard Modal & Button
    const btnEscalateTask = document.getElementById('btnEscalateTask');
    const escalationModal = document.getElementById('escalationModal');
    const escalationStepSelect = document.getElementById('escalationStepSelect');
    const escalationStepInput = document.getElementById('escalationStepInput');
    const escalationTasksList = document.getElementById('escalationTasksList');
    const escalationTaskPreview = document.getElementById('escalationTaskPreview');
    const escalationRecipientSelect = document.getElementById('escalationRecipientSelect');
    const escalationReasonInput = document.getElementById('escalationReasonInput');
    const btnSubmitEscalation = document.getElementById('btnSubmitEscalation');

    // DOM Elements - Toast Container
    const toastContainer = document.getElementById('toastContainer');

    // Initialize Lucide Icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // --- Live System Clock (Current Time box) ---
    function updateClock() {
        if (!timeDisplay) return;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        timeDisplay.textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    setInterval(updateClock, 1000);
    updateClock(); // Initial run

    // --- Resilient Heartbeat System (Background & Multi-Tab Friendly) ---
    let heartbeatWorker = null;
    let heartbeatFallbackInterval = null;
    let lastBeatTimestamp = 0;

    function initHeartbeatWorker() {
        if (heartbeatWorker) return;
        try {
            const workerCode = `
                let timer = null;
                self.onmessage = function(e) {
                    if (e.data === 'start') {
                        if (timer) clearInterval(timer);
                        timer = setInterval(function() {
                            self.postMessage('beat');
                        }, 15000);
                    } else if (e.data === 'stop') {
                        if (timer) clearInterval(timer);
                        timer = null;
                    }
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            heartbeatWorker = new Worker(URL.createObjectURL(blob));
            heartbeatWorker.onmessage = function(e) {
                if (e.data === 'beat' && currentUser) {
                    sendHeartbeat();
                }
            };
        } catch (err) {
            console.warn('Inline Web Worker not available, falling back to interval:', err);
            heartbeatWorker = null;
        }
    }

    async function sendHeartbeat() {
        if (!currentUser || !currentUser.username) return;
        const now = Date.now();
        if (now - lastBeatTimestamp < 4000) return; // Prevent double-fire within 4s
        lastBeatTimestamp = now;

        try {
            const u = encodeURIComponent(currentUser.username);
            fetch(`${API_BASE}/heartbeat?username=${u}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser.username }),
                keepalive: true
            }).catch(() => {});
        } catch (e) {
            // Ignore background network transient errors
        }
    }

    function startHeartbeat() {
        if (!heartbeatWorker) {
            initHeartbeatWorker();
        }
        if (heartbeatWorker) {
            try {
                heartbeatWorker.postMessage('start');
            } catch (e) {}
        }
        if (!heartbeatFallbackInterval) {
            heartbeatFallbackInterval = setInterval(() => {
                if (currentUser) sendHeartbeat();
            }, 15000);
        }
        sendHeartbeat();
    }

    function stopHeartbeat() {
        if (heartbeatWorker) {
            try {
                heartbeatWorker.postMessage('stop');
            } catch (e) {}
        }
        if (heartbeatFallbackInterval) {
            clearInterval(heartbeatFallbackInterval);
            heartbeatFallbackInterval = null;
        }
    }

    // Immediately refresh & heartbeat when switching back to tab
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && currentUser) {
            lastActivityTime = Date.now();
            sendHeartbeat();
            fetchTasks();
        }
    });

    window.addEventListener('focus', () => {
        if (currentUser) {
            lastActivityTime = Date.now();
            sendHeartbeat();
            fetchTasks();
        }
    });

    // Cross-tab authentication synchronization
    window.addEventListener('storage', (e) => {
        if (e.key === 'currentUser') {
            checkAuth();
        }
    });

    // --- Session / Authentication State Check ---
    function checkAuth() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            startHeartbeat();
            
            // Set UI details
            headerUserName.textContent = currentUser.name;
            headerUserRole.textContent = currentUser.role === 'admin' ? 'Administrator' : 'Operator';
            activeOwnerNameLabel.textContent = currentUser.name;
            
            // Show admin features and apply themes based on user role
            if (currentUser.role === 'admin') {
                document.body.classList.remove('operator-theme');
                btnAdminConsole.classList.remove('hidden');
                if (rosterModalAdminSection) rosterModalAdminSection.classList.remove('hidden');
                if (rosterModalFooter) rosterModalFooter.classList.remove('hidden');
                if (taskControlCenter) taskControlCenter.classList.add('hidden');
                if (filterUserSelect) filterUserSelect.classList.remove('hidden');
                if (sortTasksSelect) sortTasksSelect.classList.remove('hidden');
                if (thOwner) {
                    thOwner.classList.add('sortable-header');
                    thOwner.style.cursor = 'pointer';
                }
            } else {
                document.body.classList.add('operator-theme');
                btnAdminConsole.classList.add('hidden');
                if (rosterModalAdminSection) rosterModalAdminSection.classList.add('hidden');
                if (rosterModalFooter) rosterModalFooter.classList.add('hidden');
                if (taskControlCenter) taskControlCenter.classList.remove('hidden');
                if (filterUserSelect) filterUserSelect.classList.add('hidden');
                if (sortTasksSelect) sortTasksSelect.classList.add('hidden');
                selectedUserFilter = 'ALL';
                selectedSort = 'DEFAULT';
                if (filterUserSelect) filterUserSelect.value = 'ALL';
                if (sortTasksSelect) sortTasksSelect.value = 'DEFAULT';
                if (thOwner) {
                    thOwner.classList.remove('sortable-header');
                    thOwner.style.cursor = 'default';
                }
                if (ownerSortIndicator) {
                    ownerSortIndicator.textContent = '↕';
                    ownerSortIndicator.style.opacity = '0.5';
                    ownerSortIndicator.style.color = 'inherit';
                }
            }
            if (adminDashboardSection) adminDashboardSection.classList.remove('hidden');

            // Toggle Reports Console visibility
            const btnReportsConsole = document.getElementById('btnReportsConsole');
            if (btnReportsConsole) {
                const hasReportsAccess = currentUser.role === 'admin' || currentUser.reports_access === 'true';
                if (hasReportsAccess) {
                    btnReportsConsole.classList.remove('hidden');
                } else {
                    btnReportsConsole.classList.add('hidden');
                }
            }
            
            // Toggle view visibility
            loginOverlay.classList.add('hidden');
            appWorkspace.classList.remove('hidden');
            
            // Fetch initial tasks
            fetchTasks();
            fetchQuickLinks();
        } else {
            currentUser = null;
            stopHeartbeat();
            document.body.classList.remove('operator-theme');
            if (taskControlCenter) taskControlCenter.classList.remove('hidden');
            if (adminDashboardSection) adminDashboardSection.classList.add('hidden');
            
            const btnReportsConsole = document.getElementById('btnReportsConsole');
            if (btnReportsConsole) btnReportsConsole.classList.add('hidden');

            if (filterUserSelect) filterUserSelect.classList.add('hidden');
            if (sortTasksSelect) sortTasksSelect.classList.add('hidden');
            selectedUserFilter = 'ALL';
            selectedSort = 'DEFAULT';
            if (filterUserSelect) filterUserSelect.value = 'ALL';
            if (sortTasksSelect) sortTasksSelect.value = 'DEFAULT';
            if (thOwner) {
                thOwner.classList.remove('sortable-header');
                thOwner.style.cursor = 'default';
            }
            if (ownerSortIndicator) {
                ownerSortIndicator.textContent = '↕';
                ownerSortIndicator.style.opacity = '0.5';
                ownerSortIndicator.style.color = 'inherit';
            }
            
            loginOverlay.classList.remove('hidden');
            appWorkspace.classList.add('hidden');
        }
    }

    // Handle Login Form Submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value;

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                showToast(`Welcome back, ${data.user.name}!`, 'success');
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                loginForm.reset();
                checkAuth();
                sendHeartbeat();
            } else {
                showToast(data.message || 'Login failed. Please check credentials.', 'error');
            }
        } catch (error) {
            console.error('Error logging in:', error);
            showToast('Unable to connect to local authentication server.', 'error');
        }
    });

    // Handle Logout
    btnLogout.addEventListener('click', () => {
        const userLoggingOut = currentUser ? currentUser.username : null;
        localStorage.removeItem('currentUser');
        stopHeartbeat();
        if (userLoggingOut) {
            try {
                fetch(`${API_BASE}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: userLoggingOut }),
                    keepalive: true
                }).catch(() => {});
            } catch (e) {}
        }
        showToast('Successfully logged out.', 'info');
        checkAuth();
    });

    // --- Change Password Operations (Dedicated Security Console Window) ---
    const passStrengthLabel = document.getElementById('passStrengthLabel');
    const passStrengthBar = document.getElementById('passStrengthBar');
    const passMatchIndicator = document.getElementById('passMatchIndicator');

    function evaluatePasswordStrength(val) {
        if (!val) {
            if (passStrengthLabel) passStrengthLabel.textContent = '';
            if (passStrengthBar) {
                passStrengthBar.style.width = '0%';
                passStrengthBar.style.backgroundColor = '#ef4444';
            }
            return;
        }
        let score = 0;
        if (val.length >= 4) score += 25;
        if (val.length >= 8) score += 25;
        if (/[0-9]/.test(val)) score += 25;
        if (/[^A-Za-z0-9]/.test(val)) score += 25;

        if (score <= 25) {
            if (passStrengthLabel) {
                passStrengthLabel.textContent = 'Weak';
                passStrengthLabel.style.color = '#ef4444';
            }
            if (passStrengthBar) {
                passStrengthBar.style.width = '30%';
                passStrengthBar.style.backgroundColor = '#ef4444';
            }
        } else if (score <= 75) {
            if (passStrengthLabel) {
                passStrengthLabel.textContent = 'Good';
                passStrengthLabel.style.color = '#f59e0b';
            }
            if (passStrengthBar) {
                passStrengthBar.style.width = '65%';
                passStrengthBar.style.backgroundColor = '#f59e0b';
            }
        } else {
            if (passStrengthLabel) {
                passStrengthLabel.textContent = 'Strong';
                passStrengthLabel.style.color = '#10b981';
            }
            if (passStrengthBar) {
                passStrengthBar.style.width = '100%';
                passStrengthBar.style.backgroundColor = '#10b981';
            }
        }
    }

    function checkPasswordMatch() {
        if (!passMatchIndicator) return;
        const newPass = changeNewPassInput ? changeNewPassInput.value : '';
        const confirmPass = changeConfirmPassInput ? changeConfirmPassInput.value : '';
        if (!confirmPass) {
            passMatchIndicator.textContent = '';
            return;
        }
        if (newPass === confirmPass) {
            passMatchIndicator.textContent = '✓ Passwords match';
            passMatchIndicator.style.color = '#10b981';
        } else {
            passMatchIndicator.textContent = '✗ Do not match';
            passMatchIndicator.style.color = '#ef4444';
        }
    }

    if (changeNewPassInput) {
        changeNewPassInput.addEventListener('input', () => {
            evaluatePasswordStrength(changeNewPassInput.value);
            checkPasswordMatch();
        });
    }

    if (changeConfirmPassInput) {
        changeConfirmPassInput.addEventListener('input', checkPasswordMatch);
    }

    // Password visibility eye toggles
    document.querySelectorAll('.btn-toggle-pass-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (!targetInput) return;
            const isPassword = targetInput.type === 'password';
            targetInput.type = isPassword ? 'text' : 'password';
            btn.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}" style="width: 16px; height: 16px;"></i>`;
            if (window.lucide) window.lucide.createIcons();
        });
    });

    if (btnChangePassword) {
        btnChangePassword.addEventListener('click', () => {
            if (!currentUser) return;
            if (changePasswordUserLabel) {
                changePasswordUserLabel.textContent = `${currentUser.name} (${currentUser.username})`;
            }
            if (changePasswordForm) changePasswordForm.reset();
            evaluatePasswordStrength('');
            if (passMatchIndicator) passMatchIndicator.textContent = '';
            if (changePasswordModal) {
                changePasswordModal.classList.remove('hidden');
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => changeCurrentPassInput?.focus(), 100);
            }
        });
    }

    function closeChangePasswordModal() {
        if (changePasswordModal) changePasswordModal.classList.add('hidden');
        if (changePasswordForm) changePasswordForm.reset();
        evaluatePasswordStrength('');
        if (passMatchIndicator) passMatchIndicator.textContent = '';
        // Reset inputs to password type
        [changeCurrentPassInput, changeNewPassInput, changeConfirmPassInput].forEach(inp => {
            if (inp) inp.type = 'password';
        });
        document.querySelectorAll('.btn-toggle-pass-visibility').forEach(btn => {
            btn.innerHTML = `<i data-lucide="eye" style="width: 16px; height: 16px;"></i>`;
        });
        if (window.lucide) window.lucide.createIcons();
    }

    if (btnCloseChangePasswordModal) {
        btnCloseChangePasswordModal.addEventListener('click', closeChangePasswordModal);
    }
    if (btnCancelChangePassword) {
        btnCancelChangePassword.addEventListener('click', closeChangePasswordModal);
    }

    if (changePasswordModal) {
        changePasswordModal.addEventListener('click', (e) => {
            if (e.target === changePasswordModal) {
                closeChangePasswordModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && changePasswordModal && !changePasswordModal.classList.contains('hidden')) {
            closeChangePasswordModal();
        }
    });

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const current_password = changeCurrentPassInput.value;
            const new_password = changeNewPassInput.value;
            const confirm_password = changeConfirmPassInput.value;

            if (new_password !== confirm_password) {
                showToast('New passwords do not match. Please re-enter.', 'error');
                changeConfirmPassInput.focus();
                return;
            }

            if (new_password.length < 3) {
                showToast('New password must be at least 3 characters.', 'error');
                changeNewPassInput.focus();
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/auth/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: currentUser.username,
                        current_password: current_password,
                        new_password: new_password
                    })
                });

                const data = await response.json();
                if (response.ok && data.success) {
                    showToast('Password updated successfully! It will remain intact even after roster updates.', 'success');
                    closeChangePasswordModal();
                } else {
                    showToast(data.message || 'Failed to update password.', 'error');
                }
            } catch (err) {
                console.error('Error updating password:', err);
                showToast('Failed to connect to server to update password.', 'error');
            }
        });
    }

    // --- Admin Console Operations ---
    
    btnAdminConsole.addEventListener('click', () => {
        adminModal.classList.remove('hidden');
        fetchUsers();
        fetchShifts();
        renderQuickLinksConfig();
        updateAdminDiagnostics();
        if (window.lucide) window.lucide.createIcons();
    });

    // Admin Console Tab Switching Logic
    const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
    const adminTabPanes = document.querySelectorAll('.admin-tab-pane');

    adminTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabId = btn.getAttribute('data-tab');
            
            adminTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            adminTabPanes.forEach(pane => {
                if (pane.id === targetTabId) {
                    pane.classList.remove('hidden');
                    pane.classList.add('active');
                } else {
                    pane.classList.add('hidden');
                    pane.classList.remove('active');
                }
            });

            if (targetTabId === 'tabAdminSystem') {
                updateAdminDiagnostics();
            }
            if (window.lucide) {
                window.lucide.createIcons();
            }
        });
    });

    function updateAdminDiagnostics() {
        const diagTasks = document.getElementById('diagTasksCount');
        const diagUsers = document.getElementById('diagUsersCount');
        const diagRoster = document.getElementById('diagRosterCount');
        if (diagTasks) diagTasks.textContent = allTasks.length;
        if (diagUsers) diagUsers.textContent = allUsers.length;
        if (diagRoster) diagRoster.textContent = allRoster.length;
    }

    // Admin User Search Filter
    const adminUserSearch = document.getElementById('adminUserSearch');
    if (adminUserSearch) {
        adminUserSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#adminUsersTableBody tr');
            rows.forEach(r => {
                const text = r.textContent.toLowerCase();
                r.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    // Close Admin Modal
    btnCloseAdminModal.addEventListener('click', () => {
        adminModal.classList.add('hidden');
    });

    // --- Reports Console Modal Operations ---
    const btnReportsConsole = document.getElementById('btnReportsConsole');
    const reportsConsoleModal = document.getElementById('reportsConsoleModal');
    const btnCloseReportsConsoleModal = document.getElementById('btnCloseReportsConsoleModal');

    async function fetchCloudBackupSettings() {
        const backupEnabled = document.getElementById('backupEnabled');
        const backupInterval = document.getElementById('backupInterval');
        const backupUrl = document.getElementById('backupUrl');
        const lblLastRun = document.getElementById('lblLastRun');
        const lblSyncStatus = document.getElementById('lblSyncStatus');
        const lblSyncError = document.getElementById('lblSyncError');

        // GitHub Fields
        const gitSyncEnabled = document.getElementById('gitSyncEnabled');
        const gitSyncInterval = document.getElementById('gitSyncInterval');
        const gitToken = document.getElementById('gitToken');
        const lblGitLastRun = document.getElementById('lblGitLastRun');
        const lblGitLastTag = document.getElementById('lblGitLastTag');
        const lblGitSyncStatus = document.getElementById('lblGitSyncStatus');
        const lblGitSyncError = document.getElementById('lblGitSyncError');

        if (!backupEnabled || !backupInterval || !backupUrl) return;

        try {
            const response = await fetch(`${API_BASE}/admin/backup-settings`);
            if (response.ok) {
                const settings = await response.json();
                
                // OneDrive values
                backupEnabled.checked = settings.enabled;
                backupInterval.value = settings.interval_hours;
                backupUrl.value = settings.target_url || '';
                lblLastRun.textContent = settings.last_run || 'Never';
                
                const status = settings.last_status || 'Idle';
                lblSyncStatus.textContent = status;
                if (status === 'Success') {
                    lblSyncStatus.style.color = '#10b981';
                } else if (status === 'Failed') {
                    lblSyncStatus.style.color = '#ef4444';
                } else if (status === 'Running...') {
                    lblSyncStatus.style.color = '#3b82f6';
                } else {
                    lblSyncStatus.style.color = 'var(--text-muted)';
                }
                lblSyncError.textContent = settings.last_error || 'None';
                lblSyncError.style.color = settings.last_error ? '#ef4444' : 'var(--text-muted)';

                // GitHub values
                if (gitSyncEnabled && gitSyncInterval && gitToken) {
                    gitSyncEnabled.checked = settings.github_enabled;
                    gitSyncInterval.value = settings.github_interval_hours;
                    gitToken.value = settings.github_token || '';
                    lblGitLastRun.textContent = settings.github_last_run || 'Never';
                    lblGitLastTag.textContent = settings.github_last_tag || 'None';
                    
                    const gitStatus = settings.github_last_status || 'Idle';
                    lblGitSyncStatus.textContent = gitStatus;
                    if (gitStatus === 'Success') {
                        lblGitSyncStatus.style.color = '#10b981';
                    } else if (gitStatus === 'Failed') {
                        lblGitSyncStatus.style.color = '#ef4444';
                    } else if (gitStatus === 'Running...') {
                        lblGitSyncStatus.style.color = '#3b82f6';
                    } else {
                        lblGitSyncStatus.style.color = 'var(--text-muted)';
                    }
                    lblGitSyncError.textContent = settings.github_last_error || 'None';
                    lblGitSyncError.style.color = settings.github_last_error ? '#ef4444' : 'var(--text-muted)';
                }
            }
        } catch (error) {
            console.error('Error loading cloud backup settings:', error);
        }
    }

    if (btnReportsConsole && reportsConsoleModal && btnCloseReportsConsoleModal) {
        btnReportsConsole.addEventListener('click', () => {
            reportsConsoleModal.classList.remove('hidden');
            fetchCloudBackupSettings();
            if (window.lucide) window.lucide.createIcons();
        });
        
        btnCloseReportsConsoleModal.addEventListener('click', () => {
            reportsConsoleModal.classList.add('hidden');
        });
    }

    // Reports Console: Export Full Database
    const btnConsoleExportFull = document.getElementById('btnConsoleExportFull');
    if (btnConsoleExportFull) {
        btnConsoleExportFull.addEventListener('click', () => {
            window.location.href = `${API_BASE}/tasks/export`;
        });
    }

    // Reports Console: Export Date-Wise Filtered Task Report
    const btnConsoleExportDateWise = document.getElementById('btnConsoleExportDateWise');
    const consoleExportStartDate = document.getElementById('consoleExportStartDate');
    const consoleExportEndDate = document.getElementById('consoleExportEndDate');
    if (btnConsoleExportDateWise && consoleExportStartDate && consoleExportEndDate) {
        btnConsoleExportDateWise.addEventListener('click', () => {
            const start = consoleExportStartDate.value;
            const end = consoleExportEndDate.value;
            if (!start || !end) {
                showToast("Please select both start and end dates.", "warning");
                return;
            }
            window.location.href = `${API_BASE}/tasks/export?start_date=${start}&end_date=${end}`;
        });
    }

    // Reports Console: Import Database File Form Submission
    const importTasksForm = document.getElementById('importTasksForm');
    const importTasksFile = document.getElementById('importTasksFile');
    if (importTasksForm && importTasksFile) {
        importTasksForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!importTasksFile.files || importTasksFile.files.length === 0) {
                showToast("Please choose an Excel database file first.", "warning");
                return;
            }
            if (!confirm("Are you sure you want to import this Excel file? It will replace all tasks currently in the database. A backup will be generated first.")) {
                return;
            }
            
            const file = importTasksFile.files[0];
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                showToast("Uploading and importing tasks database...", "info");
                const response = await fetch(`${API_BASE}/tasks/import`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                
                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }
                
                if (response.ok) {
                    showToast(data.message || "Database imported successfully!", "success");
                    importTasksForm.reset();
                    if (reportsConsoleModal) reportsConsoleModal.classList.add('hidden');
                    fetchTasks();
                } else {
                    showToast(data.message || "Failed to import database.", "error");
                }
            } catch (error) {
                console.error("Error importing tasks database:", error);
                showToast("Server error importing database.", "error");
            }
        });
    }

    // Reports Console: Save Cloud Backup Settings
    const cloudBackupForm = document.getElementById('cloudBackupForm');
    if (cloudBackupForm) {
        cloudBackupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const enabled = document.getElementById('backupEnabled').checked;
            const interval = parseFloat(document.getElementById('backupInterval').value);
            const url = document.getElementById('backupUrl').value.trim();

            try {
                showToast("Saving cloud backup settings...", "info");
                const response = await fetch(`${API_BASE}/admin/backup-settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        enabled: enabled,
                        interval_hours: interval,
                        target_url: url
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    showToast("Cloud backup settings saved successfully!", "success");
                    fetchCloudBackupSettings();
                } else {
                    showToast(data.message || "Failed to save settings.", "error");
                }
            } catch (error) {
                console.error("Error saving backup settings:", error);
                showToast("Server error saving settings.", "error");
            }
        });
    }

    // Reports Console: Test Sync Now
    const btnTestBackup = document.getElementById('btnTestBackup');
    if (btnTestBackup) {
        btnTestBackup.addEventListener('click', async () => {
            const url = document.getElementById('backupUrl').value.trim();
            if (!url) {
                showToast("Please enter a Power Automate Webhook URL first.", "warning");
                return;
            }
            if (!confirm("Run an instant test backup upload to OneDrive? This will send the database Excel file to your configured webhook link immediately.")) {
                return;
            }

            try {
                showToast("Executing cloud sync trial...", "info");
                btnTestBackup.disabled = true;
                const response = await fetch(`${API_BASE}/admin/backup-settings/test`, {
                    method: 'POST'
                });
                const data = await response.json();
                
                if (response.ok) {
                    showToast("Test backup uploaded successfully to OneDrive!", "success");
                } else {
                    showToast(`Backup sync failed: ${data.message}`, "error");
                }
                fetchCloudBackupSettings();
            } catch (error) {
                console.error("Error testing backup sync:", error);
                showToast("Server error running sync trial.", "error");
                fetchCloudBackupSettings();
            } finally {
                btnTestBackup.disabled = false;
            }
        });
    }

    // Reports Console: Save GitHub Auto-Sync Settings
    const githubSyncForm = document.getElementById('githubSyncForm');
    if (githubSyncForm) {
        githubSyncForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const enabled = document.getElementById('gitSyncEnabled').checked;
            const interval = parseFloat(document.getElementById('gitSyncInterval').value);
            const token = document.getElementById('gitToken').value.trim();

            try {
                showToast("Saving GitHub sync settings...", "info");
                const response = await fetch(`${API_BASE}/admin/backup-settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        github_enabled: enabled,
                        github_interval_hours: interval,
                        github_token: token
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    showToast("GitHub sync settings saved successfully!", "success");
                    fetchCloudBackupSettings();
                } else {
                    showToast(data.message || "Failed to save settings.", "error");
                }
            } catch (error) {
                console.error("Error saving GitHub sync settings:", error);
                showToast("Server error saving settings.", "error");
            }
        });
    }

    // Reports Console: Test Git Sync Now
    const btnTestGitSync = document.getElementById('btnTestGitSync');
    if (btnTestGitSync) {
        btnTestGitSync.addEventListener('click', async () => {
            const token = document.getElementById('gitToken').value.trim();
            if (!token) {
                showToast("Please enter a GitHub Personal Access Token first.", "warning");
                return;
            }
            if (!confirm("Run an instant test database commit & push to GitHub backups branch? This will push database tasks.xlsx immediately.")) {
                return;
            }

            try {
                showToast("Executing GitHub sync trial...", "info");
                btnTestGitSync.disabled = true;
                const response = await fetch(`${API_BASE}/admin/backup-settings/test-github`, {
                    method: 'POST'
                });
                const data = await response.json();
                
                if (response.ok) {
                    showToast("Test backup successfully pushed to GitHub database-backups branch!", "success");
                } else {
                    showToast(`GitHub sync failed: ${data.message}`, "error");
                }
                fetchCloudBackupSettings();
            } catch (error) {
                console.error("Error testing GitHub sync:", error);
                showToast("Server error running GitHub sync trial.", "error");
                fetchCloudBackupSettings();
            } finally {
                btnTestGitSync.disabled = false;
            }
        });
    }

    // Open T-Shoot Tools Hub
    if (btnOpenTShoot) {
        btnOpenTShoot.addEventListener('click', () => {
            window.open('/t-shoot', '_blank');
        });
    }

    // Open Script Generator Hub
    if (btnOpenScriptGen) {
        btnOpenScriptGen.addEventListener('click', () => {
            window.open('/script-gen', '_blank');
        });
    }

    // Open Customer Issue Tracker Hub
    if (btnOpenCustomerTracker) {
        btnOpenCustomerTracker.addEventListener('click', () => {
            window.open('/customer-tracker/', '_blank');
        });
    }

    // Open Roster Modal
    btnViewRoster.addEventListener('click', () => {
        if (rosterModal) {
            rosterModal.classList.remove('hidden');
            renderRosterGrid();
        }
    });

    // Close Roster Modal
    if (btnCloseRosterModal) {
        btnCloseRosterModal.addEventListener('click', () => {
            rosterModal.classList.add('hidden');
        });
    }

    // Close Finish Task Selection Modal
    if (btnCloseFinishModal) {
        btnCloseFinishModal.addEventListener('click', () => {
            finishTaskModal.classList.add('hidden');
        });
    }
    if (btnCancelFinishModal) {
        btnCancelFinishModal.addEventListener('click', () => {
            finishTaskModal.classList.add('hidden');
        });
    }

    // Close Dependency Wizard Modal
    function closeDependencyModal() {
        if (dependencyModal) dependencyModal.classList.add('hidden');
        if (dependencyStepSelect) dependencyStepSelect.classList.add('hidden');
        if (dependencyStepInput) dependencyStepInput.classList.add('hidden');
        if (dependencyReasonInput) dependencyReasonInput.value = '';
        selectedDependencyTaskId = null;
        selectedDependencyTaskDesc = null;
    }

    document.querySelectorAll('.btn-close-dep').forEach(el => {
        el.addEventListener('click', closeDependencyModal);
    });

    // Handle "Pending for Dependency" Button Click
    if (btnPendingDependency) {
        btnPendingDependency.addEventListener('click', () => {
            if (!currentUser) return;
            const owner = currentUser.name;

            // Find all active running or pending tasks of the user
            const activeTasks = allTasks.filter(t => t.owner.toLowerCase() === owner.toLowerCase() && (t.status === "In Progress" || t.status === "Pending"));

            if (activeTasks.length === 0) {
                showToast("No active running or pending tasks to set to pending.", "warning");
                return;
            }

            // Reset text input
            if (dependencyReasonInput) dependencyReasonInput.value = '';

            if (activeTasks.length === 1) {
                // Exactly one active task. Skip selection step, go straight to reason input
                selectedDependencyTaskId = activeTasks[0].id;
                selectedDependencyTaskDesc = activeTasks[0].description;
                
                if (dependencyStepSelect) dependencyStepSelect.classList.add('hidden');
                if (dependencyStepInput) {
                    dependencyStepInput.classList.remove('hidden');
                    dependencyTaskPreview.textContent = `Task: "${selectedDependencyTaskDesc}"`;
                }
            } else {
                // Multiple tasks. Show selection list step
                if (dependencyStepInput) dependencyStepInput.classList.add('hidden');
                if (dependencyStepSelect) {
                    dependencyStepSelect.classList.remove('hidden');
                    if (dependencyTasksList) {
                        dependencyTasksList.innerHTML = '';
                        activeTasks.forEach(task => {
                            const btn = document.createElement('button');
                            btn.className = 'finish-task-option-btn';
                            btn.type = 'button';
                            
                            const timeInfo = task.start_time ? `Started: ${task.start_time.split(' ')[1] || task.start_time}` : '';
                            btn.innerHTML = `
                                <span style="font-weight: 600; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px;">
                                    ${task.description}
                                </span>
                                <span class="task-time">${timeInfo}</span>
                            `;
                            
                            btn.addEventListener('click', () => {
                                selectedDependencyTaskId = task.id;
                                selectedDependencyTaskDesc = task.description;
                                dependencyStepSelect.classList.add('hidden');
                                dependencyStepInput.classList.remove('hidden');
                                dependencyTaskPreview.textContent = `Task: "${task.description}"`;
                                dependencyReasonInput.focus();
                            });
                            
                            dependencyTasksList.appendChild(btn);
                        });
                    }
                }
            }

            if (dependencyModal) dependencyModal.classList.remove('hidden');
        });
    }

    // Handle Dependency Wizard Submit
    if (btnSubmitDependency) {
        btnSubmitDependency.addEventListener('click', async () => {
            const reason = dependencyReasonInput.value.trim();
            if (!reason) {
                showToast("Please describe the dependency block.", "warning");
                dependencyReasonInput.focus();
                return;
            }

            if (!selectedDependencyTaskId) return;

            try {
                showToast("Setting task to pending for dependency...", "info");
                const response = await fetch(`${API_BASE}/tasks/${selectedDependencyTaskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: "Pending",
                        pending_reason: reason
                    })
                });

                const data = await response.json();

                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }

                if (response.ok) {
                    showToast(`Task ${selectedDependencyTaskId} is now set to Pending.`, "success");
                    closeDependencyModal();
                    fetchTasks();
                } else {
                    showToast(data.message || 'Failed to update task status.', 'error');
                }
            } catch (error) {
                console.error('Error updating dependency status:', error);
                showToast('Connection error updating task status.', 'error');
            }
        });
    }

    // Handle "Escalation" Button Click
    if (btnEscalateTask) {
        btnEscalateTask.addEventListener('click', () => {
            if (!currentUser) return;
            const owner = currentUser.name;

            // Find all active running or pending tasks of the user
            const activeTasks = allTasks.filter(t => t.owner.toLowerCase() === owner.toLowerCase() && (t.status === "In Progress" || t.status === "Pending"));

            if (activeTasks.length === 0) {
                showToast("No active running or pending tasks to escalate.", "warning");
                return;
            }

            // Populate the dropdown based on 4-level escalation hierarchy:
            // Col 1 (Moumita, Shuvo, Momin, Alamgir, Rana, Sajeeb, Ayan, Mobasshir, Ashik) -> Col 2 (Shakil, Raju, Sabuj, Minhaj)
            // Col 2 (Shakil, Raju, Sabuj, Minhaj) -> Col 3 (Badal, Arif)
            // Col 3 (Badal, Arif) -> Col 4 (Ujjal, Subrata)
            if (escalationRecipientSelect) {
                escalationRecipientSelect.innerHTML = '';
                
                const hierarchy = {
                    col1: ['Moumita', 'Shuvo', 'Momin', 'Alamgir', 'Rana', 'Sajeeb', 'Ayan', 'Mobasshir', 'Ashik'],
                    col2: ['Shakil', 'Raju', 'Sabuj', 'Minhaj'],
                    col3: ['Badal', 'Arif'],
                    col4: ['Ujjal', 'Subrata']
                };

                const ownerLower = owner.trim().toLowerCase();
                const isCol1 = hierarchy.col1.some(n => n.toLowerCase() === ownerLower);
                const isCol2 = hierarchy.col2.some(n => n.toLowerCase() === ownerLower);
                const isCol3 = hierarchy.col3.some(n => n.toLowerCase() === ownerLower);
                const isCol4 = hierarchy.col4.some(n => n.toLowerCase() === ownerLower);

                let targetList = [];
                if (isCol1) {
                    targetList = hierarchy.col2;
                } else if (isCol2) {
                    targetList = hierarchy.col3;
                } else if (isCol3) {
                    targetList = hierarchy.col4;
                } else if (isCol4) {
                    targetList = hierarchy.col4.filter(n => n.toLowerCase() !== ownerLower);
                } else {
                    // Fallback for Admin or unlisted user: Col 2, Col 3, Col 4
                    targetList = [...hierarchy.col2, ...hierarchy.col3, ...hierarchy.col4].filter(n => n.toLowerCase() !== ownerLower);
                }

                const sortedTargets = Array.from(new Set(targetList)).sort();

                if (sortedTargets.length === 0) {
                    showToast("No higher level available to escalate to.", "warning");
                    return;
                }

                sortedTargets.forEach(engName => {
                    const opt = document.createElement('option');
                    opt.value = engName;
                    opt.textContent = engName;
                    escalationRecipientSelect.appendChild(opt);
                });
            }

            // Reset text input
            if (escalationReasonInput) escalationReasonInput.value = '';

            if (activeTasks.length === 1) {
                // Exactly one active task. Skip selection step, go straight to reason/recipient input
                selectedEscalationTaskId = activeTasks[0].id;
                selectedEscalationTaskDesc = activeTasks[0].description;
                
                if (escalationStepSelect) escalationStepSelect.classList.add('hidden');
                if (escalationStepInput) {
                    escalationStepInput.classList.remove('hidden');
                    escalationTaskPreview.textContent = `Task: "${selectedEscalationTaskDesc}"`;
                }
            } else {
                // Multiple tasks. Show selection list step
                if (escalationStepInput) escalationStepInput.classList.add('hidden');
                if (escalationStepSelect) {
                    escalationStepSelect.classList.remove('hidden');
                    if (escalationTasksList) {
                        escalationTasksList.innerHTML = '';
                        activeTasks.forEach(task => {
                            const btn = document.createElement('button');
                            btn.className = 'finish-task-option-btn';
                            btn.type = 'button';
                            
                            const timeInfo = task.start_time ? `Started: ${task.start_time.split(' ')[1] || task.start_time}` : '';
                            btn.innerHTML = `
                                <span style="font-weight: 600; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px;">
                                    ${task.description}
                                </span>
                                <span class="task-time">${timeInfo}</span>
                            `;
                            
                            btn.addEventListener('click', () => {
                                selectedEscalationTaskId = task.id;
                                selectedEscalationTaskDesc = task.description;
                                escalationStepSelect.classList.add('hidden');
                                escalationStepInput.classList.remove('hidden');
                                escalationTaskPreview.textContent = `Task: "${task.description}"`;
                                if (escalationReasonInput) escalationReasonInput.focus();
                            });
                            
                            escalationTasksList.appendChild(btn);
                        });
                    }
                }
            }

            if (escalationModal) escalationModal.classList.remove('hidden');
        });
    }

    // Close buttons for Escalation Modal
    function closeEscalationModal() {
        if (escalationModal) escalationModal.classList.add('hidden');
        if (escalationStepSelect) escalationStepSelect.classList.add('hidden');
        if (escalationStepInput) escalationStepInput.classList.add('hidden');
        if (escalationReasonInput) escalationReasonInput.value = '';
        selectedEscalationTaskId = null;
        selectedEscalationTaskDesc = null;
    }

    document.querySelectorAll('.btn-close-esc').forEach(btn => {
        btn.addEventListener('click', closeEscalationModal);
    });

    if (escalationModal) {
        escalationModal.addEventListener('click', (e) => {
            if (e.target === escalationModal) {
                closeEscalationModal();
            }
        });
    }

    // Handle Escalation Modal Submit
    if (btnSubmitEscalation) {
        btnSubmitEscalation.addEventListener('click', async () => {
            const recipient = escalationRecipientSelect.value;
            const reason = escalationReasonInput.value.trim();
            
            if (!recipient) {
                showToast("Please select an engineer to escalate to.", "warning");
                return;
            }
            if (!reason) {
                showToast("Please describe the reason for escalation.", "warning");
                escalationReasonInput.focus();
                return;
            }

            if (!selectedEscalationTaskId) return;

            const task = allTasks.find(t => t.id === selectedEscalationTaskId);
            if (!task) return;

            // Generate escalation entry format
            const now = new Date();
            const dateStr = now.getFullYear() + '-' + 
                            String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                            String(now.getDate()).padStart(2, '0') + ' ' + 
                            String(now.getHours()).padStart(2, '0') + ':' + 
                            String(now.getMinutes()).padStart(2, '0');
            
            const logLine = `[Escalated by ${task.owner} to ${recipient} at ${dateStr}: ${reason}]`;
            const newEscalationHistory = task.escalation_history ? task.escalation_history + '\n' + logLine : logLine;

            try {
                showToast("Escalating task to " + recipient + "...", "info");
                const response = await fetch(`${API_BASE}/tasks/${selectedEscalationTaskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        owner: recipient,
                        status: "In Progress",  // Keep/make it active under new owner
                        pending_reason: "",     // Clear any pending reason if it was pending
                        escalation_history: newEscalationHistory
                    })
                });

                const data = await response.json();

                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }

                if (response.ok) {
                    showToast(`Task ${selectedEscalationTaskId} successfully escalated to ${recipient}.`, "success");
                    closeEscalationModal();
                    fetchTasks();
                } else {
                    showToast(data.message || 'Failed to escalate task.', 'error');
                }
            } catch (error) {
                console.error('Error escalating task:', error);
                showToast('Connection error during task escalation.', 'error');
            }
        });
    }

    // Save Roster Changes to Excel (Admin)
    if (btnSaveRosterChanges) {
        btnSaveRosterChanges.addEventListener('click', async () => {
            const container = document.getElementById('rosterTableContainer');
            if (!container) return;

            const selects = container.querySelectorAll('.roster-select');
            const updates = [];
            selects.forEach(sel => {
                updates.push({
                    owner: sel.getAttribute('data-owner'),
                    date: sel.getAttribute('data-date'),
                    code: sel.value
                });
            });

            if (updates.length === 0) {
                showToast("No roster entries found to save.", "warning");
                return;
            }

            try {
                showToast("Saving roster shifts to Excel...", "info");
                const response = await fetch(`${API_BASE}/roster/batch-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                const data = await response.json();

                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }

                if (response.ok) {
                    showToast("Roster shifts saved successfully to Excel.", "success");
                    
                    // Reset save button style (remove unsaved indicator)
                    btnSaveRosterChanges.style.border = '1px solid transparent';
                    btnSaveRosterChanges.style.boxShadow = '0 4px 10px rgba(16, 185, 129, 0.2)';
                    
                    // Re-fetch all data to ensure dashboard sidebar and views are synchronized
                    try {
                        const responseRoster = await fetch(`${API_BASE}/roster`);
                        if (responseRoster.ok) {
                            allRoster = await responseRoster.json();
                        }
                    } catch (rosterErr) {
                        console.error('Error fetching roster after batch update:', rosterErr);
                    }
                    
                    fetchTasks(); // Reloads dashboard and runs renderEngineersStatus
                    renderRosterGrid(); // Refresh grid view
                } else {
                    showToast(data.message || 'Failed to save roster shifts.', 'error');
                }
            } catch (error) {
                console.error('Error saving roster batch:', error);
                showToast('Connection error saving roster updates.', 'error');
            }
        });
    }

    // Handle Roster Excel Upload inside Roster Modal
    if (rosterModalUploadForm) {
        rosterModalUploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!rosterModalFileInput.files || rosterModalFileInput.files.length === 0) {
                showToast("Please select an Excel roster file first.", "warning");
                return;
            }

            const file = rosterModalFileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);

            try {
                showToast("Uploading and syncing roster file...", "info");
                const response = await fetch(`${API_BASE}/users/import`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }

                if (response.ok) {
                    let msg = `Roster Synced! Registered ${data.imported_count} new users`;
                    if (data.imported_shifts_count > 0) {
                        msg += ` and updated ${data.imported_shifts_count} scheduled duty shifts.`;
                    } else {
                        msg += `.`;
                    }
                    showToast(msg, 'success');
                    rosterModalUploadForm.reset();
                    
                    // Fetch updated roster
                    try {
                        const rosterResponse = await fetch(`${API_BASE}/roster`);
                        if (rosterResponse.ok) {
                            allRoster = await rosterResponse.json();
                            renderRosterGrid();
                        }
                    } catch (rosterErr) {
                        console.error('Error fetching roster after upload:', rosterErr);
                    }
                    
                    fetchUsers();
                    fetchTasks();
                } else {
                    showToast(data.message || 'Failed to import roster.', 'error');
                }
            } catch (error) {
                console.error('Error importing roster:', error);
                showToast('Connection error uploading roster spreadsheet.', 'error');
            }
        });
    }

    // Retrieve users list
    async function fetchUsers() {
        try {
            const usernameParam = currentUser ? encodeURIComponent(currentUser.username) : '';
            const response = await fetch(`${API_BASE}/users?username=${usernameParam}`);
            if (!response.ok) throw new Error('Failed to load users list.');
            const users = await response.json();
            
            adminUsersTableBody.innerHTML = '';
            users.forEach(user => {
                const tr = document.createElement('tr');
                
                // Don't show delete button for master admin
                const isMasterAdmin = user.username.toLowerCase() === 'admin';
                const actionBtn = isMasterAdmin ? 
                    `<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">Protected</span>` :
                    `<div style="display: flex; gap: 0.4rem; align-items: center;">
                        <button class="btn-user-reset-pass" title="Reset User Password" data-username="${user.username}" data-name="${user.name}" style="background: rgba(168, 85, 247, 0.1); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 4px; padding: 4px 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                            <i data-lucide="key" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn-user-delete" title="Delete User" data-username="${user.username}">
                            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                        </button>
                     </div>`;

                // Check reports console access status
                const isReportsAccess = user.reports_access === 'true';
                const reportsToggle = isMasterAdmin ?
                    `<span style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">Always</span>` :
                    `<input type="checkbox" class="chk-reports-access" data-username="${user.username}" ${isReportsAccess ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">`;

                // Check online status
                const statusBadge = user.is_online ?
                    `<span class="user-status-pill online"><span class="status-indicator-dot pulse"></span>Online</span>` :
                    `<span class="user-status-pill offline"><span class="status-indicator-dot"></span>Offline</span>`;

                tr.innerHTML = `
                    <td><strong>${user.username}</strong></td>
                    <td>${user.name}</td>
                    <td><span style="font-size: 0.75rem; text-transform: uppercase; color: ${user.role === 'admin' ? '#c084fc' : 'var(--text-muted)'}; font-weight: 600;">${user.role}</span></td>
                    <td>${reportsToggle}</td>
                    <td>${statusBadge}</td>
                    <td>${actionBtn}</td>
                `;
                adminUsersTableBody.appendChild(tr);
            });
            
            // Bind delete events
            document.querySelectorAll('.btn-user-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const username = e.currentTarget.getAttribute('data-username');
                    deleteUser(username);
                });
            });

            // Bind admin reset password events
            document.querySelectorAll('.btn-user-reset-pass').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const username = e.currentTarget.getAttribute('data-username');
                    const name = e.currentTarget.getAttribute('data-name');
                    const newPass = prompt(`Enter new password for ${name} (${username}):`);
                    if (!newPass || !newPass.trim()) return;
                    if (newPass.trim().length < 3) {
                        showToast('Password must be at least 3 characters.', 'error');
                        return;
                    }
                    try {
                        const response = await fetch(`${API_BASE}/admin/reset-password`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                admin_username: currentUser.username,
                                username: username,
                                new_password: newPass.trim()
                            })
                        });
                        const data = await response.json();
                        if (response.ok && data.success) {
                            showToast(`Password for ${name} has been reset successfully!`, 'success');
                        } else {
                            showToast(data.message || 'Failed to reset password.', 'error');
                        }
                    } catch (err) {
                        console.error('Error resetting password:', err);
                        showToast('Connection error resetting user password.', 'error');
                    }
                });
            });

            // Bind reports access toggle events
            document.querySelectorAll('.chk-reports-access').forEach(chk => {
                chk.addEventListener('change', async (e) => {
                    const username = e.target.getAttribute('data-username');
                    const isChecked = e.target.checked;
                    try {
                        const response = await fetch(`${API_BASE}/admin/toggle-reports-access`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username: username,
                                reports_access: isChecked ? 'true' : 'false'
                            })
                        });
                        const data = await response.json();
                        if (response.ok) {
                            showToast(`Reports access updated for "${username}".`, 'success');
                            fetchUsers();
                        } else {
                            showToast(data.message || 'Failed to update access.', 'error');
                            e.target.checked = !isChecked;
                        }
                    } catch (error) {
                        console.error('Error toggling reports access:', error);
                        showToast('Server error toggling reports access.', 'error');
                        e.target.checked = !isChecked;
                    }
                });
            });
            
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Error fetching users:', error);
            showToast('Failed to load registered users from Excel.', 'error');
        }
    }

    // Fetch and render shifts schedule mapping config
    async function fetchShifts() {
        if (!shiftsConfigContainer) return;
        try {
            const response = await fetch(`${API_BASE}/shifts`);
            if (!response.ok) throw new Error('Failed to load shifts list.');
            const shifts = await response.json();
            
            shiftsConfigContainer.innerHTML = '';
            
            // Sort keys to maintain a clean list order
            const sortedCodes = Object.keys(shifts).sort();
            sortedCodes.forEach(code => {
                const details = shifts[code];
                const row = document.createElement('div');
                row.className = 'shift-config-row';
                row.style.display = 'grid';
                row.style.gridTemplateColumns = '50px 1.2fr 1fr 1fr 20px';
                row.style.gap = '0.5rem';
                row.style.alignItems = 'center';
                row.style.background = 'rgba(30, 41, 59, 0.4)';
                row.style.padding = '0.4rem 0.5rem';
                row.style.borderRadius = 'var(--radius-sm)';
                row.style.border = '1px solid var(--border-color)';
                
                row.innerHTML = `
                    <span class="shift-code-span" style="font-weight: 700; color: #38bdf8; font-size: 0.85rem; text-align: center;">${code}</span>
                    <input type="text" class="shift-name-input" data-code="${code}" value="${details.name || ''}" placeholder="Shift Name" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                    <input type="time" class="shift-start-input" data-code="${code}" value="${details.start || ''}" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                    <input type="time" class="shift-end-input" data-code="${code}" value="${details.end || ''}" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                    <button type="button" class="btn-delete-shift" data-code="${code}" style="background: transparent; color: #ef4444; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0.8; transition: opacity 0.2s;">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                `;
                shiftsConfigContainer.appendChild(row);
            });
            
            // Bind delete event listeners
            shiftsConfigContainer.querySelectorAll('.btn-delete-shift').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const row = e.currentTarget.closest('.shift-config-row');
                    if (row) row.remove();
                });
                // Hover effect
                btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
                btn.addEventListener('mouseleave', () => btn.style.opacity = '0.8');
            });
            
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Error fetching shifts:', error);
            showToast('Failed to load roster shift configuration.', 'error');
        }
    }

    // Add shift row button click handler
    if (btnAddShiftRow) {
        btnAddShiftRow.addEventListener('click', () => {
            if (!shiftsConfigContainer) return;
            const row = document.createElement('div');
            row.className = 'shift-config-row new-shift-row';
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '50px 1.2fr 1fr 1fr 20px';
            row.style.gap = '0.5rem';
            row.style.alignItems = 'center';
            row.style.background = 'rgba(56, 189, 248, 0.05)';
            row.style.padding = '0.4rem 0.5rem';
            row.style.borderRadius = 'var(--radius-sm)';
            row.style.border = '1px dashed #38bdf8';
            
            row.innerHTML = `
                <input type="text" class="new-shift-code" placeholder="Code" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none; font-weight: 700; text-align: center; text-transform: uppercase;">
                <input type="text" class="new-shift-name" placeholder="Shift Name" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                <input type="time" class="new-shift-start" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                <input type="time" class="new-shift-end" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                <button type="button" class="btn-remove-new-row" style="background: transparent; color: #64748b; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">
                    <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                </button>
            `;
            shiftsConfigContainer.appendChild(row);
            
            // Bind remove listener for new row
            row.querySelector('.btn-remove-new-row').addEventListener('click', () => {
                row.remove();
            });
            
            if (window.lucide) window.lucide.createIcons();
            
            // Scroll container to bottom to show new row
            shiftsConfigContainer.scrollTop = shiftsConfigContainer.scrollHeight;
        });
    }

    // Save shift timings config click handler
    if (btnSaveShiftsConfig) {
        btnSaveShiftsConfig.addEventListener('click', async () => {
            if (!shiftsConfigContainer) return;
            const payload = {};
            let hasValidationErrors = false;
            
            // 1. Gather existing rows
            shiftsConfigContainer.querySelectorAll('.shift-config-row:not(.new-shift-row)').forEach(row => {
                const span = row.querySelector('.shift-code-span');
                if (!span) return;
                const code = span.textContent.trim().toUpperCase();
                const name = row.querySelector('.shift-name-input').value.trim();
                const start = row.querySelector('.shift-start-input').value;
                const end = row.querySelector('.shift-end-input').value;
                
                if (!name || !start || !end) {
                    hasValidationErrors = true;
                    return;
                }
                payload[code] = { name, start, end };
            });
            
            // 2. Gather new rows
            shiftsConfigContainer.querySelectorAll('.new-shift-row').forEach(row => {
                const codeInput = row.querySelector('.new-shift-code');
                const nameInput = row.querySelector('.new-shift-name');
                const startInput = row.querySelector('.new-shift-start');
                const endInput = row.querySelector('.new-shift-end');
                
                if (!codeInput || !nameInput || !startInput || !endInput) return;
                const code = codeInput.value.trim().toUpperCase();
                const name = nameInput.value.trim();
                const start = startInput.value;
                const end = endInput.value;
                
                if (!code || !name || !start || !end) {
                    hasValidationErrors = true;
                    return;
                }
                payload[code] = { name, start, end };
            });
            
            if (hasValidationErrors) {
                showToast("Please fill all fields for each shift configuration.", "warning");
                return;
            }
            
            try {
                showToast("Saving shift timings to Excel...", "info");
                const response = await fetch(`${API_BASE}/shifts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const data = await response.json();
                
                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }
                
                if (response.ok) {
                    showToast('Shift timings successfully saved and synced to Excel.', 'success');
                    fetchShifts();
                    // If roster grid view is open, refresh it
                    if (rosterModal && !rosterModal.classList.contains('hidden')) {
                        renderRosterGrid();
                    }
                } else {
                    throw new Error(data.message || 'Failed to save shifts.');
                }
            } catch (error) {
                console.error('Error saving shifts:', error);
                showToast('Error saving shift timings: ' + error.message, 'error');
            }
        });
    }

    // Render Quick Links on User Dashboard
    function renderQuickLinks() {
        if (!quickLinksContainer) return;
        quickLinksContainer.innerHTML = '';
        
        if (allQuickLinks.length === 0) {
            quickLinksContainer.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.8rem; padding: 0.5rem 0;">
                    No portal links configured.
                </div>
            `;
            return;
        }
        
        // Group links by category (delimited by ">")
        const groupedLinks = [];
        const categoriesMap = {};
        
        allQuickLinks.forEach(link => {
            if (link.name.includes('>')) {
                const parts = link.name.split('>');
                const category = parts[0].trim();
                const subName = parts[1].trim();
                
                if (!categoriesMap[category]) {
                    categoriesMap[category] = [];
                    groupedLinks.push({ isGroup: true, name: category, items: categoriesMap[category] });
                }
                categoriesMap[category].push({ name: subName, url: link.url });
            } else {
                groupedLinks.push({ isGroup: false, name: link.name, url: link.url });
            }
        });
        
        groupedLinks.forEach(item => {
            if (item.isGroup) {
                // Render category dropdown group
                const groupDiv = document.createElement('div');
                groupDiv.className = 'quick-link-group-container';
                groupDiv.style.position = 'relative';
                groupDiv.style.display = 'inline-block';
                
                const header = document.createElement('button');
                header.type = 'button';
                header.className = 'quick-link-btn';
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.gap = '0.35rem';
                header.style.padding = '0.4rem 0.75rem';
                header.style.borderRadius = 'var(--radius-sm)';
                header.style.fontSize = '0.8rem';
                header.style.fontWeight = '600';
                header.style.cursor = 'pointer';
                
                header.innerHTML = `
                    <i data-lucide="folder" style="width: 13px; height: 13px; color: #fbbf24;"></i>
                    <span>${item.name}</span>
                    <i class="group-chevron" data-lucide="chevron-down" style="width: 12px; height: 12px; color: var(--text-muted); transition: transform 0.2s;"></i>
                `;
                
                const subItemsDiv = document.createElement('div');
                subItemsDiv.className = 'quick-link-subitems';
                subItemsDiv.style.display = 'none'; // Initially hidden
                subItemsDiv.style.position = 'absolute';
                subItemsDiv.style.top = 'calc(100% + 5px)';
                subItemsDiv.style.left = '0';
                subItemsDiv.style.zIndex = '100';
                subItemsDiv.style.minWidth = '290px';
                subItemsDiv.style.maxWidth = '380px';
                subItemsDiv.style.background = 'var(--bg-header)'; // solid theme background
                subItemsDiv.style.border = '1px solid var(--border-color)';
                subItemsDiv.style.borderRadius = 'var(--radius-sm)';
                subItemsDiv.style.padding = '0.4rem';
                subItemsDiv.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
                subItemsDiv.style.flexDirection = 'column';
                subItemsDiv.style.gap = '0.25rem';
                
                item.items.forEach(sub => {
                    const subA = document.createElement('a');
                    subA.href = sub.url;
                    subA.target = '_blank';
                    subA.rel = 'noopener noreferrer';
                    subA.style.display = 'flex';
                    subA.style.alignItems = 'center';
                    subA.style.justifyContent = 'space-between';
                    subA.style.padding = '0.45rem 0.65rem';
                    subA.style.borderRadius = 'var(--radius-sm)';
                    subA.style.color = 'var(--text-main)';
                    subA.style.textDecoration = 'none';
                    subA.style.fontSize = '0.78rem';
                    subA.style.fontWeight = '500';
                    subA.style.transition = 'var(--transition-fast)';
                    
                    subA.innerHTML = `
                        <span style="display: inline-flex; align-items: center; gap: 0.45rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <i data-lucide="file-spreadsheet" style="width: 13px; height: 13px; color: #10b981; flex-shrink: 0;"></i>
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sub.name}</span>
                        </span>
                        <i data-lucide="external-link" style="width: 11px; height: 11px; opacity: 0.6; flex-shrink: 0; margin-left: 0.5rem;"></i>
                    `;
                    
                    subA.addEventListener('mouseenter', () => {
                        subA.style.background = 'rgba(56, 189, 248, 0.08)';
                        subA.style.color = '#38bdf8';
                    });
                    subA.addEventListener('mouseleave', () => {
                        subA.style.background = 'transparent';
                        subA.style.color = 'var(--text-main)';
                    });
                    subItemsDiv.appendChild(subA);
                });
                
                let autoCloseTimeout = null;

                function startAutoCloseTimer() {
                    if (autoCloseTimeout) clearTimeout(autoCloseTimeout);
                    autoCloseTimeout = setTimeout(() => {
                        subItemsDiv.style.display = 'none';
                        const chev = header.querySelector('.group-chevron');
                        if (chev) chev.style.transform = 'rotate(0deg)';
                        header.style.background = 'rgba(255, 255, 255, 0.03)';
                        header.style.borderColor = 'var(--border-color)';
                    }, 10000);
                }

                function stopAutoCloseTimer() {
                    if (autoCloseTimeout) clearTimeout(autoCloseTimeout);
                }

                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close other submenus
                    document.querySelectorAll('.quick-link-subitems').forEach(el => {
                        if (el !== subItemsDiv) {
                            el.style.display = 'none';
                            const pHeader = el.previousElementSibling;
                            if (pHeader) {
                                const pChevron = pHeader.querySelector('.group-chevron');
                                if (pChevron) pChevron.style.transform = 'rotate(0deg)';
                                pHeader.style.background = 'rgba(255, 255, 255, 0.03)';
                                pHeader.style.borderColor = 'var(--border-color)';
                            }
                        }
                    });

                    const isHidden = subItemsDiv.style.display === 'none';
                    if (isHidden) {
                        subItemsDiv.style.display = 'flex';
                        header.querySelector('.group-chevron').style.transform = 'rotate(180deg)';
                        header.style.background = 'rgba(255, 255, 255, 0.07)';
                        header.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                        startAutoCloseTimer();
                    } else {
                        subItemsDiv.style.display = 'none';
                        header.querySelector('.group-chevron').style.transform = 'rotate(0deg)';
                        header.style.background = 'rgba(255, 255, 255, 0.03)';
                        header.style.borderColor = 'var(--border-color)';
                        stopAutoCloseTimer();
                    }
                });

                // Keep open when hover on dropdown items, reset timer on leave
                subItemsDiv.addEventListener('mouseenter', () => {
                    stopAutoCloseTimer();
                });
                subItemsDiv.addEventListener('mouseleave', () => {
                    startAutoCloseTimer();
                });

                // Global click to close popovers
                document.addEventListener('click', () => {
                    subItemsDiv.style.display = 'none';
                    const chev = header.querySelector('.group-chevron');
                    if (chev) chev.style.transform = 'rotate(0deg)';
                    header.style.background = 'rgba(255, 255, 255, 0.03)';
                    header.style.borderColor = 'var(--border-color)';
                    stopAutoCloseTimer();
                });
                
                header.addEventListener('mouseenter', () => {
                    if (subItemsDiv.style.display === 'none') {
                        header.style.background = 'rgba(255, 255, 255, 0.05)';
                    }
                });
                header.addEventListener('mouseleave', () => {
                    if (subItemsDiv.style.display === 'none') {
                        header.style.background = 'rgba(255, 255, 255, 0.03)';
                    }
                });
                
                groupDiv.appendChild(header);
                groupDiv.appendChild(subItemsDiv);
                quickLinksContainer.appendChild(groupDiv);
            } else {
                // Render direct link item
                const a = document.createElement('a');
                a.href = item.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.className = 'quick-link-btn';
                a.style.display = 'flex';
                a.style.alignItems = 'center';
                a.style.gap = '0.35rem';
                a.style.padding = '0.4rem 0.75rem';
                a.style.borderRadius = 'var(--radius-sm)';
                a.style.textDecoration = 'none';
                a.style.fontSize = '0.8rem';
                a.style.fontWeight = '500';
                a.style.transition = 'var(--transition-fast)';
                
                a.addEventListener('mouseenter', () => {
                    a.style.background = 'rgba(56, 189, 248, 0.08)';
                    a.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                    a.style.transform = 'translateY(-1px)';
                });
                a.addEventListener('mouseleave', () => {
                    a.style.background = '';
                    a.style.borderColor = '';
                    a.style.transform = 'none';
                });
                
                a.innerHTML = `
                    <span style="width: 5px; height: 5px; background-color: #38bdf8; border-radius: 50%;"></span>
                    <span>${item.name}</span>
                `;
                quickLinksContainer.appendChild(a);
            }
        });
        
        if (window.lucide) window.lucide.createIcons();
    }

    // Render Quick Links config panel inside Admin Console
    function renderQuickLinksConfig() {
        if (!quickLinksConfigContainer) return;
        quickLinksConfigContainer.innerHTML = '';
        
        allQuickLinks.forEach((link, idx) => {
            const row = document.createElement('div');
            row.className = 'link-config-row';
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '1fr 2.5fr 20px';
            row.style.gap = '0.5rem';
            row.style.alignItems = 'center';
            row.style.background = 'rgba(30, 41, 59, 0.4)';
            row.style.padding = '0.4rem 0.5rem';
            row.style.borderRadius = 'var(--radius-sm)';
            row.style.border = '1px solid var(--border-color)';
            
            row.innerHTML = `
                <input type="text" class="link-name-input" value="${link.name}" placeholder="Name (e.g. IPAM)" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none; font-weight: 600;">
                <input type="url" class="link-url-input" value="${link.url}" placeholder="URL Link (http://...)" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                <button type="button" class="btn-delete-link" style="background: transparent; color: #ef4444; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0.8;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            `;
            quickLinksConfigContainer.appendChild(row);
        });
        
        // Bind delete listeners
        quickLinksConfigContainer.querySelectorAll('.btn-delete-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.currentTarget.closest('.link-config-row').remove();
            });
        });
        
        if (window.lucide) window.lucide.createIcons();
    }

    // Add Link Row click handler
    if (btnAddLinkRow) {
        btnAddLinkRow.addEventListener('click', () => {
            if (!quickLinksConfigContainer) return;
            const row = document.createElement('div');
            row.className = 'link-config-row new-link-row';
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '1fr 2.5fr 20px';
            row.style.gap = '0.5rem';
            row.style.alignItems = 'center';
            row.style.background = 'rgba(56, 189, 248, 0.05)';
            row.style.padding = '0.4rem 0.5rem';
            row.style.borderRadius = 'var(--radius-sm)';
            row.style.border = '1px dashed #38bdf8';
            
            row.innerHTML = `
                <input type="text" class="link-name-input" placeholder="Portal Name" style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none; font-weight: 600;">
                <input type="url" class="link-url-input" placeholder="http://..." style="padding: 0.35rem; font-size: 0.8rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); color: #f1f5f9; border-radius: var(--radius-sm); outline: none;">
                <button type="button" class="btn-remove-new-link" style="background: transparent; color: #64748b; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">
                    <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                </button>
            `;
            quickLinksConfigContainer.appendChild(row);
            
            row.querySelector('.btn-remove-new-link').addEventListener('click', () => {
                row.remove();
            });
            
            if (window.lucide) window.lucide.createIcons();
            quickLinksConfigContainer.scrollTop = quickLinksConfigContainer.scrollHeight;
        });
    }

    // Save Links config handler
    if (btnSaveLinksConfig) {
        btnSaveLinksConfig.addEventListener('click', async () => {
            if (!quickLinksConfigContainer) return;
            const links = [];
            let hasValidationErrors = false;
            
            quickLinksConfigContainer.querySelectorAll('.link-config-row').forEach(row => {
                const nameInput = row.querySelector('.link-name-input');
                const urlInput = row.querySelector('.link-url-input');
                if (!nameInput || !urlInput) return;
                
                const name = nameInput.value.trim();
                const url = urlInput.value.trim();
                
                if (!name || !url) {
                    hasValidationErrors = true;
                    return;
                }
                links.push({ name, url });
            });
            
            if (hasValidationErrors) {
                showToast("Please fill in both Name and URL for all link entries.", "warning");
                return;
            }
            
            try {
                showToast("Saving portal quick links to Excel...", "info");
                const response = await fetch(`${API_BASE}/quicklinks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ links })
                });
                
                const data = await response.json();
                
                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }
                
                if (response.ok) {
                    showToast('Quick links successfully saved and updated.', 'success');
                    allQuickLinks = links;
                    renderQuickLinks();
                    renderQuickLinksConfig();
                } else {
                    throw new Error(data.message || 'Failed to save quick links.');
                }
            } catch (error) {
                console.error('Error saving quick links:', error);
                showToast('Error saving quick links: ' + error.message, 'error');
            }
        });
    }

    // Create a new user ID (Admin)
    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = newUsernameInput.value.trim();
        const name = newFullNameInput.value.trim();
        const password = newPasswordInput.value;

        try {
            const response = await fetch(`${API_BASE}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, name, password })
            });
            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (response.ok) {
                showToast(`User ID "${username}" created successfully and saved in Excel database.`, 'success');
                createUserForm.reset();
                fetchUsers();
            } else {
                showToast(`Failed to create user: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            showToast('Server error creating user.', 'error');
        }
    });

    // Import Roster Spreadsheet (Admin)
    importRosterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!rosterFileInput.files || rosterFileInput.files.length === 0) {
            showToast("Please select an Excel roster file first.", "warning");
            return;
        }

        const file = rosterFileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);

        try {
            showToast("Uploading and syncing roster file...", "info");
            const response = await fetch(`${API_BASE}/users/import`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (response.ok) {
                let msg = `Roster Synced! Registered ${data.imported_count} new users`;
                if (data.imported_shifts_count > 0) {
                    msg += ` and added ${data.imported_shifts_count} scheduled duty shifts.`;
                } else {
                    msg += `.`;
                }
                showToast(msg, 'success');
                importRosterForm.reset();
                fetchUsers();
                fetchTasks();
            } else {
                showToast(data.message || 'Failed to import roster.', 'error');
            }
        } catch (error) {
            console.error('Error importing roster:', error);
            showToast('Connection error uploading roster spreadsheet.', 'error');
        }
    });

    // Delete a user ID (Admin)
    async function deleteUser(username) {
        if (!confirm(`Are you sure you want to delete user ID "${username}"? This will remove them from the Excel database.`)) return;

        try {
            const response = await fetch(`${API_BASE}/users/${username}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (response.ok) {
                showToast(`User "${username}" deleted successfully.`, 'info');
                fetchUsers();
            } else {
                showToast(`Failed to delete user: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showToast('Server error deleting user.', 'error');
        }
    }

    // Clear All Tasks Database Operation (Admin)
    btnClearAllTasks.addEventListener('click', async () => {
        if (!confirm("Are you sure you want to delete ALL tasks in the database? This will clear the entire Tasks sheet in Excel and cannot be undone.")) {
            return;
        }

        try {
            showToast("Clearing tasks database...", "info");
            const response = await fetch(`${API_BASE}/tasks`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (response.ok) {
                showToast("All tasks have been successfully cleared from Excel database.", "success");
                adminModal.classList.add('hidden');
                fetchTasks();
            } else {
                showToast(data.message || 'Failed to clear tasks.', 'error');
            }
        } catch (error) {
            console.error('Error clearing tasks:', error);
            showToast('Connection error clearing tasks database.', 'error');
        }
    });

    // --- Tasks Operations ---

    // Fetch quick links config from local server
    async function fetchQuickLinks() {
        if (!currentUser) return;
        try {
            const linksResponse = await fetch(`${API_BASE}/quicklinks`);
            if (linksResponse.ok) {
                allQuickLinks = await linksResponse.json();
                renderQuickLinks();
            }
        } catch (linksErr) {
            console.error('Error fetching quick links:', linksErr);
        }
    }

    // Fetch tasks from local server
    async function fetchTasks() {
        if (!currentUser) return;
        try {
            const usernameParam = currentUser ? encodeURIComponent(currentUser.username) : '';
            const response = await fetch(`${API_BASE}/dashboard-state?username=${usernameParam}`);
            if (!response.ok) throw new Error('Failed to fetch dashboard state');
            const data = await response.json();
            
            allTasks = data.tasks || [];
            allUsers = data.users || [];
            allRoster = data.roster || [];
            activeShifts = data.shifts || {};

            // Dynamically update logged in user reports access status from polling data
            if (currentUser && allUsers.length > 0) {
                const freshUser = allUsers.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
                if (freshUser) {
                    currentUser.reports_access = freshUser.reports_access;
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    
                    const btnReportsConsole = document.getElementById('btnReportsConsole');
                    if (btnReportsConsole) {
                        const hasReportsAccess = currentUser.role === 'admin' || currentUser.reports_access === 'true';
                        if (hasReportsAccess) {
                            btnReportsConsole.classList.remove('hidden');
                        } else {
                            btnReportsConsole.classList.add('hidden');
                        }
                    }
                }
            }

            // Smart change detection to avoid costly DOM re-renders if state hasn't changed
            const stateFingerprint = JSON.stringify({
                t: (data.tasks || []).map(x => `${x.id}:${x.status}:${x.last_updated}:${x.owner}`),
                u: (data.users || []).map(x => `${x.username}:${x.is_online}:${x.reports_access}`),
                rLen: (data.roster || []).length
            });
            const hasChanged = (window.__lastStateFingerprint !== stateFingerprint);
            window.__lastStateFingerprint = stateFingerprint;

            if (hasChanged) {
                updateDashboard();
            }
        } catch (error) {
            console.error('Error fetching tasks:', error);
            showToast('Could not load tasks. Ensure local backend is running.', 'error');
        }
    }

    // "Start" button action: Create In-Progress Task under logged in user
    btnStart.addEventListener('click', async () => {
        if (!currentUser) return;
        const desc = taskDescriptionInput.value.trim();
        const owner = currentUser.name;

        if (!desc) {
            showToast("Please enter the task details in the detail window first.", "warning");
            taskDescriptionInput.focus();
            return;
        }

        const payload = {
            description: desc,
            owner: owner,
            status: "In Progress"
        };

        try {
            const response = await fetch(`${API_BASE}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (!response.ok) throw new Error(data.message || 'Failed to start task');

            showToast(`Task ${data.id} started successfully under your name.`, 'success');
            taskDescriptionInput.value = ""; // Clear task details
            fetchTasks();
        } catch (error) {
            console.error('Error starting task:', error);
            showToast(`Error starting task: ${error.message}`, 'error');
        }
    });

    // Helper function to complete a specific task by ID
    async function completeSpecificTask(taskId, taskDesc) {
        try {
            showToast(`Completing task: "${taskDesc}"...`, 'info');
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: "Completed" })
            });

            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (!response.ok) throw new Error(data.message || 'Failed to complete task');

            showToast(`Task completed successfully! Duration: ${data.duration}`, 'success');
            taskDescriptionInput.value = ""; // Clear details input
            fetchTasks();
        } catch (error) {
            console.error('Error completing task:', error);
            showToast(`Error completing task: ${error.message}`, 'error');
        }
    }

    // "Finish" button action: Complete Active Task or Create Direct Completed Task
    btnFinish.addEventListener('click', async () => {
        if (!currentUser) return;
        const owner = currentUser.name;
        const desc = taskDescriptionInput.value.trim();

        // Get all active "In Progress" tasks for this user
        const activeTasks = allTasks.filter(t => t.owner.toLowerCase() === owner.toLowerCase() && t.status === "In Progress");

        if (activeTasks.length > 1) {
            // Multiple tasks running. Show choice modal!
            if (finishTasksList) {
                finishTasksList.innerHTML = '';
                activeTasks.forEach(task => {
                    const btn = document.createElement('button');
                    btn.className = 'finish-task-option-btn';
                    btn.type = 'button';
                    
                    const timeInfo = task.start_time ? `Started: ${task.start_time.split(' ')[1] || task.start_time}` : '';
                    btn.innerHTML = `
                        <span style="font-weight: 600; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px;">
                            ${task.description}
                        </span>
                        <span class="task-time">${timeInfo}</span>
                    `;
                    
                    btn.addEventListener('click', async () => {
                        finishTaskModal.classList.add('hidden');
                        await completeSpecificTask(task.id, task.description);
                    });
                    
                    finishTasksList.appendChild(btn);
                });
            }
            if (finishTaskModal) {
                finishTaskModal.classList.remove('hidden');
            }
        } else if (activeTasks.length === 1) {
            // Exactly one active task. Complete it directly!
            await completeSpecificTask(activeTasks[0].id, activeTasks[0].description);
        } else {
            // No active running task. Check if details are filled.
            if (!desc) {
                showToast(`No running task found under your name. Write details first to create a completed task.`, "warning");
                taskDescriptionInput.focus();
                return;
            }

            // Create a new Completed task directly
            try {
                const response = await fetch(`${API_BASE}/tasks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        description: desc,
                        owner: owner,
                        status: "Completed"
                    })
                });

                const data = await response.json();

                if (response.status === 423) {
                    showToast(data.message, 'warning');
                    return;
                }

                if (!response.ok) throw new Error(data.message || 'Failed to create completed task');

                showToast(`Direct completed task ${data.id} added.`, 'success');
                taskDescriptionInput.value = "";
                fetchTasks();
            } catch (error) {
                console.error('Error creating completed task:', error);
                showToast(`Error creating completed task: ${error.message}`, 'error');
            }
        }
    });

    // Update task details in Edit Modal
    editTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const taskId = editTaskIdInput.value;
        const payload = {
            description: editDescriptionInput.value,
            owner: editOwnerInput.value,
            start_time: editStartTimeInput.value,
            end_time: editEndTimeInput.value,
            status: editStatusSelect.value,
            pending_reason: editStatusSelect.value === 'Pending' ? editPendingReasonInput.value.trim() : '',
            escalation_history: editEscalationHistoryInput ? editEscalationHistoryInput.value.trim() : '',
            mis_status: editMisStatusSelect ? editMisStatusSelect.value : 'Not Closed'
        };

        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (!response.ok) throw new Error(data.message || 'Failed to update task');

            showToast(`Task ${taskId} details updated and saved to Excel.`, 'success');
            closeModal();
            fetchTasks();
        } catch (error) {
            console.error('Error updating task:', error);
            showToast(`Error updating task: ${error.message}`, 'error');
        }
    });

    // Delete a task (Grid/Table trigger)
    async function deleteTask(taskId) {
        if (!confirm(`Are you sure you want to delete task ${taskId}? This will remove it from Excel.`)) return;

        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (!response.ok) throw new Error(data.message || 'Failed to delete task');

            showToast(`Task ${taskId} deleted successfully.`, 'info');
            fetchTasks();
        } catch (error) {
            console.error('Error deleting task:', error);
            showToast(`Error deleting task: ${error.message}`, 'error');
        }
    }

    // Toggle task status quickly
    async function changeTaskStatus(taskId, newStatus) {
        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            const data = await response.json();

            if (response.status === 423) {
                showToast(data.message, 'warning');
                return;
            }

            if (!response.ok) throw new Error(data.message || 'Failed to transition status');

            showToast(`Task ${taskId} status changed to ${newStatus}.`, 'success');
            fetchTasks();
        } catch (error) {
            console.error('Error updating status:', error);
            showToast(`Error updating status: ${error.message}`, 'error');
        }
    }

    // Export database options (Admin Console)
    if (btnExportFull) {
        btnExportFull.addEventListener('click', () => {
            showToast('Downloading full Excel database...', 'info');
            window.location.href = `${API_BASE}/tasks/export`;
        });
    }

    if (btnExportDateWise) {
        btnExportDateWise.addEventListener('click', () => {
            const startDate = document.getElementById('exportStartDate').value;
            const endDate = document.getElementById('exportEndDate').value;

            if (!startDate && !endDate) {
                showToast('Please select at least one date filter.', 'warning');
                return;
            }

            showToast('Generating date-wise Excel report...', 'info');
            window.location.href = `${API_BASE}/tasks/export?start_date=${startDate}&end_date=${endDate}`;
        });
    }

    // --- UI Layout & Rendering ---

    function populateUserFilter() {
        if (!filterUserSelect) return;
        
        const engineersSet = new Set();
        allUsers.forEach(u => {
            if (u.name && u.username.toLowerCase() !== 'admin') {
                engineersSet.add(u.name.trim());
            }
        });

        allTasks.forEach(t => {
            if (t.owner && t.owner.trim() !== '' && t.owner.toLowerCase() !== 'unassigned') {
                engineersSet.add(t.owner.trim());
            }
        });

        const sortedEngineers = Array.from(engineersSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        const existingOptions = Array.from(filterUserSelect.options).map(o => o.value);
        const newOptions = ['ALL', ...sortedEngineers];
        
        const isSame = existingOptions.length === newOptions.length &&
            existingOptions.every((val, idx) => val === newOptions[idx]);

        if (!isSame) {
            const savedVal = filterUserSelect.value || selectedUserFilter;
            filterUserSelect.innerHTML = '<option value="ALL">All Engineers</option>';
            sortedEngineers.forEach(eng => {
                const opt = document.createElement('option');
                opt.value = eng;
                opt.textContent = eng;
                filterUserSelect.appendChild(opt);
            });
            if (sortedEngineers.includes(savedVal)) {
                filterUserSelect.value = savedVal;
                selectedUserFilter = savedVal;
            } else {
                filterUserSelect.value = 'ALL';
                selectedUserFilter = 'ALL';
            }
        }
    }

    function updateDashboard() {
        const total = allTasks.length;
        const pending = allTasks.filter(t => t.status === 'Pending').length;
        const progress = allTasks.filter(t => t.status === 'In Progress').length;
        const completed = allTasks.filter(t => t.status === 'Completed').length;

        // Render metrics
        metricTotal.textContent = total;
        metricPending.textContent = pending;
        metricProgress.textContent = progress;
        metricCompleted.textContent = completed;

        // Filter search results
        let filteredTasks = allTasks;

        if (selectedStatusFilter !== 'ALL') {
            filteredTasks = filteredTasks.filter(t => t.status === selectedStatusFilter);
        }

        if (selectedScopeFilter === 'OWN' && currentUser) {
            const owner = currentUser.name.toLowerCase();
            filteredTasks = filteredTasks.filter(t => t.owner.toLowerCase() === owner);
        }

        // Admin User-Wise Filter
        if (currentUser && currentUser.role === 'admin' && selectedUserFilter !== 'ALL') {
            const targetUser = selectedUserFilter.toLowerCase();
            filteredTasks = filteredTasks.filter(t => (t.owner || '').trim().toLowerCase() === targetUser);
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredTasks = filteredTasks.filter(t => 
                t.description.toLowerCase().includes(query) || 
                t.owner.toLowerCase().includes(query) ||
                t.id.toLowerCase().includes(query)
            );
        }

        // Admin Multi-Criteria Sorting
        if (currentUser && currentUser.role === 'admin') {
            filteredTasks = [...filteredTasks];
            if (selectedSort === 'USER_ASC') {
                filteredTasks.sort((a, b) => (a.owner || '').localeCompare(b.owner || '', undefined, { sensitivity: 'base' }));
            } else if (selectedSort === 'USER_DESC') {
                filteredTasks.sort((a, b) => (b.owner || '').localeCompare(a.owner || '', undefined, { sensitivity: 'base' }));
            } else if (selectedSort === 'TIME_DESC') {
                filteredTasks.sort((a, b) => (b.start_time || b.last_updated || '').localeCompare(a.start_time || a.last_updated || ''));
            } else if (selectedSort === 'TIME_ASC') {
                filteredTasks.sort((a, b) => (a.start_time || a.last_updated || '').localeCompare(b.start_time || b.last_updated || ''));
            } else if (selectedSort === 'STATUS') {
                const statusOrder = { 'in progress': 1, 'pending': 2, 'completed': 3 };
                filteredTasks.sort((a, b) => {
                    const oA = statusOrder[(a.status || '').toLowerCase()] || 4;
                    const oB = statusOrder[(b.status || '').toLowerCase()] || 4;
                    return oA - oB;
                });
            }
        }

        // Update Owner Column Sort Indicator in Table Header
        if (ownerSortIndicator) {
            if (selectedSort === 'USER_ASC') {
                ownerSortIndicator.textContent = '▲';
                ownerSortIndicator.style.opacity = '1';
                ownerSortIndicator.style.color = '#38bdf8';
            } else if (selectedSort === 'USER_DESC') {
                ownerSortIndicator.textContent = '▼';
                ownerSortIndicator.style.opacity = '1';
                ownerSortIndicator.style.color = '#38bdf8';
            } else {
                ownerSortIndicator.textContent = '↕';
                ownerSortIndicator.style.opacity = '0.5';
                ownerSortIndicator.style.color = 'inherit';
            }
        }

        if (filteredTasks.length === 0) {
            emptyState.classList.remove('hidden');
            tasksGrid.classList.add('hidden');
            tasksTableContainer.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            if (currentView === 'grid') {
                tasksGrid.classList.remove('hidden');
                tasksTableContainer.classList.add('hidden');
                renderGridView(filteredTasks);
            } else {
                tasksGrid.classList.add('hidden');
                tasksTableContainer.classList.remove('hidden');
                renderTableView(filteredTasks);
            }
        }

        // Render On-Duty status panel
        renderEngineersStatus();

        // Update workload chart
        if (currentUser) {
            updateWorkloadChart();
        }
    }

    let workloadChartInstance = null;
    let lastChartFingerprint = "";

    function updateWorkloadChart() {
        const ctx = document.getElementById('workloadChart');
        if (!ctx) return;

        const isLight = document.body.classList.contains('light-theme');
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // Robust helper to match engineer and date in roster
        function findRosterShift(rosterList, ownerName, targetDateStr) {
            if (!rosterList || !ownerName || !targetDateStr) return null;
            const cleanOwner = ownerName.trim().toLowerCase().replace(/sh/g, 's');
            const origOwner = ownerName.trim().toLowerCase();
            const cleanDate = targetDateStr.trim();
            
            return rosterList.find(r => {
                if (!r || !r.owner || !r.date) return false;
                const rOwner = String(r.owner).trim().toLowerCase();
                const rOwnerNorm = rOwner.replace(/sh/g, 's');
                const nameMatch = (rOwner === origOwner || rOwnerNorm === cleanOwner || cleanOwner.includes(rOwnerNorm) || rOwnerNorm.includes(cleanOwner));
                if (!nameMatch) return false;
                
                let rDate = String(r.date).trim();
                if (rDate.includes('T')) rDate = rDate.split('T')[0];
                if (rDate.includes(' ')) rDate = rDate.split(' ')[0];
                return rDate === cleanDate;
            });
        }

        const fingerprint = JSON.stringify({
            tasks: allTasks.map(t => ({ id: t.id, owner: t.owner, status: t.status })),
            roster: allRoster.map(r => ({ owner: r.owner, date: r.date, code: r.code })),
            isLight: isLight,
            today: todayStr
        });

        if (fingerprint === lastChartFingerprint && workloadChartInstance) {
            return;
        }
        lastChartFingerprint = fingerprint;

        // Group tasks by owner
        const ownersMap = {};
        allTasks.forEach(task => {
            const owner = task.owner ? task.owner.trim() : 'Unassigned';
            if (owner.toLowerCase() === 'system administrator') return;
            
            if (!ownersMap[owner]) {
                ownersMap[owner] = { pending: 0, progress: 0, completed: 0, total: 0 };
            }
            
            const status = task.status;
            if (status === 'Pending') ownersMap[owner].pending++;
            else if (status === 'In Progress') ownersMap[owner].progress++;
            else if (status === 'Completed') ownersMap[owner].completed++;
            ownersMap[owner].total++;
        });

        // Add all registered active engineers from allUsers so everyone appears on the chart
        allUsers.forEach(u => {
            if (!u || !u.name) return;
            const uName = u.name.trim();
            if (uName.toLowerCase() === 'admin' || uName.toLowerCase() === 'system administrator') return;
            if (!ownersMap[uName]) {
                ownersMap[uName] = { pending: 0, progress: 0, completed: 0, total: 0 };
            }
        });

        // Add all on-shift / on-duty engineers from allRoster who don't have tasks
        const rosterOwners = [...new Set(allRoster.map(r => r.owner))];
        rosterOwners.forEach(owner => {
            const trimmedOwner = owner ? owner.trim() : '';
            if (!trimmedOwner || trimmedOwner.toLowerCase() === 'system administrator') return;
            if (!ownersMap[trimmedOwner]) {
                ownersMap[trimmedOwner] = { pending: 0, progress: 0, completed: 0, total: 0 };
            }
        });

        const sortedOwners = Object.keys(ownersMap).sort();
        
        const labels = sortedOwners;
        const pendingData = sortedOwners.map(o => ownersMap[o].pending);
        const progressData = sortedOwners.map(o => ownersMap[o].progress);
        const completedData = sortedOwners.map(o => ownersMap[o].completed);
        const totalData = sortedOwners.map(o => ownersMap[o].total);

        // Dynamic theme configurations for chart text and grid lines
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)';
        const textColor = isLight ? '#475569' : '#94a3b8';
        const legendColor = isLight ? '#0f172a' : '#f1f5f9';

        // Destroy previous instance to clean redraws
        if (workloadChartInstance) {
            workloadChartInstance.destroy();
        }

        workloadChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'In Progress',
                        data: progressData,
                        backgroundColor: '#3b82f6',
                        borderColor: '#2563eb',
                        borderWidth: 1,
                        barPercentage: 0.85,
                        categoryPercentage: 0.9
                    },
                    {
                        label: 'Pending',
                        data: pendingData,
                        backgroundColor: '#f59e0b',
                        borderColor: '#d97706',
                        borderWidth: 1,
                        barPercentage: 0.85,
                        categoryPercentage: 0.9
                    },
                    {
                        label: 'Completed',
                        data: completedData,
                        backgroundColor: '#10b981',
                        borderColor: '#059669',
                        borderWidth: 1,
                        barPercentage: 0.85,
                        categoryPercentage: 0.9
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Outfit', size: 10 } }
                    },
                    y: {
                        stacked: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Outfit', size: 10 }, stepSize: 1 },
                        suggestedMax: 5
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: legendColor, font: { family: 'Outfit', size: 10 } }
                    },
                    tooltip: {
                        titleFont: { family: 'Outfit', size: 11 },
                        bodyFont: { family: 'Outfit', size: 10 }
                    }
                }
            },
            plugins: [{
                id: 'offDutyPlugin',
                beforeDraw(chart) {
                    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
                    ctx.save();
                    
                    const hasRosterToday = allRoster && allRoster.some(r => {
                        let rDate = String(r.date || '').trim().split('T')[0].split(' ')[0];
                        return rDate === todayStr;
                    });
                    
                    sortedOwners.forEach((owner, idx) => {
                        const shift = findRosterShift(allRoster, owner, todayStr);
                        const isOff = shift ? (
                            shift.code.toUpperCase() === 'D/O' || 
                            shift.code.toUpperCase() === 'DO' || 
                            shift.code.toUpperCase() === 'LEAVE' ||
                            shift.code.toUpperCase() === 'HOLIDAY' ||
                            shift.code.toUpperCase() === 'OFF' ||
                            (shift.shift_name && shift.shift_name.toLowerCase().includes('day off')) ||
                            (shift.shift_name && shift.shift_name.toLowerCase().includes('duty off')) ||
                            (shift.shift_name && shift.shift_name.toLowerCase().includes('holiday'))
                        ) : (hasRosterToday && !shift);
                        if (isOff) {
                            let xPos = x.getPixelForTick ? x.getPixelForTick(idx) : x.getPixelForValue(idx);
                            if (isNaN(xPos) || xPos === undefined) xPos = x.getPixelForValue(owner);
                            const barWidth = Math.max(20, (x.width / sortedOwners.length) * 0.75);
                            
                            // Draw a distinct semi-transparent gray block for this column
                            ctx.fillStyle = isLight ? 'rgba(148, 163, 184, 0.16)' : 'rgba(255, 255, 255, 0.06)';
                            ctx.strokeStyle = isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(255, 255, 255, 0.12)';
                            ctx.lineWidth = 1;
                            
                            const rectX = xPos - barWidth / 2;
                            const rectHeight = bottom - top;
                            
                            ctx.fillRect(rectX, top + 4, barWidth, rectHeight - 8);
                            ctx.strokeRect(rectX, top + 4, barWidth, rectHeight - 8);
                        }
                    });
                    ctx.restore();
                },
                afterDatasetsDraw(chart) {
                    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
                    ctx.save();
                    
                    const hasRosterToday = allRoster && allRoster.some(r => {
                        let rDate = String(r.date || '').trim().split('T')[0].split(' ')[0];
                        return rDate === todayStr;
                    });
                    
                    sortedOwners.forEach((owner, idx) => {
                        const shift = findRosterShift(allRoster, owner, todayStr);
                        const isOff = shift ? (
                            shift.code.toUpperCase() === 'D/O' || 
                            shift.code.toUpperCase() === 'DO' || 
                            shift.code.toUpperCase() === 'LEAVE' ||
                            shift.code.toUpperCase() === 'HOLIDAY' ||
                            shift.code.toUpperCase() === 'OFF' ||
                            (shift.shift_name && shift.shift_name.toLowerCase().includes('day off')) ||
                            (shift.shift_name && shift.shift_name.toLowerCase().includes('duty off')) ||
                            (shift.shift_name && shift.shift_name.toLowerCase().includes('holiday'))
                        ) : (hasRosterToday && !shift);
                        if (isOff) {
                            let xPos = x.getPixelForTick ? x.getPixelForTick(idx) : x.getPixelForValue(idx);
                            if (isNaN(xPos) || xPos === undefined) xPos = x.getPixelForValue(owner);
                            const rectHeight = bottom - top;
                            
                            // Draw text "DAY OFF", "LEAVE", or "HOLIDAY" with vertically stacked letters on top of bars
                            ctx.fillStyle = isLight ? '#0f172a' : '#38bdf8';
                            ctx.font = "bold 10px Outfit, sans-serif";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            
                            const isLeave = shift && shift.code && shift.code.toUpperCase() === 'LEAVE';
                            const isHoliday = shift && shift.code && (shift.code.toUpperCase() === 'HOLIDAY' || (shift.shift_name && shift.shift_name.toLowerCase().includes('holiday')));
                            const label = isHoliday ? 'HOLIDAY' : (isLeave ? 'LEAVE' : 'DAY OFF');
                            const chars = label.split('');
                            const charHeight = 12; // vertical gap
                            const totalHeight = chars.length * charHeight;
                            const startY = top + (rectHeight - totalHeight) / 2 + charHeight / 2;
                            
                            chars.forEach((char, charIdx) => {
                                ctx.fillText(char, xPos, startY + (charIdx * charHeight));
                            });
                        }
                    });
                    ctx.restore();
                }
            }]
        });
    }

    function renderEngineersStatus() {
        const engineersList = document.getElementById('engineersList');
        if (!engineersList) return;
        
        engineersList.innerHTML = '';
        
        // Get today's date in YYYY-MM-DD format
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // Helper to check if current time is within shift timings
        function isCurrentTimeInShift(startTimeStr, endTimeStr) {
            if (!startTimeStr || !endTimeStr) return false;
            
            const currentHour = now.getHours();
            const currentMin = now.getMinutes();
            const currentTimeVal = currentHour * 60 + currentMin; // minutes since midnight
            
            function parseTimeToMinutes(timeStr) {
                const parts = timeStr.trim().split(':');
                if (parts.length < 2) return 0;
                const hr = parseInt(parts[0], 10);
                const min = parseInt(parts[1], 10);
                return hr * 60 + min;
            }
            
            const startVal = parseTimeToMinutes(startTimeStr);
            const endVal = parseTimeToMinutes(endTimeStr);
            
            if (startVal <= endVal) {
                return currentTimeVal >= startVal && currentTimeVal <= endVal;
            } else {
                // Shift spans midnight (e.g. 16:00 to 00:00 or similar)
                return currentTimeVal >= startVal || currentTimeVal <= endVal;
            }
        }

        // 1. Unify engineer names case-insensitively
        const nameMap = new Map(); // lowercase -> preferred name
        
        if (allRoster) {
            allRoster.forEach(r => {
                if (!r || !r.owner || !r.date) return;
                let rDate = String(r.date).trim();
                if (rDate.includes('T')) rDate = rDate.split('T')[0];
                if (rDate.includes(' ')) rDate = rDate.split(' ')[0];
                if (rDate === todayStr) {
                    const trimmed = r.owner.trim();
                    nameMap.set(trimmed.toLowerCase(), trimmed);
                }
            });
        }

        const activeRegistered = allUsers.filter(u => u.username.toLowerCase() !== 'admin');
        activeRegistered.forEach(u => {
            if (u.name) {
                const trimmed = u.name.trim();
                nameMap.set(trimmed.toLowerCase(), trimmed);
            }
        });

        const listToRender = [];

        nameMap.forEach((displayName, lowercaseName) => {
            if (lowercaseName === 'system administrator') return;

            // Find their shift in the roster for today using flexible name match
            const shift = (function() {
                if (!allRoster) return null;
                const normName = lowercaseName.replace(/sh/g, 's');
                return allRoster.find(r => {
                    if (!r || !r.owner || !r.date) return false;
                    const rOwner = String(r.owner).trim().toLowerCase();
                    const rOwnerNorm = rOwner.replace(/sh/g, 's');
                    const nameMatch = (rOwner === lowercaseName || rOwnerNorm === normName || normName.includes(rOwnerNorm) || rOwnerNorm.includes(normName));
                    if (!nameMatch) return false;
                    let rDate = String(r.date).trim();
                    if (rDate.includes('T')) rDate = rDate.split('T')[0];
                    if (rDate.includes(' ')) rDate = rDate.split(' ')[0];
                    return rDate === todayStr;
                });
            })();

            // Check if they are scheduled on roster shift today (not D/O or LEAVE)
            const hasRosterToday = allRoster && allRoster.some(r => {
                let rDate = String(r.date || '').trim().split('T')[0].split(' ')[0];
                return rDate === todayStr;
            });
            const isOff = shift ? (
                shift.code.toUpperCase() === 'D/O' || 
                shift.code.toUpperCase() === 'DO' || 
                shift.code.toUpperCase() === 'LEAVE' || 
                shift.code.toUpperCase() === 'HOLIDAY' || 
                shift.code.toUpperCase() === 'OFF' ||
                (shift.shift_name && shift.shift_name.toLowerCase().includes('day off')) ||
                (shift.shift_name && shift.shift_name.toLowerCase().includes('duty off')) ||
                (shift.shift_name && shift.shift_name.toLowerCase().includes('holiday'))
            ) : (hasRosterToday && !shift);
            const isOnDutyRoster = !!shift && !isOff;

            // Get shift timings
            let startTime = shift ? (shift.start_time || '') : '';
            let endTime = shift ? (shift.end_time || '') : '';

            // If timing is empty but code is present, fallback to activeShifts config
            if (shift && (!startTime || !endTime) && shift.code) {
                const codeUpper = shift.code.toUpperCase();
                const matchedConfig = activeShifts[codeUpper];
                if (matchedConfig) {
                    startTime = matchedConfig.start;
                    endTime = matchedConfig.end;
                }
            }

            const isCurrentlyOnShift = isCurrentTimeInShift(startTime, endTime);
            const isOnDutyNow = isOnDutyRoster && isCurrentlyOnShift;

            // STRICTLY ignore they are not currently scheduled for duty now
            if (!isOnDutyNow) return;

            // Find their registered user record to get online status
            const userRecord = activeRegistered.find(u => {
                const uName = u.name.trim().toLowerCase();
                return uName === lowercaseName || u.username.toLowerCase() === lowercaseName;
            });

            const isOnline = userRecord ? !!userRecord.is_online : false;

            // Check if they have an active task in progress
            const activeTask = allTasks.find(t => 
                t.owner.toLowerCase() === lowercaseName && 
                t.status === 'In Progress'
            );
            const isBusy = !!activeTask;

            if (isBusy) {
                listToRender.push({
                    name: displayName,
                    color: '#ef4444', // Red (Busy)
                    statusClass: 'busy',
                    tooltip: `${displayName} is Busy: ${activeTask.description}`
                });
            } else {
                if (isOnline) {
                    listToRender.push({
                        name: displayName,
                        color: '#10b981', // Green (Available)
                        statusClass: 'online',
                        tooltip: `${displayName} is On Duty & Online`
                    });
                } else {
                    listToRender.push({
                        name: displayName,
                        color: '#eab308', // Yellow (Offline)
                        statusClass: 'offline',
                        tooltip: `${displayName} is On Duty (Offline)`
                    });
                }
            }
        });

        if (listToRender.length === 0) {
            engineersList.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1.5rem 0; grid-column: 1 / -1; line-height: 1.4;">
                    No scheduled duty engineers active at this time.
                </div>
            `;
            return;
        }

        listToRender.forEach(item => {
            const row = document.createElement('div');
            row.className = `engineer-row-compact status-${item.statusClass}`;
            row.setAttribute('title', item.tooltip);
            
            row.innerHTML = `
                <span class="engineer-name-compact">${item.name}</span>
                <span class="status-indicator-dot pulse" style="color: ${item.color};"></span>
            `;
            
            engineersList.appendChild(row);
        });
    }

    function renderRosterGrid() {
        const container = document.getElementById('rosterTableContainer');
        if (!container) return;
        
        if (allRoster.length === 0) {
            container.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.95rem; text-align: center; padding: 3rem 0;">
                    No roster schedule uploaded yet. ${currentUser && currentUser.role === 'admin' ? 'Please upload a roster Excel file above.' : ''}
                </div>
            `;
            return;
        }
        
        // Find if user is admin
        const isAdmin = currentUser && currentUser.role === 'admin';
        
        // Get unique sorted dates
        const dates = [...new Set(allRoster.map(r => r.date))].sort();
        
        // Get unique operators
        const operators = [...new Set(allRoster.map(r => r.owner))].sort();
        
        let html = `
            <table class="roster-grid-table">
                <thead>
                    <tr>
                        <th>Engineer</th>
        `;
        
        // Add dates headers
        dates.forEach(d => {
            const dateObj = new Date(d);
            const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            html += `<th>${formattedDate}</th>`;
        });
        
        html += `
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Add rows for each operator
        operators.forEach(op => {
            html += `<tr><td><strong>${op}</strong></td>`;
            
            dates.forEach(d => {
                // Find shift code for this operator on this date
                const shift = allRoster.find(r => {
                    if (!r || !r.owner || !r.date) return false;
                    const rOwner = r.owner.toLowerCase();
                    const rOwnerNorm = rOwner.replace(/sh/g, 's');
                    const normOp = op.toLowerCase().replace(/sh/g, 's');
                    const matchName = (rOwner === op.toLowerCase() || rOwnerNorm === normOp || normOp.includes(rOwnerNorm) || rOwnerNorm.includes(normOp));
                    return matchName && r.date === d;
                });
                
                // Helper function to resolve shift badges and select style classes dynamically
                function getRosterClass(c) {
                    const codeUpper = c.toUpperCase();
                    if (codeUpper === 'D/O') return 'shift-do';
                    if (codeUpper === 'LEAVE') return 'shift-leave';
                    if (codeUpper === 'HOLIDAY') return 'shift-holiday';
                    return 'shift-' + codeUpper.toLowerCase();
                }

                if (isAdmin) {
                    const code = shift ? shift.code.toUpperCase() : 'D/O';
                    const selectClass = 'roster-select-badge ' + getRosterClass(code);
                    
                    // Generate options dynamically
                    let optionsHtml = '';
                    const sortedShiftCodes = Object.keys(activeShifts).sort();
                    sortedShiftCodes.forEach(sc => {
                        optionsHtml += `<option value="${sc}" ${code === sc ? 'selected' : ''}>${sc}</option>`;
                    });
                    // Fallbacks
                    if (!sortedShiftCodes.includes('M')) optionsHtml += `<option value="M" ${code === 'M' ? 'selected' : ''}>M</option>`;
                    if (!sortedShiftCodes.includes('EE')) optionsHtml += `<option value="EE" ${code === 'EE' ? 'selected' : ''}>EE</option>`;
                    if (!sortedShiftCodes.includes('E')) optionsHtml += `<option value="E" ${code === 'E' ? 'selected' : ''}>E</option>`;
                    if (!sortedShiftCodes.includes('LE')) optionsHtml += `<option value="LE" ${code === 'LE' ? 'selected' : ''}>LE</option>`;
                    
                    optionsHtml += `<option value="D/O" ${code === 'D/O' ? 'selected' : ''}>D/O</option>`;
                    optionsHtml += `<option value="LEAVE" ${code === 'LEAVE' ? 'selected' : ''}>LEAVE</option>`;
                    optionsHtml += `<option value="HOLIDAY" ${code === 'HOLIDAY' ? 'selected' : ''}>HOLIDAY</option>`;
                    
                    const selectHtml = `
                        <select class="roster-select ${selectClass}" data-owner="${op}" data-date="${d}">
                            ${optionsHtml}
                        </select>
                    `;
                    html += `<td>${selectHtml}</td>`;
                } else {
                    let badgeHtml = '';
                    if (shift) {
                        const code = shift.code.toUpperCase();
                        const badgeClass = getRosterClass(code);
                        const hoverText = (shift.start_time && shift.end_time) ? `${shift.shift_name} (${shift.start_time} - ${shift.end_time})` : shift.shift_name;
                        badgeHtml = `<span class="roster-badge ${badgeClass}" title="${hoverText}">${code}</span>`;
                    } else {
                        badgeHtml = `<span class="roster-badge shift-do" title="Day Off">D/O</span>`;
                    }
                    html += `<td>${badgeHtml}</td>`;
                }
            });
            
            html += `</tr>`;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        
        // Attach change listeners to selects for live admin roster modification
        if (isAdmin) {
            container.querySelectorAll('.roster-select').forEach(select => {
                select.addEventListener('change', (e) => {
                    const selectEl = e.target;
                    const code = selectEl.value;
                    
                    // Update style classes locally
                    selectEl.className = 'roster-select';
                    selectEl.classList.add('roster-select-badge');
                    
                    // Helper function repeated inside listener scope
                    function getRosterClassLocal(c) {
                        const codeUpper = c.toUpperCase();
                        if (codeUpper === 'D/O') return 'shift-do';
                        if (codeUpper === 'LEAVE') return 'shift-leave';
                        if (codeUpper === 'HOLIDAY') return 'shift-holiday';
                        return 'shift-' + codeUpper.toLowerCase();
                    }
                    selectEl.classList.add(getRosterClassLocal(code));
                    
                    // Highlight the Save button to remind user to save changes
                    if (btnSaveRosterChanges) {
                        btnSaveRosterChanges.style.border = '2px solid #eab308';
                        btnSaveRosterChanges.style.boxShadow = '0 0 15px rgba(234, 179, 8, 0.5)';
                    }
                });
            });
        }
    }

    function convertToInputFormat(datetimeStr) {
        if (!datetimeStr) return '';
        return datetimeStr.trim().replace(' ', 'T');
    }

    function extractReference(description) {
        if (!description) return '';
        const regex = /\b(CR|TKI|L3)\s*[-_]?\s*\d[a-z0-9-_]*/i;
        const match = description.match(regex);
        if (match) {
            return match[0].toUpperCase().replace(/\s+/g, '');
        }
        return '';
    }

    function formatDateTimeMultiLine(dtStr) {
        if (!dtStr || dtStr === '—' || dtStr.trim() === '') {
            return '<span style="color: var(--text-muted); font-style: italic;">—</span>';
        }
        try {
            const parts = dtStr.trim().split(' ');
            if (parts.length < 2) {
                return dtStr;
            }
            const datePart = parts[0];
            const timePart = parts[1];
            
            const timeSubParts = timePart.split(':');
            if (timeSubParts.length < 2) {
                return dtStr;
            }
            let hours = parseInt(timeSubParts[0], 10);
            const minutes = timeSubParts[1];
            
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const hourStr = String(hours).padStart(2, '0');
            const time12 = `${hourStr}:${minutes} ${ampm}`;
            
            return `<div style="font-weight: 500; white-space: nowrap;">${datePart}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem; font-weight: 400; white-space: nowrap;">${time12}</div>`;
        } catch (e) {
            return dtStr;
        }
    }

    function formatDateTimeCompact(dtStr) {
        if (!dtStr || dtStr === '—' || dtStr.trim() === '') {
            return '<span style="color: var(--text-muted); font-style: italic;">—</span>';
        }
        try {
            const parts = dtStr.trim().split(' ');
            if (parts.length < 2) return dtStr;
            const datePart = parts[0];
            const timePart = parts[1];
            const timeSubParts = timePart.split(':');
            if (timeSubParts.length < 2) return dtStr;
            let hours = parseInt(timeSubParts[0], 10);
            const minutes = timeSubParts[1];
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const hourStr = String(hours).padStart(2, '0');
            return `<span style="font-weight: 500; white-space: nowrap;">${datePart}</span> <span style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;">${hourStr}:${minutes} ${ampm}</span>`;
        } catch (e) {
            return dtStr;
        }
    }

    // Calculate Duration in Minutes and Detect > 1 Hour Threshold
    function getTaskDurationInfo(task) {
        let minutes = 0;
        let text = task.duration || '';

        // 1. Calculate from start_time and end_time (or now if actively running)
        if (task.start_time) {
            try {
                const startClean = task.start_time.trim().replace(' ', 'T');
                const startDate = new Date(startClean);
                if (!isNaN(startDate.getTime())) {
                    let endDate = null;
                    if (task.end_time && task.end_time.trim() !== '') {
                        const endClean = task.end_time.trim().replace(' ', 'T');
                        endDate = new Date(endClean);
                    } else if (task.status !== 'Completed') {
                        endDate = new Date(); // Currently in progress
                    }

                    if (endDate && !isNaN(endDate.getTime())) {
                        const diffMs = endDate.getTime() - startDate.getTime();
                        if (diffMs > 0) {
                            minutes = Math.floor(diffMs / (1000 * 60));
                        }
                    }
                }
            } catch (e) {}
        }

        // 2. Fallback: parse string if minutes still 0 and task.duration exists
        if (minutes === 0 && task.duration) {
            const durStr = String(task.duration).trim().toLowerCase();
            if (durStr !== 'invalid range' && durStr !== '—') {
                const dayMatch = durStr.match(/(\d+)\s*d/);
                const hourMatch = durStr.match(/(\d+)\s*h/);
                const minMatch = durStr.match(/(\d+)\s*m/);
                if (dayMatch) minutes += parseInt(dayMatch[1], 10) * 1440;
                if (hourMatch) minutes += parseInt(hourMatch[1], 10) * 60;
                if (minMatch) minutes += parseInt(minMatch[1], 10);
            }
        }

        // If text is empty or dash (e.g. running task), generate human-readable elapsed text
        if (!text || text === '—') {
            if (minutes > 0) {
                const days = Math.floor(minutes / 1440);
                const hours = Math.floor((minutes % 1440) / 60);
                const mins = minutes % 60;
                const parts = [];
                if (days > 0) parts.push(`${days}d`);
                if (hours > 0) parts.push(`${hours}h`);
                parts.push(`${mins}m`);
                text = parts.join(' ');
            } else {
                text = '—';
            }
        }

        const isOverOneHour = minutes >= 60;
        return { minutes, text, isOverOneHour };
    }

    // Render Grid View Cards
    function renderGridView(tasks) {
        tasksGrid.innerHTML = '';
        tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = `task-card ${task.status.toLowerCase().replace(' ', '-')}`;
            
            const durInfo = getTaskDurationInfo(task);
            if (durInfo.isOverOneHour) {
                card.classList.add('task-red-flag-card');
            }

            const redFlagHeaderBadge = durInfo.isOverOneHour ? `
                <span class="card-red-flag-badge" title="Task duration exceeded 1 hour (${durInfo.text})">
                    <i data-lucide="flag"></i> >1h
                </span>
            ` : '<span></span>';

            const durationHtml = durInfo.text !== '—' ? `
                <div class="meta-item">
                    <span class="meta-label">Duration</span>
                    <span class="meta-value" style="font-weight: 600;">
                        ${durInfo.isOverOneHour ? `
                            <span class="duration-red-flag" title="Task duration exceeded 1 hour!"><i data-lucide="flag"></i>${durInfo.text}</span>
                        ` : `
                            <span style="color: #38bdf8;"><i data-lucide="hourglass"></i>${durInfo.text}</span>
                        `}
                    </span>
                </div>
            ` : '';
            const refCode = extractReference(task.description);
            const refHtml = refCode ? `
                <div class="meta-item">
                    <span class="meta-label">Reference</span>
                    <span class="meta-value" style="color: #0284c7; font-weight: 600;"><i data-lucide="tag"></i>${refCode}</span>
                </div>
            ` : '';

            // Calculate Category dynamically
            let category = '—';
            const descLower = task.description.toLowerCase();
            if (descLower.includes('meeting')) {
                category = 'MEETING';
            } else if (refCode && (refCode.startsWith('TKI') || refCode.startsWith('CR'))) {
                category = 'IMPLEMENTATION';
            } else if (descLower.includes('backbone')) {
                category = 'BACKBONE';
            } else if (descLower.includes('project')) {
                category = 'PROJECT';
            }

            const categoryColor = category === 'IMPLEMENTATION' ? '#38bdf8' : (category === 'BACKBONE' ? '#fb7185' : (category === 'PROJECT' ? '#a78bfa' : (category === 'MEETING' ? '#f59e0b' : '#94a3b8')));
            const categoryHtml = category !== '—' ? `
                <div class="meta-item">
                    <span class="meta-label">Category</span>
                    <span class="meta-value" style="color: ${categoryColor}; font-weight: 600;"><i data-lucide="layers"></i>${category}</span>
                </div>
            ` : '';
            let pendingReasonHtml = '';
            if (task.pending_reason) {
                const fullReason = task.pending_reason;
                const truncatedReason = fullReason.length > 20 ? fullReason.substring(0, 20) + '...' : fullReason;
                pendingReasonHtml = `
                    <div class="meta-item" title="${fullReason.replace(/"/g, '&quot;')}" style="grid-column: 1 / -1; background: rgba(234, 179, 8, 0.05); padding: 0.5rem; border-left: 2px solid #eab308; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; margin-top: 0.25rem; cursor: help;">
                        <span class="meta-label" style="color: #eab308; display: block; margin-bottom: 0.15rem;">Dependency</span>
                        <span class="meta-value" style="color: #f1f5f9; word-break: break-word; font-size: 0.78rem; font-weight: 500; display: inline-flex; align-items: center; gap: 0.25rem;"><i data-lucide="alert-circle" style="color: #eab308; width: 13px; height: 13px;"></i>${truncatedReason}</span>
                    </div>
                `;
            }

            let escalationCardHtml = '';
            if (task.escalation_history) {
                const fullEsc = task.escalation_history;
                const singleLineEsc = fullEsc.replace(/\n/g, ' ');
                const truncatedEsc = singleLineEsc.length > 20 ? singleLineEsc.substring(0, 20) + '...' : singleLineEsc;
                escalationCardHtml = `
                    <div class="meta-item" title="${fullEsc.replace(/"/g, '&quot;')}" style="grid-column: 1 / -1; background: rgba(129, 140, 248, 0.05); padding: 0.5rem; border-left: 2px solid #818cf8; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; margin-top: 0.25rem; cursor: help;">
                        <span class="meta-label" style="color: #818cf8; display: block; margin-bottom: 0.15rem;">Escalation Log</span>
                        <span class="meta-value" style="color: #f1f5f9; word-break: break-word; font-size: 0.78rem; font-weight: 500; display: inline-flex; align-items: center; gap: 0.25rem;"><i data-lucide="trending-up" style="color: #818cf8; width: 13px; height: 13px;"></i>${truncatedEsc}</span>
                    </div>
                `;
            }

            // User can edit/delete their own task, or if they are admin, they can edit/delete anything.
            const canManage = currentUser.role === 'admin' || task.owner === currentUser.name;

            let actionButtons = `
                <button class="action-btn btn-detail" title="View Console Details" data-id="${task.id}">
                    <i data-lucide="terminal"></i>
                </button>
            `;
            if (task.status === 'Pending' && canManage) {
                actionButtons += `
                    <button class="action-btn btn-start" title="Start Task" data-id="${task.id}">
                        <i data-lucide="play"></i>
                    </button>
                `;
            }
            if (task.status !== 'Completed' && canManage) {
                actionButtons += `
                    <button class="action-btn btn-complete" title="Mark Completed" data-id="${task.id}">
                        <i data-lucide="check"></i>
                    </button>
                `;
            }
            if (canManage) {
                actionButtons += `
                    <button class="action-btn btn-edit" title="Edit Task" data-id="${task.id}">
                        <i data-lucide="edit-3"></i>
                    </button>
                `;
                // Only admin can delete tasks
                if (currentUser.role === 'admin') {
                    actionButtons += `
                        <button class="action-btn btn-delete" title="Delete Task" data-id="${task.id}">
                            <i data-lucide="trash-2"></i>
                        </button>
                    `;
                }
            }

            card.innerHTML = `
                <div class="task-card-header">
                    ${redFlagHeaderBadge}
                    <span class="status-badge ${task.status.toLowerCase().replace(' ', '-')}">
                        <span class="badge-dot"></span>
                        ${task.status}
                    </span>
                </div>
                <div class="task-description">${task.description}</div>
                <div class="task-meta-grid">
                    <div class="meta-item">
                        <span class="meta-label">Owner</span>
                        <span class="meta-value"><i data-lucide="user"></i>${task.owner}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Updated</span>
                        <span class="meta-value"><i data-lucide="calendar"></i>${task.last_updated.split(' ')[0]}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Start Time</span>
                        <span class="meta-value" title="${startDisplay}"><i data-lucide="clock"></i>${startDisplay}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">End Time</span>
                        <span class="meta-value" title="${endDisplay}"><i data-lucide="flag"></i>${endDisplay}</span>
                    </div>
                    ${refHtml}
                    ${categoryHtml}
                    ${durationHtml}
                    ${pendingReasonHtml}
                    ${escalationCardHtml}
                </div>
                <div class="task-actions">
                    ${actionButtons}
                </div>
            `;
            
            tasksGrid.appendChild(card);
        });

        addTaskCardActionListeners();
        if (window.lucide) window.lucide.createIcons();
    }

    // Render Table View Rows
    function renderTableView(tasks) {
        tasksTableBody.innerHTML = '';
        
        // Append existing tasks
        tasks.forEach(task => {
            const tr = document.createElement('tr');
            const durInfo = getTaskDurationInfo(task);
            if (durInfo.isOverOneHour) {
                tr.classList.add('task-red-flag-row');
            }
            
            const startDisplay = formatDateTimeMultiLine(task.start_time);
            const endDisplay = formatDateTimeMultiLine(task.end_time);
            const durationDisplay = durInfo.text;
            
            let statusClass = task.status.toLowerCase().replace(' ', '-');

            const canManage = currentUser.role === 'admin' || task.owner === currentUser.name;

            let actionButtons = `
                <button class="action-btn btn-detail" title="View Console Details" data-id="${task.id}">
                    <i data-lucide="terminal" style="width: 14px; height: 14px;"></i>
                </button>
            `;
            if (canManage) {
                if (task.status === 'Pending') {
                    actionButtons += `
                        <button class="action-btn btn-start" title="Start Task" data-id="${task.id}">
                            <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                        </button>
                    `;
                }
                if (task.status !== 'Completed') {
                    actionButtons += `
                        <button class="action-btn btn-complete" title="Complete Task" data-id="${task.id}">
                            <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                        </button>
                    `;
                }
                actionButtons += `
                    <button class="action-btn btn-edit" title="Edit Task" data-id="${task.id}">
                        <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="action-btn btn-delete" title="Delete Task" data-id="${task.id}">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                `;

            }

            const refCode = extractReference(task.description);
            const refDisplay = refCode ? `<span style="font-weight: 600; color: #0284c7; background: rgba(14, 165, 233, 0.12); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem;"><i data-lucide="tag" style="width: 11px; height: 11px; display: inline-block; margin-right: 0.15rem; vertical-align: middle;"></i>${refCode}</span>` : '<span style="color: var(--text-muted); font-style: italic;">—</span>';

            // Calculate Category dynamically
            let category = '—';
            const descLower = task.description.toLowerCase();
            if (descLower.includes('meeting')) {
                category = 'MEETING';
            } else if (refCode && (refCode.startsWith('TKI') || refCode.startsWith('CR'))) {
                category = 'IMPLEMENTATION';
            } else if (descLower.includes('backbone')) {
                category = 'BACKBONE';
            } else if (descLower.includes('project')) {
                category = 'PROJECT';
            }

            let categoryDisplay = '<span style="color: var(--text-muted); font-style: italic;">—</span>';
            if (category !== '—') {
                const isLight = document.body.classList.contains('light-theme');
                let badgeColor = isLight ? '#475569' : '#94a3b8'; // Default slate gray
                let bgOpacity = isLight ? 'rgba(71, 85, 105, 0.08)' : 'rgba(148, 163, 184, 0.1)';
                let borderOpacity = isLight ? 'rgba(71, 85, 105, 0.2)' : 'rgba(148, 163, 184, 0.2)';
                
                if (category === 'IMPLEMENTATION') {
                    badgeColor = isLight ? '#0284c7' : '#38bdf8'; // Sky Blue
                    bgOpacity = isLight ? 'rgba(2, 132, 199, 0.08)' : 'rgba(56, 189, 248, 0.1)';
                    borderOpacity = isLight ? 'rgba(2, 132, 199, 0.2)' : 'rgba(56, 189, 248, 0.25)';
                } else if (category === 'BACKBONE') {
                    badgeColor = isLight ? '#e11d48' : '#fb7185'; // Rose Red
                    bgOpacity = isLight ? 'rgba(225, 29, 72, 0.08)' : 'rgba(251, 113, 133, 0.1)';
                    borderOpacity = isLight ? 'rgba(225, 29, 72, 0.2)' : 'rgba(251, 113, 133, 0.25)';
                } else if (category === 'PROJECT') {
                    badgeColor = isLight ? '#7c3aed' : '#a78bfa'; // Violet/Purple
                    bgOpacity = isLight ? 'rgba(124, 58, 237, 0.08)' : 'rgba(167, 139, 250, 0.1)';
                    borderOpacity = isLight ? 'rgba(124, 58, 237, 0.2)' : 'rgba(167, 139, 250, 0.25)';
                } else if (category === 'MEETING') {
                    badgeColor = isLight ? '#d97706' : '#f59e0b'; // Amber Gold
                    bgOpacity = isLight ? 'rgba(217, 119, 6, 0.08)' : 'rgba(245, 158, 11, 0.1)';
                    borderOpacity = isLight ? 'rgba(217, 119, 6, 0.2)' : 'rgba(245, 158, 11, 0.25)';
                }
                
                categoryDisplay = `<span style="font-weight: 600; color: ${badgeColor}; background: ${bgOpacity}; border: 1px solid ${borderOpacity}; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.72rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i data-lucide="layers" style="width: 11px; height: 11px;"></i>${category}</span>`;
            }

            // Stylize the forwarded_by text if present
            let forwardedDisplay = '<span style="color: var(--text-muted); font-style: italic;">—</span>';
            if (task.forwarded_by) {
                const isLight = document.body.classList.contains('light-theme');
                
                // Determine a nice color based on the department
                let badgeColor = isLight ? '#2563eb' : '#60a5fa'; // Default blue
                let bgOpacity = isLight ? 'rgba(37, 99, 235, 0.08)' : 'rgba(96, 165, 250, 0.1)';
                let borderOpacity = isLight ? 'rgba(37, 99, 235, 0.2)' : 'rgba(96, 165, 250, 0.2)';
                
                const fLower = task.forwarded_by.toLowerCase();
                
                if (fLower.includes('ncss')) {
                    badgeColor = isLight ? '#7c3aed' : '#c084fc'; // Purple
                    bgOpacity = isLight ? 'rgba(124, 58, 237, 0.08)' : 'rgba(168, 85, 247, 0.1)';
                    borderOpacity = isLight ? 'rgba(124, 58, 237, 0.2)' : 'rgba(168, 85, 247, 0.2)';
                } else if (fLower.includes('bnoc')) {
                    badgeColor = isLight ? '#059669' : '#34d399'; // Emerald Green
                    bgOpacity = isLight ? 'rgba(5, 150, 105, 0.08)' : 'rgba(52, 211, 153, 0.1)';
                    borderOpacity = isLight ? 'rgba(5, 150, 105, 0.2)' : 'rgba(52, 211, 153, 0.2)';
                } else if (fLower.includes('sat')) {
                    badgeColor = isLight ? '#ea580c' : '#fb923c'; // Orange
                    bgOpacity = isLight ? 'rgba(234, 88, 12, 0.08)' : 'rgba(251, 146, 60, 0.1)';
                    borderOpacity = isLight ? 'rgba(234, 88, 12, 0.2)' : 'rgba(251, 146, 60, 0.2)';
                } else if (fLower.includes('sales')) {
                    badgeColor = isLight ? '#db2777' : '#f472b6'; // Pink
                    bgOpacity = isLight ? 'rgba(219, 39, 119, 0.08)' : 'rgba(244, 114, 182, 0.1)';
                    borderOpacity = isLight ? 'rgba(219, 39, 119, 0.2)' : 'rgba(244, 114, 182, 0.2)';
                } else if (fLower.includes('nmc')) {
                    badgeColor = isLight ? '#0891b2' : '#22d3ee'; // Cyan
                    bgOpacity = isLight ? 'rgba(8, 145, 178, 0.08)' : 'rgba(34, 211, 238, 0.1)';
                    borderOpacity = isLight ? 'rgba(8, 145, 178, 0.2)' : 'rgba(34, 211, 238, 0.2)';
                } else if (fLower.includes('backbone')) {
                    badgeColor = isLight ? '#e11d48' : '#fb7185'; // Rose
                    bgOpacity = isLight ? 'rgba(225, 29, 72, 0.08)' : 'rgba(251, 113, 133, 0.1)';
                    borderOpacity = isLight ? 'rgba(225, 29, 72, 0.2)' : 'rgba(251, 113, 133, 0.2)';
                } else if (fLower.includes('ini')) {
                    badgeColor = isLight ? '#4f46e5' : '#818cf8'; // Indigo
                    bgOpacity = isLight ? 'rgba(79, 70, 229, 0.08)' : 'rgba(129, 140, 248, 0.1)';
                    borderOpacity = isLight ? 'rgba(79, 70, 229, 0.2)' : 'rgba(129, 140, 248, 0.2)';
                } else if (fLower.includes('ngnc')) {
                    badgeColor = isLight ? '#b45309' : '#fbbf24'; // Amber
                    bgOpacity = isLight ? 'rgba(180, 83, 9, 0.08)' : 'rgba(251, 191, 36, 0.1)';
                    borderOpacity = isLight ? 'rgba(180, 83, 9, 0.2)' : 'rgba(251, 191, 36, 0.2)';
                } else if (fLower.includes('system team')) {
                    badgeColor = isLight ? '#0d9488' : '#2dd4bf'; // Teal
                    bgOpacity = isLight ? 'rgba(13, 148, 136, 0.08)' : 'rgba(45, 212, 191, 0.1)';
                    borderOpacity = isLight ? 'rgba(13, 148, 136, 0.2)' : 'rgba(45, 212, 191, 0.2)';
                } else if (fLower.includes('power team')) {
                    badgeColor = isLight ? '#dc2626' : '#f87171'; // Red
                    bgOpacity = isLight ? 'rgba(220, 38, 38, 0.08)' : 'rgba(248, 113, 113, 0.1)';
                    borderOpacity = isLight ? 'rgba(220, 38, 38, 0.2)' : 'rgba(248, 113, 113, 0.2)';
                } else if (fLower.includes('project')) {
                    badgeColor = isLight ? '#9333ea' : '#c084fc'; // Purple
                    bgOpacity = isLight ? 'rgba(147, 51, 234, 0.08)' : 'rgba(192, 132, 252, 0.1)';
                    borderOpacity = isLight ? 'rgba(147, 51, 234, 0.2)' : 'rgba(192, 132, 252, 0.2)';
                }
                
                forwardedDisplay = `<span style="font-weight: 600; color: ${badgeColor}; background: ${bgOpacity}; border: 1px solid ${borderOpacity}; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.25rem;"><i data-lucide="forward" style="width: 12px; height: 12px;"></i>${task.forwarded_by}</span>`;
            }

            const startDisplayCompact = formatDateTimeCompact(task.start_time);
            const endDisplayCompact = formatDateTimeCompact(task.end_time);

            // Construct compact badges for metadata in the main column
            let badgesList = [];
            if (refCode) {
                badgesList.push(`<span class="task-meta-tag tag-ref" title="Reference Code: ${refCode}"><i data-lucide="tag" style="width: 10px; height: 10px;"></i>${refCode}</span>`);
            }
            if (category !== '—') {
                badgesList.push(categoryDisplay);
            }
            if (task.forwarded_by) {
                badgesList.push(forwardedDisplay);
            }
            if (task.pending_reason) {
                const fullReason = task.pending_reason;
                const truncatedReason = fullReason.length > 25 ? fullReason.substring(0, 25) + '...' : fullReason;
                badgesList.push(`<span class="task-meta-tag tag-pending" title="Pending Reason: ${fullReason.replace(/"/g, '&quot;')}"><i data-lucide="alert-circle" style="width: 11px; height: 11px;"></i>${truncatedReason}</span>`);
            }
            if (task.escalation_history) {
                const fullEsc = task.escalation_history;
                const singleLineEsc = fullEsc.replace(/\n/g, ' ');
                const truncatedEsc = singleLineEsc.length > 25 ? singleLineEsc.substring(0, 25) + '...' : singleLineEsc;
                badgesList.push(`<span class="task-meta-tag tag-escalation" title="Escalation: ${fullEsc.replace(/"/g, '&quot;')}"><i data-lucide="trending-up" style="width: 11px; height: 11px;"></i>${truncatedEsc}</span>`);
            }

            const badgesHtml = badgesList.length > 0 
                ? `<div class="task-table-badges">${badgesList.join('')}</div>`
                : '';

            // Construct Timeline HTML
            const timelineHtml = `
                <div class="task-timeline-cell">
                    <div class="timeline-row">
                        <span class="timeline-label">Start:</span>
                        <span class="timeline-val">${startDisplayCompact}</span>
                    </div>
                    ${task.end_time ? `
                    <div class="timeline-row">
                        <span class="timeline-label">End:</span>
                        <span class="timeline-val">${endDisplayCompact}</span>
                    </div>
                    ` : ''}
                    ${durInfo.text !== '—' ? `
                    <div class="timeline-duration">
                        ${durInfo.isOverOneHour ? `
                            <span class="duration-red-flag" title="Task duration has exceeded 1 hour!">
                                <i data-lucide="flag"></i>${durationDisplay}
                            </span>
                        ` : `
                            <span class="duration-badge-compact" title="Task Duration">
                                <i data-lucide="clock" style="width: 10px; height: 10px;"></i>${durationDisplay}
                            </span>
                        `}
                    </div>
                    ` : ''}
                </div>
            `;

            tr.innerHTML = `
                <td class="col-task-desc">
                    <div class="task-desc-text">${task.description}</div>
                    ${badgesHtml}
                </td>
                <td class="col-task-owner">
                    <div class="task-owner-pill">
                        <i data-lucide="user" style="width: 12px; height: 12px; color: #38bdf8;"></i>
                        <span>${task.owner}</span>
                    </div>
                </td>
                <td class="col-task-timeline">
                    ${timelineHtml}
                </td>
                <td class="col-task-status">
                    <span class="status-badge ${statusClass}">
                        <span class="badge-dot"></span>
                        ${task.status}
                    </span>
                </td>
                <td class="col-task-actions">
                    <div class="task-actions-row">
                        ${actionButtons}
                    </div>
                </td>
            `;

            tasksTableBody.appendChild(tr);
        });

        addTaskCardActionListeners();
        if (window.lucide) window.lucide.createIcons();
    }

    function addTaskCardActionListeners() {
        document.querySelectorAll('.btn-start').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.currentTarget.getAttribute('data-id');
                changeTaskStatus(taskId, 'In Progress');
            });
        });

        document.querySelectorAll('.btn-complete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.currentTarget.getAttribute('data-id');
                changeTaskStatus(taskId, 'Completed');
            });
        });

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.currentTarget.getAttribute('data-id');
                openEditModal(taskId);
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.currentTarget.getAttribute('data-id');
                deleteTask(taskId);
            });
        });

        document.querySelectorAll('.btn-detail').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.currentTarget.getAttribute('data-id');
                openDetailModal(taskId);
            });
        });
    }

    // --- Search & Filters Event Listeners ---

    searchQueryInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        updateDashboard();
    });

    filterStatusSelect.addEventListener('change', (e) => {
        selectedStatusFilter = e.target.value;
        updateDashboard();
    });

    if (filterScopeSelect) {
        filterScopeSelect.addEventListener('change', (e) => {
            selectedScopeFilter = e.target.value;
            updateDashboard();
        });
    }

    if (filterUserSelect) {
        filterUserSelect.addEventListener('change', (e) => {
            selectedUserFilter = e.target.value;
            updateDashboard();
        });
    }

    if (sortTasksSelect) {
        sortTasksSelect.addEventListener('change', (e) => {
            selectedSort = e.target.value;
            updateDashboard();
        });
    }

    if (thOwner) {
        thOwner.addEventListener('click', () => {
            if (!currentUser || currentUser.role !== 'admin') return;
            if (selectedSort === 'USER_ASC') {
                selectedSort = 'USER_DESC';
            } else {
                selectedSort = 'USER_ASC';
            }
            if (sortTasksSelect) {
                sortTasksSelect.value = selectedSort;
            }
            updateDashboard();
        });
    }

    viewGridBtn.addEventListener('click', () => {
        currentView = 'grid';
        viewGridBtn.classList.add('active');
        viewTableBtn.classList.remove('active');
        updateDashboard();
    });

    viewTableBtn.addEventListener('click', () => {
        currentView = 'table';
        viewTableBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        updateDashboard();
    });

    if (editStatusSelect) {
        editStatusSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Pending') {
                editPendingReasonGroup.classList.remove('hidden');
            } else {
                editPendingReasonGroup.classList.add('hidden');
            }
        });
    }

    // --- Task Detail Modal Handlers ---
    function openDetailModal(taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        terminalTimestamp.textContent = new Date().toLocaleString();
        detailTaskId.textContent = task.id;
        detailDescription.textContent = task.description;
        const ref = extractReference(task.description);
        detailReference.textContent = ref || 'N/A';
        
        let cat = 'N/A';
        const descLower = task.description.toLowerCase();
        if (descLower.includes('meeting')) {
            cat = 'MEETING';
        } else if (ref && (ref.startsWith('TKI') || ref.startsWith('CR'))) {
            cat = 'IMPLEMENTATION';
        } else if (descLower.includes('backbone')) {
            cat = 'BACKBONE';
        } else if (descLower.includes('project')) {
            cat = 'PROJECT';
        }
        detailCategory.textContent = cat;
        detailOwner.textContent = task.owner;
        detailStatus.textContent = task.status;
        detailAssignedTime.textContent = task.assigned_time || 'N/A';
        detailStartTime.textContent = task.start_time || 'N/A';
        detailEndTime.textContent = task.end_time || 'N/A';
        const detailDurInfo = getTaskDurationInfo(task);
        if (detailDurInfo.isOverOneHour) {
            detailDuration.innerHTML = `<span class="duration-red-flag" style="font-size: 0.82rem;" title="Task duration exceeded 1 hour!"><i data-lucide="flag"></i>${detailDurInfo.text} (Exceeded 1 Hour)</span>`;
        } else {
            detailDuration.textContent = detailDurInfo.text !== '—' ? detailDurInfo.text : (task.duration || 'N/A');
        }
        detailPendingReason.value = task.pending_reason || 'N/A';
        if (detailEscalationHistory) {
            detailEscalationHistory.value = task.escalation_history || 'N/A';
        }
        if (detailAssignmentHistory) {
            detailAssignmentHistory.value = task.assignment_history || 'N/A';
            detailAssignmentHistory.style.height = 'auto';
            detailAssignmentHistory.style.height = Math.max(detailAssignmentHistory.scrollHeight + 10, 100) + 'px';
        }

        taskDetailModal.classList.remove('hidden');

        // Dynamically adjust height of pending reason textarea based on text content (after rendering)
        detailPendingReason.style.height = 'auto';
        detailPendingReason.style.height = Math.max(detailPendingReason.scrollHeight + 10, 100) + 'px';
        if (detailEscalationHistory) {
            detailEscalationHistory.style.height = 'auto';
            detailEscalationHistory.style.height = Math.max(detailEscalationHistory.scrollHeight + 10, 100) + 'px';
        }
        const content = taskDetailModal.querySelector('.modal-content-deck');
        content.style.transform = 'translateY(20px)';
        setTimeout(() => {
            content.style.transform = 'translateY(0)';
            if (window.lucide) window.lucide.createIcons();
        }, 10);
    }

    function closeDetailModal() {
        const content = taskDetailModal.querySelector('.modal-content-deck');
        content.style.transform = 'translateY(20px)';
        setTimeout(() => {
            taskDetailModal.classList.add('hidden');
        }, 150);
    }

    if (btnCloseDetailModal) btnCloseDetailModal.addEventListener('click', closeDetailModal);
    if (btnCloseDetailModalFooter) btnCloseDetailModalFooter.addEventListener('click', closeDetailModal);
    if (taskDetailModal) {
        taskDetailModal.addEventListener('click', (e) => {
            if (e.target === taskDetailModal) closeDetailModal();
        });
    }

    // --- Modal Handlers ---

    function openEditModal(taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        editTaskIdInput.value = task.id;
        modalTaskIdLabel.textContent = task.id;
        editDescriptionInput.value = task.description;
        editOwnerInput.value = task.owner;
        editStartTimeInput.value = convertToInputFormat(task.start_time);
        editEndTimeInput.value = convertToInputFormat(task.end_time);
        editStatusSelect.value = task.status;
        if (editMisStatusSelect) {
            editMisStatusSelect.value = task.mis_status || 'Not Closed';
        }
        editPendingReasonInput.value = task.pending_reason || '';
        editPendingReasonInput.style.height = 'auto';
        editPendingReasonInput.style.height = Math.max(editPendingReasonInput.scrollHeight + 4, 80) + 'px';

        if (editEscalationHistoryInput) {
            editEscalationHistoryInput.value = task.escalation_history || '';
            editEscalationHistoryInput.style.height = 'auto';
            editEscalationHistoryInput.style.height = Math.max(editEscalationHistoryInput.scrollHeight + 4, 80) + 'px';
        }

        if (task.status === 'Pending') {
            editPendingReasonGroup.classList.remove('hidden');
        } else {
            editPendingReasonGroup.classList.add('hidden');
        }

        editModal.classList.remove('hidden');
        const content = editModal.querySelector('.modal-content-deck');
        content.style.transform = 'translateY(20px)';
        setTimeout(() => {
            content.style.transform = 'translateY(0)';
        }, 10);
    }

    function closeModal() {
        const content = editModal.querySelector('.modal-content-deck');
        content.style.transform = 'translateY(20px)';
        setTimeout(() => {
            editModal.classList.add('hidden');
        }, 150);
    }

    btnCloseModal.addEventListener('click', closeModal);
    btnCancelEdit.addEventListener('click', closeModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeModal();
    });

    // --- Toast Notifications Logic ---

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconName = 'check-circle';
        if (type === 'error') iconName = 'alert-triangle';
        if (type === 'warning') iconName = 'alert-circle';
        if (type === 'info') iconName = 'info';

        toast.innerHTML = `
            <i data-lucide="${iconName}"></i>
            <div class="toast-message">${message}</div>
            <button class="toast-close">&times;</button>
        `;

        toastContainer.appendChild(toast);
        
        if (window.lucide) window.lucide.createIcons();

        toast.querySelector('.toast-close').addEventListener('click', () => {
            removeToast(toast);
        });

        setTimeout(() => {
            removeToast(toast);
        }, 5000);
    }

    function removeToast(toast) {
        toast.style.animation = 'fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }

    // Idle Activity Tracker to prevent background requests and Werkzeug server saturation
    let lastActivityTime = Date.now();
    const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => {
        document.addEventListener(evt, () => {
            const wasIdle = (Date.now() - lastActivityTime) > IDLE_THRESHOLD;
            lastActivityTime = Date.now();
            if (wasIdle && currentUser) {
                // Instantly resume fetching if we were idle
                fetchTasks();
                fetchQuickLinks();
                sendHeartbeat();
            }
        }, { passive: true });
    });

    // Periodically refresh data every 4.5 seconds
    setInterval(() => {
        if (currentUser && (Date.now() - lastActivityTime) <= IDLE_THRESHOLD) {
            fetchTasks();
        }
    }, 4500);

    // Automatically reload the browser page every 5 minutes (increased from 2 minutes)
    setInterval(() => {
        if ((Date.now() - lastActivityTime) <= IDLE_THRESHOLD) {
            location.reload();
        }
    }, 300000);

    // --- Implementation Tracker Modal Handlers ---
    let allImplementations = [];

    async function loadAndRenderImplTracker() {
        try {
            implTrackerTableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                        Loading implementation history records...
                    </td>
                </tr>
            `;

            const response = await fetch(`${API_BASE}/tasks/implementations`);
            if (!response.ok) throw new Error('Failed to fetch implementations');
            allImplementations = await response.json();

            renderImplTrackerTable(allImplementations);
        } catch (error) {
            console.error('Error loading implementations:', error);
            implTrackerTableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; color: #ef4444; padding: 2rem;">
                        <i data-lucide="alert-circle" style="display: inline-block; vertical-align: middle; margin-right: 0.5rem; width: 16px; height: 16px;"></i>
                        Failed to load implementation records.
                    </td>
                </tr>
            `;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    function renderImplTrackerTable(tasks) {
        // Calculate Stats
        const total = tasks.length;
        const inProgress = tasks.filter(t => t.status === 'In Progress').length;
        const completed = tasks.filter(t => t.status === 'Completed').length;
        const verified = tasks.filter(t => t.config_status && t.config_status.trim() !== '').length;

        statImplTotal.textContent = total;
        statImplProgress.textContent = inProgress;
        statImplCompleted.textContent = completed;
        statImplVerified.textContent = verified;

        // Apply filters
        const searchVal = implTrackerSearch.value.toLowerCase().trim();
        const statusFilter = implTrackerStatusFilter.value;
        const verifyFilter = implTrackerVerifyFilter.value;

        const filtered = tasks.filter(t => {
            const matchesSearch = !searchVal || 
                (t.reference && t.reference.toLowerCase().includes(searchVal)) ||
                (t.owner && t.owner.toLowerCase().includes(searchVal)) ||
                (t.description && t.description.toLowerCase().includes(searchVal));

            const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

            const hasVerify = t.config_status && t.config_status.trim() !== '';
            const matchesVerify = verifyFilter === 'all' || 
                (verifyFilter === 'verified' && hasVerify) ||
                (verifyFilter === 'unverified' && !hasVerify);

            return matchesSearch && matchesStatus && matchesVerify;
        });

        if (filtered.length === 0) {
            implTrackerTableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                        No matching implementation records found.
                    </td>
                </tr>
            `;
            return;
        }

        // Helper to format date and time in compact stacked format
        const formatTrackerDateTime = (dtStr) => {
            if (!dtStr || dtStr === '—' || dtStr.trim() === '') return '—';
            if (dtStr.includes(' ')) {
                const parts = dtStr.split(' ');
                const datePart = parts[0];
                const timePart = parts[1] ? parts[1].substring(0, 5) : '';
                return `<div style="line-height: 1.2;"><span style="font-size: 0.75rem; font-weight: 500;">${datePart}</span><br><span style="font-size: 0.7rem; color: var(--text-muted);">${timePart}</span></div>`;
            }
            return `<span style="font-size: 0.75rem;">${dtStr}</span>`;
        };

        implTrackerTableBody.innerHTML = '';
        filtered.forEach(task => {
            const tr = document.createElement('tr');
            
            const startDisplay = formatTrackerDateTime(task.start_time);
            const endDisplay = formatTrackerDateTime(task.end_time);
            const trackerDurInfo = getTaskDurationInfo(task);
            const durationDisplay = trackerDurInfo.text;

            const refDisplay = task.reference ? `<span style="font-weight: 600; color: #0284c7; background: rgba(14, 165, 233, 0.12); padding: 0.2rem 0.4rem; border-radius: var(--radius-sm); font-size: 0.72rem; word-break: break-all;"><i data-lucide="tag" style="width: 10px; height: 10px; display: inline-block; margin-right: 0.15rem; vertical-align: middle;"></i>${task.reference}</span>` : '—';

            let statusClass = 'pending';
            if (task.status === 'Completed') statusClass = 'completed';
            else if (task.status === 'In Progress') statusClass = 'in-progress';

            const statusBadge = `
                <span class="status-badge ${statusClass}" style="margin: 0 auto; font-size: 0.7rem; padding: 0.15rem 0.4rem; width: auto;">
                    <span class="badge-dot"></span>
                    ${task.status}
                </span>
            `;

            // MIS Status Select Dropdown (or Badge for non-editable users)
            const misStatusVal = task.mis_status || 'Not Closed';
            const isClosed = misStatusVal === 'Closed';
            const canEdit = !!currentUser;
            
            let misStatusHtml = '';
            if (canEdit) {
                misStatusHtml = `
                    <select class="roster-select btn-mis-status-select" data-id="${task.id}" style="width: 100%; max-width: 100px; padding: 0.2rem 0.35rem; font-size: 0.72rem; font-weight: 600; border-radius: var(--radius-sm); border: 1px solid ${isClosed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; background: ${isClosed ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'}; color: ${isClosed ? '#10b981' : '#f87171'}; text-align: center; outline: none; cursor: pointer; display: inline-block; height: auto;">
                        <option value="Not Closed" ${!isClosed ? 'selected' : ''} style="background: #0f172a; color: #f87171; font-weight: bold;">Not Closed</option>
                        <option value="Closed" ${isClosed ? 'selected' : ''} style="background: #0f172a; color: #10b981; font-weight: bold;">Closed</option>
                    </select>
                `;
            } else {
                misStatusHtml = `
                    <span class="status-badge ${isClosed ? 'completed' : 'pending'}" style="margin: 0 auto; display: inline-flex; width: auto; font-size: 0.7rem; padding: 0.15rem 0.4rem;">
                        <span class="badge-dot" style="background-color: ${isClosed ? '#10b981' : '#ef4444'};"></span>
                        ${misStatusVal}
                    </span>
                `;
            }

            // Split Verification column: Config Status and Verified By
            let configDisplay = '';
            let verifiedByDisplay = '—';
            
            if (task.config_status && task.config_status.trim() !== '') {
                configDisplay = `
                    <div style="color: #10b981; font-weight: 600; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 0.2rem;">
                        <i data-lucide="check-circle" style="width: 13px; height: 13px; color: #10b981;"></i>
                        Verified
                    </div>
                `;
                const raw = task.config_status.replace("Verified by ", "");
                if (raw.includes(' on ')) {
                    const [vUser, vDate] = raw.split(' on ');
                    verifiedByDisplay = `<div style="line-height: 1.2;"><strong style="font-size: 0.75rem; color: var(--text-main);">${vUser}</strong><br><span style="font-size: 0.68rem; color: var(--text-muted);">${vDate}</span></div>`;
                } else {
                    verifiedByDisplay = `<span style="font-size: 0.75rem; font-weight: 500;">${raw}</span>`;
                }
            } else {
                configDisplay = `
                    <button class="action-btn btn-verify-config" data-id="${task.id}" style="background: rgba(167, 139, 250, 0.1); color: #a78bfa; border: 1px solid rgba(167, 139, 250, 0.2); width: 100%; max-width: 85px; padding: 0.25rem 0.35rem; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 0.2rem; height: auto; cursor: pointer; margin: 0 auto;">
                        <i data-lucide="shield-alert" style="width: 11px; height: 11px;"></i>Verify
                    </button>
                `;
            }

            tr.innerHTML = `
                <td style="text-align: center; vertical-align: top;">${refDisplay}</td>
                <td class="col-description" style="text-align: left; vertical-align: top;"><div style="font-weight: 500; font-size: 0.8rem; line-height: 1.45; word-break: break-word; white-space: normal; color: var(--text-main);">${escapeHtml(task.description || '')}</div></td>
                <td style="text-align: center; vertical-align: top;"><span style="font-weight: 500; font-size: 0.78rem;">${task.owner}</span></td>
                <td style="text-align: center; vertical-align: top;">${startDisplay}</td>
                <td style="text-align: center; vertical-align: top;">${endDisplay}</td>
                <td style="text-align: center; vertical-align: top;">
                    ${trackerDurInfo.isOverOneHour ? `
                        <span class="duration-red-flag" style="font-size: 0.75rem;" title="Task duration exceeded 1 hour!">
                            <i data-lucide="flag"></i>${durationDisplay}
                        </span>
                    ` : (durationDisplay !== '—' ? `<span style="font-weight: 600; color: #38bdf8; font-size: 0.8rem;">${durationDisplay}</span>` : '<span style="color: var(--text-muted); font-style: italic;">—</span>')}
                </td>
                <td style="text-align: center; vertical-align: top;">${statusBadge}</td>
                <td style="text-align: center; vertical-align: top;">${misStatusHtml}</td>
                <td style="text-align: center; vertical-align: top;">${configDisplay}</td>
                <td style="text-align: center; vertical-align: top;">${verifiedByDisplay}</td>
            `;

            implTrackerTableBody.appendChild(tr);
        });

        // Add verification button event listeners
        document.querySelectorAll('.btn-verify-config').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const taskId = btn.getAttribute('data-id');
                const task = tasks.find(t => t.id === taskId);
                if (!task) return;

                if (!confirm(`Are you sure you want to verify the configuration for implementation ticket ${task.reference}?`)) {
                    return;
                }

                try {
                    const dateStr = new Date().toLocaleString();
                    const verifyLog = `Verified by ${currentUser.name} at ${dateStr}`;

                    showToast("Saving verification status...", "info");
                    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            config_status: verifyLog
                        })
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.message || 'Failed to verify config');
                    }

                    showToast(`Configuration successfully verified!`, "success");
                    loadAndRenderImplTracker();
                    updateDashboard();
                } catch (error) {
                    console.error('Error verifying config:', error);
                    showToast(error.message || 'Connection error during verification.', 'error');
                }
            });
        });

        // Add MIS Status change dropdown event listeners
        document.querySelectorAll('.btn-mis-status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const taskId = select.getAttribute('data-id');
                const newMisStatus = select.value;
                const task = tasks.find(t => t.id === taskId);
                if (!task) return;

                try {
                    showToast("Updating MIS Status...", "info");
                    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            mis_status: newMisStatus
                        })
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.message || 'Failed to update MIS status');
                    }

                    showToast(`MIS Status updated to ${newMisStatus}!`, "success");
                    loadAndRenderImplTracker();
                    updateDashboard();
                } catch (error) {
                    console.error('Error updating MIS status:', error);
                    showToast(error.message || 'Connection error during update.', 'error');
                    // Reset dropdown value
                    select.value = task.mis_status || 'Not Closed';
                }
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }

    if (btnOpenImplTracker) {
        btnOpenImplTracker.addEventListener('click', () => {
            implTrackerModal.classList.remove('hidden');
            loadAndRenderImplTracker();
            const content = implTrackerModal.querySelector('.modal-content-deck');
            content.style.transform = 'translateY(20px)';
            setTimeout(() => {
                content.style.transform = 'translateY(0)';
            }, 10);
        });
    }

    if (btnCloseImplTrackerModal) {
        btnCloseImplTrackerModal.addEventListener('click', () => {
            const content = implTrackerModal.querySelector('.modal-content-deck');
            content.style.transform = 'translateY(20px)';
            setTimeout(() => {
                implTrackerModal.classList.add('hidden');
            }, 150);
        });
    }

    if (implTrackerSearch) {
        implTrackerSearch.addEventListener('input', () => {
            renderImplTrackerTable(allImplementations);
        });
    }
    if (implTrackerStatusFilter) {
        implTrackerStatusFilter.addEventListener('change', () => {
            renderImplTrackerTable(allImplementations);
        });
    }
    if (implTrackerVerifyFilter) {
        implTrackerVerifyFilter.addEventListener('change', () => {
            renderImplTrackerTable(allImplementations);
        });
    }


    // =========================================================================
    // --- PROJECT WORK & PROGRESS TRACKER ---
    // =========================================================================
    const btnOpenProjectWork = document.getElementById('btnOpenProjectWork');
    const projectWorkModal = document.getElementById('projectWorkModal');
    const btnCloseProjectWorkModal = document.getElementById('btnCloseProjectWorkModal');
    const btnToggleAddProjectForm = document.getElementById('btnToggleAddProjectForm');
    const addProjectFormContainer = document.getElementById('addProjectFormContainer');
    const btnCancelAddProject = document.getElementById('btnCancelAddProject');
    const createProjectForm = document.getElementById('createProjectForm');
    const newProjectName = document.getElementById('newProjectName');
    const newProjectTagSelect = document.getElementById('newProjectTagSelect');
    const newProjTagsContainer = document.getElementById('newProjTagsContainer');
    const newProjTaggedCount = document.getElementById('newProjTaggedCount');
    const newProjectTargetDate = document.getElementById('newProjectTargetDate');
    const newProjectDescription = document.getElementById('newProjectDescription');

    const statProjTotal = document.getElementById('statProjTotal');
    const statProjMine = document.getElementById('statProjMine');
    const statProjProgress = document.getElementById('statProjProgress');
    const statProjCompleted = document.getElementById('statProjCompleted');

    const projectWorkSearch = document.getElementById('projectWorkSearch');
    const projectWorkScopeFilter = document.getElementById('projectWorkScopeFilter');
    const projectWorkStatusFilter = document.getElementById('projectWorkStatusFilter');
    const projectWorkTableBody = document.getElementById('projectWorkTableBody');

    const projectProgressModal = document.getElementById('projectProgressModal');
    const btnCloseProjProgressModal = document.getElementById('btnCloseProjProgressModal');
    const projProgressModalTitle = document.getElementById('projProgressModalTitle');
    const projProgressBannerDesc = document.getElementById('projProgressBannerDesc');
    const projProgressBannerAssignee = document.getElementById('projProgressBannerAssignee');
    const projProgressBannerTargetDate = document.getElementById('projProgressBannerTargetDate');
    const projProgressBannerFinishedWrap = document.getElementById('projProgressBannerFinishedWrap');
    const projProgressBannerFinishedAt = document.getElementById('projProgressBannerFinishedAt');
    const btnModalFinishProject = document.getElementById('btnModalFinishProject');
    const projProgressBannerCreator = document.getElementById('projProgressBannerCreator');
    const projProgressBannerBadge = document.getElementById('projProgressBannerBadge');
    const btnToggleEditAssignees = document.getElementById('btnToggleEditAssignees');
    const editProjectAssigneesBox = document.getElementById('editProjectAssigneesBox');
    const editProjectTagSelect = document.getElementById('editProjectTagSelect');
    const editProjTagsContainer = document.getElementById('editProjTagsContainer');
    const editProjTaggedCount = document.getElementById('editProjTaggedCount');
    const editProjTargetDate = document.getElementById('editProjTargetDate');
    const btnSaveProjectAssignees = document.getElementById('btnSaveProjectAssignees');
    const projectProgressUpdateForm = document.getElementById('projectProgressUpdateForm');
    const projProgressProjectId = document.getElementById('projProgressProjectId');
    const projProgressNote = document.getElementById('projProgressNote');
    const projProgressPercent = document.getElementById('projProgressPercent');
    const projProgressPercentLabel = document.getElementById('projProgressPercentLabel');
    const projProgressStatus = document.getElementById('projProgressStatus');
    const projProgressTimelineList = document.getElementById('projProgressTimelineList');

    let allProjects = [];
    let cachedAssigneeNames = [];
    let newProjectTaggedUsers = [];
    let editProjectTaggedUsers = [];

    function parseAssigneesList(assignedStr) {
        if (!assignedStr) return [];
        return String(assignedStr).split(',').map(s => s.trim()).filter(Boolean);
    }

    function isAssignedToUser(assignedStr, userNameLower) {
        if (!userNameLower) return false;
        return parseAssigneesList(assignedStr).some(a => a.toLowerCase() === userNameLower);
    }

    function renderNewProjectTags() {
        if (!newProjTagsContainer) return;
        if (newProjectTaggedUsers.length === 0) {
            newProjTagsContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.76rem; font-style: italic;">No person tagged yet. Select from the dropdown to tag members.</span>`;
            if (newProjTaggedCount) newProjTaggedCount.textContent = '(0 tagged)';
            return;
        }
        if (newProjTaggedCount) newProjTaggedCount.textContent = `(${newProjectTaggedUsers.length} tagged)`;
        newProjTagsContainer.innerHTML = newProjectTaggedUsers.map(name => `
            <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.22rem 0.6rem; border-radius: 999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); font-size: 0.76rem; font-weight: 600;">
                <i data-lucide="user" style="width: 12px; height: 12px;"></i>
                <span>${escapeHtml(name)}</span>
                <button type="button" class="btn-remove-new-tag" data-name="${escapeHtml(name)}" title="Remove tag" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 0 0 3px; font-size: 14px; line-height: 1; font-weight: bold; display: inline-flex; align-items: center;">&times;</button>
            </span>
        `).join('');
        newProjTagsContainer.querySelectorAll('.btn-remove-new-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tag = btn.getAttribute('data-name');
                newProjectTaggedUsers = newProjectTaggedUsers.filter(n => n.toLowerCase() !== tag.toLowerCase());
                renderNewProjectTags();
            });
        });
        if (window.lucide) window.lucide.createIcons();
    }

    function renderEditProjectTags() {
        if (!editProjTagsContainer) return;
        if (editProjectTaggedUsers.length === 0) {
            editProjTagsContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.76rem; font-style: italic;">No person tagged yet. Select from the dropdown to tag members.</span>`;
            if (editProjTaggedCount) editProjTaggedCount.textContent = '(0 tagged)';
            return;
        }
        if (editProjTaggedCount) editProjTaggedCount.textContent = `(${editProjectTaggedUsers.length} tagged)`;
        editProjTagsContainer.innerHTML = editProjectTaggedUsers.map(name => `
            <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.22rem 0.6rem; border-radius: 999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); font-size: 0.76rem; font-weight: 600;">
                <i data-lucide="user" style="width: 12px; height: 12px;"></i>
                <span>${escapeHtml(name)}</span>
                <button type="button" class="btn-remove-edit-tag" data-name="${escapeHtml(name)}" title="Remove tag" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 0 0 3px; font-size: 14px; line-height: 1; font-weight: bold; display: inline-flex; align-items: center;">&times;</button>
            </span>
        `).join('');
        editProjTagsContainer.querySelectorAll('.btn-remove-edit-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tag = btn.getAttribute('data-name');
                editProjectTaggedUsers = editProjectTaggedUsers.filter(n => n.toLowerCase() !== tag.toLowerCase());
                renderEditProjectTags();
            });
        });
        if (window.lucide) window.lucide.createIcons();
    }

    if (newProjectTagSelect) {
        newProjectTagSelect.addEventListener('change', () => {
            const val = newProjectTagSelect.value.trim();
            if (val) {
                if (!newProjectTaggedUsers.some(u => u.toLowerCase() === val.toLowerCase())) {
                    newProjectTaggedUsers.push(val);
                    renderNewProjectTags();
                } else {
                    showToast(`${val} is already tagged.`, 'info');
                }
                newProjectTagSelect.value = '';
            }
        });
    }

    if (editProjectTagSelect) {
        editProjectTagSelect.addEventListener('change', () => {
            const val = editProjectTagSelect.value.trim();
            if (val) {
                if (!editProjectTaggedUsers.some(u => u.toLowerCase() === val.toLowerCase())) {
                    editProjectTaggedUsers.push(val);
                    renderEditProjectTags();
                } else {
                    showToast(`${val} is already tagged.`, 'info');
                }
                editProjectTagSelect.value = '';
            }
        });
    }

    async function populateProjectAssignees() {
        let usersList = [];
        try {
            const res = await fetch(`${API_BASE}/users`);
            if (res.ok) {
                usersList = await res.json();
            }
        } catch (e) {}

        const namesSet = new Set();
        usersList.forEach(u => {
            if (u.name && u.username !== 'admin') namesSet.add(u.name.trim());
        });
        if (Array.isArray(allUsers)) {
            allUsers.forEach(u => {
                if (u.name && u.username !== 'admin') namesSet.add(u.name.trim());
            });
        }
        cachedAssigneeNames = Array.from(namesSet).sort((a, b) => a.localeCompare(b));

        const fillTagDropdown = (sel, placeholder) => {
            if (!sel) return;
            sel.innerHTML = `<option value="">${placeholder}</option>`;
            cachedAssigneeNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            });
        };

        fillTagDropdown(newProjectTagSelect, '+ Tag a person...');
        fillTagDropdown(editProjectTagSelect, '+ Tag another person...');
    }

    async function loadAndRenderProjects() {
        if (!projectWorkTableBody) return;
        try {
            const res = await fetch(`${API_BASE}/projects`);
            if (!res.ok) throw new Error('Failed to load projects');
            allProjects = await res.json();
            renderProjectWorkTable();
        } catch (err) {
            console.error('Error loading projects:', err);
            projectWorkTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #ef4444; padding: 2rem;">
                        Failed to load projects. Please try again.
                    </td>
                </tr>
            `;
        }
    }

    function renderProjectWorkTable() {
        if (!projectWorkTableBody) return;
        const myName = (currentUser && currentUser.name ? currentUser.name.trim().toLowerCase() : '');
        const isAdmin = currentUser && currentUser.role === 'admin';

        // Update quick metrics
        const totalCount = allProjects.length;
        const mineCount = allProjects.filter(p => isAssignedToUser(p.assigned_to, myName)).length;
        const inProgCount = allProjects.filter(p => p.status !== 'Completed').length;
        const compCount = allProjects.filter(p => p.status === 'Completed').length;

        if (statProjTotal) statProjTotal.textContent = totalCount;
        if (statProjMine) statProjMine.textContent = mineCount;
        if (statProjProgress) statProjProgress.textContent = inProgCount;
        if (statProjCompleted) statProjCompleted.textContent = compCount;

        const q = (projectWorkSearch ? projectWorkSearch.value.trim().toLowerCase() : '');
        const scope = (projectWorkScopeFilter ? projectWorkScopeFilter.value : 'ALL');
        const statusFilter = (projectWorkStatusFilter ? projectWorkStatusFilter.value : 'ALL');

        const filtered = allProjects.filter(p => {
            if (scope === 'MINE' && !isAssignedToUser(p.assigned_to, myName)) {
                return false;
            }
            if (statusFilter !== 'ALL' && p.status !== statusFilter) {
                return false;
            }
            if (q) {
                const hay = `${p.id || ''} ${p.name || ''} ${p.description || ''} ${p.assigned_to || ''} ${p.created_by || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            projectWorkTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
                        No projects found. Click <strong>"Add New Project"</strong> above to create and assign a project.
                    </td>
                </tr>
            `;
            return;
        }

        projectWorkTableBody.innerHTML = '';
        filtered.forEach(p => {
            const tr = document.createElement('tr');
            const assignees = parseAssigneesList(p.assigned_to);
            const isAssignedToMe = isAssignedToUser(p.assigned_to, myName);
            const isCreatedByMe = myName && (p.created_by || '').trim().toLowerCase() === myName;
            const canUpdate = isAdmin || isAssignedToMe || isCreatedByMe;
            const canDelete = isAdmin || isCreatedByMe;

            const prog = Math.max(0, Math.min(100, parseInt(p.progress || 0, 10)));
            const updates = Array.isArray(p.updates) ? p.updates : [];
            const latest = updates.length > 0 ? updates[0] : null;

            let statusColor = '#38bdf8';
            let statusBg = 'rgba(56, 189, 248, 0.12)';
            if (p.status === 'Completed') {
                statusColor = '#10b981';
                statusBg = 'rgba(16, 185, 129, 0.14)';
            } else if (p.status === 'Pending') {
                statusColor = '#eab308';
                statusBg = 'rgba(234, 179, 8, 0.14)';
            }

            const barColor = p.status === 'Completed' ? '#10b981' : (prog >= 50 ? '#38bdf8' : '#f59e0b');

            const assigneesBadgesHtml = (assignees.length ? assignees : ['Unassigned']).map(person => {
                const isMe = myName && person.toLowerCase() === myName;
                return `<div style="display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.76rem; font-weight: 600; margin: 2px; background: ${isMe ? 'rgba(245, 158, 11, 0.18)' : 'rgba(56, 189, 248, 0.1)'}; color: ${isMe ? '#fbbf24' : '#38bdf8'}; border: 1px solid ${isMe ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.25)'};">
                    <i data-lucide="user" style="width: 12px; height: 12px;"></i>
                    <span>${escapeHtml(person)}</span>
                </div>`;
            }).join('');

            const latestHtml = latest
                ? `<div style="font-size: 0.83rem; color: var(--text-main); line-height: 1.4; margin-bottom: 0.25rem; word-break: break-word;">${escapeHtml(latest.note)}</div>
                   <div style="font-size: 0.72rem; color: var(--text-muted);">
                       <strong style="color: #38bdf8;">${escapeHtml(latest.user || '')}</strong> &bull; ${escapeHtml(latest.timestamp || '')}
                       <span style="margin-left: 0.35rem; background: rgba(148, 163, 184, 0.15); padding: 1px 6px; border-radius: 999px; font-size: 0.68rem;">${updates.length} update${updates.length === 1 ? '' : 's'}</span>
                   </div>`
                : `<span style="color: var(--text-muted); font-size: 0.8rem;">No updates yet</span>`;

            tr.innerHTML = `
                <td style="vertical-align: middle;">
                    <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.2rem;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: #fbbf24; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px;">${escapeHtml(p.id)}</span>
                        <strong style="font-size: 0.92rem; color: var(--text-main);">${escapeHtml(p.name)}</strong>
                    </div>
                    ${p.description ? `<div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.35;">${escapeHtml(p.description)}</div>` : ''}
                    <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 0.25rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span>Assigned by <strong>${escapeHtml(p.created_by || 'Admin')}</strong> on ${escapeHtml(p.created_at || '')}</span>
                        ${p.target_date ? `<span style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 1px 7px; border-radius: 999px; font-weight: 700; font-size: 0.68rem; background: rgba(245, 158, 11, 0.14); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);"><i data-lucide="calendar-clock" style="width: 11px; height: 11px;"></i> Target: ${escapeHtml(p.target_date)}</span>` : ''}
                        ${p.finished_at ? `<span style="display: inline-flex; align-items: center; gap: 0.25rem; padding: 1px 7px; border-radius: 999px; font-weight: 700; font-size: 0.68rem; background: rgba(16, 185, 129, 0.16); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4);"><i data-lucide="check-circle-2" style="width: 11px; height: 11px;"></i> Finished: ${escapeHtml(p.finished_at)}</span>` : ''}
                    </div>
                </td>
                <td style="vertical-align: middle;">
                    <div style="display: flex; flex-wrap: wrap; gap: 2px;">${assigneesBadgesHtml}</div>
                </td>
                <td style="vertical-align: middle;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                        <span style="font-size: 0.73rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; color: ${statusColor}; background: ${statusBg};">${escapeHtml(p.status || 'In Progress')}</span>
                        <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-main);">${prog}%</span>
                    </div>
                    <div style="width: 100%; height: 7px; background: rgba(148, 163, 184, 0.15); border-radius: 999px; overflow: hidden;">
                        <div style="width: ${prog}%; height: 100%; background: ${barColor}; border-radius: 999px; transition: width 0.3s ease;"></div>
                    </div>
                    ${p.finished_at ? `<div style="font-size: 0.7rem; color: #10b981; font-weight: 600; margin-top: 0.3rem; display: flex; align-items: center; gap: 0.25rem;"><i data-lucide="check-check" style="width: 12px; height: 12px;"></i> Finish Date: ${escapeHtml(p.finished_at)}</div>` : ''}
                </td>
                <td style="vertical-align: middle;">
                    ${latestHtml}
                </td>
                <td style="vertical-align: middle;">
                    <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                        <button type="button" class="btn-proj-update" data-id="${escapeHtml(p.id)}" style="padding: 0.42rem 0.75rem; font-size: 0.76rem; font-weight: 600; border-radius: var(--radius-sm); border: 1px solid ${canUpdate ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.35)'}; background: rgba(56, 189, 248, 0.12); color: #38bdf8; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;">
                            <i data-lucide="${canUpdate ? 'message-square-plus' : 'eye'}" style="width: 14px; height: 14px;"></i> ${canUpdate ? 'Update' : 'View'}
                        </button>
                        ${(canUpdate && p.status !== 'Completed') ? `
                        <button type="button" class="btn-proj-finish" data-id="${escapeHtml(p.id)}" title="Mark Project as Finished" style="padding: 0.42rem 0.75rem; font-size: 0.76rem; font-weight: 700; border-radius: var(--radius-sm); border: 1px solid rgba(16, 185, 129, 0.45); background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);">
                            <i data-lucide="check-circle-2" style="width: 14px; height: 14px;"></i> Finish
                        </button>` : ''}
                        ${canDelete ? `
                        <button type="button" class="btn-proj-delete" data-id="${escapeHtml(p.id)}" title="Delete Project" style="padding: 0.4rem 0.55rem; font-size: 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1); color: #ef4444; cursor: pointer; display: inline-flex; align-items: center;">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>` : ''}
                    </div>
                </td>
            `;
            projectWorkTableBody.appendChild(tr);
        });

        // Attach event listeners
        projectWorkTableBody.querySelectorAll('.btn-proj-update').forEach(btn => {
            btn.addEventListener('click', () => {
                const pid = btn.getAttribute('data-id');
                openProjectProgressModal(pid);
            });
        });

        projectWorkTableBody.querySelectorAll('.btn-proj-finish').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pid = btn.getAttribute('data-id');
                await finishProjectById(pid);
            });
        });

        projectWorkTableBody.querySelectorAll('.btn-proj-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pid = btn.getAttribute('data-id');
                const proj = allProjects.find(x => x.id === pid);
                if (!confirm(`Are you sure you want to delete project "${proj ? proj.name : pid}"?`)) return;
                try {
                    const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(pid)}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Project deleted successfully.', 'success');
                        loadAndRenderProjects();
                    } else {
                        showToast('Failed to delete project.', 'error');
                    }
                } catch (e) {
                    showToast('Error deleting project.', 'error');
                }
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }

    async function openProjectProgressModal(projectId) {
        const proj = allProjects.find(p => p.id === projectId);
        if (!proj || !projectProgressModal) return;

        await populateProjectAssignees();

        projProgressProjectId.value = proj.id;
        projProgressModalTitle.textContent = `${proj.id}: ${proj.name}`;
        projProgressBannerDesc.textContent = proj.description || 'No additional scope description provided.';
        projProgressBannerAssignee.textContent = proj.assigned_to || 'Unassigned';
        if (projProgressBannerTargetDate) {
            projProgressBannerTargetDate.textContent = proj.target_date || 'Not Set';
        }
        if (projProgressBannerFinishedWrap && projProgressBannerFinishedAt) {
            if (proj.finished_at) {
                projProgressBannerFinishedAt.textContent = proj.finished_at;
                projProgressBannerFinishedWrap.classList.remove('hidden');
            } else {
                projProgressBannerFinishedWrap.classList.add('hidden');
            }
        }
        if (btnModalFinishProject) {
            if (proj.status === 'Completed') {
                btnModalFinishProject.classList.add('hidden');
            } else {
                btnModalFinishProject.classList.remove('hidden');
            }
        }
        projProgressBannerCreator.textContent = `${proj.created_by || 'Admin'} (${proj.created_at || ''})`;

        const prog = Math.max(0, Math.min(100, parseInt(proj.progress || 0, 10)));
        projProgressBannerBadge.textContent = `${prog}% (${proj.status || 'In Progress'})`;
        projProgressPercent.value = prog;
        projProgressPercentLabel.textContent = `${prog}%`;
        projProgressStatus.value = proj.status || 'In Progress';
        projProgressNote.value = '';

        const myName = (currentUser && currentUser.name ? currentUser.name.trim().toLowerCase() : '');
        const isAdmin = currentUser && currentUser.role === 'admin';
        const isCreatedByMe = myName && (proj.created_by || '').trim().toLowerCase() === myName;
        const canUpdate = isAdmin || isCreatedByMe || isAssignedToUser(proj.assigned_to, myName);
        const canEditAssignees = isAdmin || isCreatedByMe;
        const readOnlyNotice = document.getElementById('projProgressReadOnlyNotice');

        if (btnToggleEditAssignees) {
            if (canEditAssignees) {
                btnToggleEditAssignees.classList.remove('hidden');
            } else {
                btnToggleEditAssignees.classList.add('hidden');
            }
        }
        if (editProjectAssigneesBox) {
            editProjectAssigneesBox.classList.add('hidden');
            editProjectTaggedUsers = parseAssigneesList(proj.assigned_to);
            renderEditProjectTags();
            if (editProjTargetDate) editProjTargetDate.value = proj.target_date || '';
        }

        if (canUpdate) {
            if (projectProgressUpdateForm) projectProgressUpdateForm.classList.remove('hidden');
            if (readOnlyNotice) readOnlyNotice.classList.add('hidden');
        } else {
            if (projectProgressUpdateForm) projectProgressUpdateForm.classList.add('hidden');
            if (readOnlyNotice) readOnlyNotice.classList.remove('hidden');
        }

        renderProjectTimeline(proj);
        projectProgressModal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
        if (canUpdate && projProgressNote) {
            setTimeout(() => projProgressNote.focus(), 50);
        }
    }

    if (btnToggleEditAssignees) {
        btnToggleEditAssignees.addEventListener('click', () => {
            if (editProjectAssigneesBox) {
                editProjectAssigneesBox.classList.toggle('hidden');
            }
        });
    }

    if (btnSaveProjectAssignees) {
        btnSaveProjectAssignees.addEventListener('click', async () => {
            const pid = projProgressProjectId.value;
            if (editProjectTaggedUsers.length === 0) {
                showToast('Please tag at least 1 person involved in this project.', 'error');
                return;
            }
            const combined = editProjectTaggedUsers.join(', ');
            const target_date = editProjTargetDate ? editProjTargetDate.value.trim() : '';
            const updated_by = currentUser && currentUser.name ? currentUser.name : 'Admin';
            try {
                const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(pid)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assigned_to: combined, target_date, updated_by })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast(`Project tagged members updated!`, 'success');
                    const updatedProj = data.project;
                    const idx = allProjects.findIndex(p => p.id === pid);
                    if (idx !== -1) allProjects[idx] = updatedProj;
                    projProgressBannerAssignee.textContent = updatedProj.assigned_to;
                    if (projProgressBannerTargetDate) projProgressBannerTargetDate.textContent = updatedProj.target_date || 'Not Set';
                    if (editProjectAssigneesBox) editProjectAssigneesBox.classList.add('hidden');
                    renderProjectTimeline(updatedProj);
                    renderProjectWorkTable();
                } else {
                    showToast(data.message || 'Failed to update tagged members.', 'error');
                }
            } catch (e) {
                showToast('Error updating tagged members.', 'error');
            }
        });
    }

    function renderProjectTimeline(proj) {
        if (!projProgressTimelineList) return;
        const updates = Array.isArray(proj.updates) ? proj.updates : [];
        if (updates.length === 0) {
            projProgressTimelineList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.82rem; padding: 1rem; text-align: center;">No updates recorded yet.</div>`;
            return;
        }
        projProgressTimelineList.innerHTML = updates.map(u => `
            <div style="padding: 0.75rem 0.9rem; background: rgba(15, 23, 42, 0.55); border: 1px solid var(--border-color); border-left: 3px solid #38bdf8; border-radius: var(--radius-sm);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; font-size: 0.76rem;">
                    <span style="font-weight: 700; color: #38bdf8;">${escapeHtml(u.user || 'User')}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="padding: 1px 7px; border-radius: 999px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; font-weight: 700;">${u.progress ?? 0}% &bull; ${escapeHtml(u.status || 'In Progress')}</span>
                        <span style="color: var(--text-muted);">${escapeHtml(u.timestamp || '')}</span>
                    </div>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-main); line-height: 1.45; white-space: pre-wrap; word-break: break-word;">${escapeHtml(u.note || '')}</div>
            </div>
        `).join('');
    }

    if (btnOpenProjectWork) {
        btnOpenProjectWork.addEventListener('click', () => {
            projectWorkModal.classList.remove('hidden');
            populateProjectAssignees();
            loadAndRenderProjects();
            if (window.lucide) window.lucide.createIcons();
        });
    }

    if (btnCloseProjectWorkModal) {
        btnCloseProjectWorkModal.addEventListener('click', () => {
            projectWorkModal.classList.add('hidden');
        });
    }

    if (btnToggleAddProjectForm) {
        btnToggleAddProjectForm.addEventListener('click', () => {
            if (!addProjectFormContainer) return;
            const isHidden = addProjectFormContainer.classList.toggle('hidden');
            if (!isHidden) {
                populateProjectAssignees();
                if (newProjectName) newProjectName.focus();
            }
        });
    }

    if (btnCancelAddProject) {
        btnCancelAddProject.addEventListener('click', () => {
            if (addProjectFormContainer) {
                addProjectFormContainer.classList.add('hidden');
                newProjectTaggedUsers = [];
                renderNewProjectTags();
            }
        });
    }

    if (createProjectForm) {
        createProjectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = newProjectName.value.trim();
            const target_date = newProjectTargetDate ? newProjectTargetDate.value.trim() : '';
            const description = newProjectDescription.value.trim();
            const created_by = currentUser && currentUser.name ? currentUser.name : 'Admin';

            if (!name) {
                showToast('Please enter a project name.', 'error');
                return;
            }
            if (newProjectTaggedUsers.length === 0) {
                showToast('Please tag at least 1 person involved in this project.', 'error');
                return;
            }
            const assigned_to = newProjectTaggedUsers.join(', ');

            try {
                const res = await fetch(`${API_BASE}/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description, assigned_to, target_date, created_by })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast(`Project "${name}" created and tagged to ${assigned_to}!`, 'success');
                    createProjectForm.reset();
                    newProjectTaggedUsers = [];
                    renderNewProjectTags();
                    if (addProjectFormContainer) addProjectFormContainer.classList.add('hidden');
                    loadAndRenderProjects();
                } else {
                    showToast(data.message || 'Failed to create project.', 'error');
                }
            } catch (err) {
                showToast('Server error creating project.', 'error');
            }
        });
    }

    if (projProgressPercent) {
        projProgressPercent.addEventListener('input', () => {
            const v = parseInt(projProgressPercent.value, 10);
            if (projProgressPercentLabel) projProgressPercentLabel.textContent = `${v}%`;
            if (v === 100 && projProgressStatus) {
                projProgressStatus.value = 'Completed';
            } else if (v < 100 && projProgressStatus && projProgressStatus.value === 'Completed') {
                projProgressStatus.value = 'In Progress';
            }
        });
    }

    if (projProgressStatus) {
        projProgressStatus.addEventListener('change', () => {
            if (projProgressStatus.value === 'Completed' && projProgressPercent) {
                projProgressPercent.value = 100;
                if (projProgressPercentLabel) projProgressPercentLabel.textContent = '100%';
            }
        });
    }

    if (projectProgressUpdateForm) {
        projectProgressUpdateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pid = projProgressProjectId.value;
            const note = projProgressNote.value.trim();
            const progress = parseInt(projProgressPercent.value, 10);
            const status = projProgressStatus.value;
            const updated_by = currentUser && currentUser.name ? currentUser.name : 'User';

            if (!note) {
                showToast('Please write a progress update note.', 'error');
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(pid)}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note, progress, status, updated_by, role: currentUser && currentUser.role ? currentUser.role : 'operator' })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Project progress updated!', 'success');
                    projProgressNote.value = '';
                    const updatedProj = data.project;
                    const idx = allProjects.findIndex(p => p.id === pid);
                    if (idx !== -1) allProjects[idx] = updatedProj;
                    projProgressBannerBadge.textContent = `${updatedProj.progress}% (${updatedProj.status})`;
                    if (projProgressBannerFinishedWrap && projProgressBannerFinishedAt) {
                        if (updatedProj.finished_at) {
                            projProgressBannerFinishedAt.textContent = updatedProj.finished_at;
                            projProgressBannerFinishedWrap.classList.remove('hidden');
                        } else {
                            projProgressBannerFinishedWrap.classList.add('hidden');
                        }
                    }
                    if (btnModalFinishProject) {
                        if (updatedProj.status === 'Completed') {
                            btnModalFinishProject.classList.add('hidden');
                        } else {
                            btnModalFinishProject.classList.remove('hidden');
                        }
                    }
                    renderProjectTimeline(updatedProj);
                    renderProjectWorkTable();
                } else {
                    showToast(data.message || 'Failed to save progress update.', 'error');
                }
            } catch (err) {
                showToast('Error saving progress update.', 'error');
            }
        });
    }

    async function finishProjectById(pid, optionalNote = '') {
        const proj = allProjects.find(x => x.id === pid);
        const updated_by = currentUser && currentUser.name ? currentUser.name : 'User';
        const role = currentUser && currentUser.role ? currentUser.role : 'operator';
        try {
            const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(pid)}/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updated_by, role, note: optionalNote })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const updatedProj = data.project;
                const idx = allProjects.findIndex(p => p.id === pid);
                if (idx !== -1) allProjects[idx] = updatedProj;
                showToast(`Project "${updatedProj.name}" finished at ${updatedProj.finished_at}!`, 'success');
                renderProjectWorkTable();
                if (projectProgressModal && !projectProgressModal.classList.contains('hidden') && projProgressProjectId.value === pid) {
                    projProgressBannerBadge.textContent = `${updatedProj.progress}% (${updatedProj.status})`;
                    projProgressPercent.value = 100;
                    if (projProgressPercentLabel) projProgressPercentLabel.textContent = '100%';
                    if (projProgressStatus) projProgressStatus.value = 'Completed';
                    if (projProgressNote) projProgressNote.value = '';
                    if (projProgressBannerFinishedWrap && projProgressBannerFinishedAt) {
                        projProgressBannerFinishedAt.textContent = updatedProj.finished_at || '-';
                        projProgressBannerFinishedWrap.classList.remove('hidden');
                    }
                    if (btnModalFinishProject) btnModalFinishProject.classList.add('hidden');
                    renderProjectTimeline(updatedProj);
                }
            } else {
                showToast(data.message || 'Failed to finish project.', 'error');
            }
        } catch (err) {
            showToast('Error finishing project.', 'error');
        }
    }

    if (btnModalFinishProject) {
        btnModalFinishProject.addEventListener('click', async () => {
            const pid = projProgressProjectId ? projProgressProjectId.value : '';
            if (!pid) return;
            const note = projProgressNote ? projProgressNote.value.trim() : '';
            await finishProjectById(pid, note);
        });
    }

    if (btnCloseProjProgressModal) {
        btnCloseProjProgressModal.addEventListener('click', () => {
            projectProgressModal.classList.add('hidden');
        });
    }

    if (projectWorkSearch) {
        projectWorkSearch.addEventListener('input', renderProjectWorkTable);
    }
    if (projectWorkScopeFilter) {
        projectWorkScopeFilter.addEventListener('change', renderProjectWorkTable);
    }
    if (projectWorkStatusFilter) {
        projectWorkStatusFilter.addEventListener('change', renderProjectWorkTable);
    }

    // --- Run Auth Setup on Boot ---
    checkAuth();
});
