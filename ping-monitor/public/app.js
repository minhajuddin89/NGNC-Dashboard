const socket = io();

// Real-time server connection status handling
socket.on('connect', () => {
  const dot = document.getElementById('connectionDot');
  const text = document.getElementById('connectionText');
  if (dot) {
    dot.style.background = '#34d399';
    dot.style.boxShadow = '0 0 8px #34d399';
  }
  if (text) {
    text.textContent = 'Server Connected';
    text.style.color = '#34d399';
  }
  
  // If the client was monitoring, and we reconnected, we must reset the UI state
  // because the server-side monitoring job associated with our old socket ID was destroyed.
  if (isMonitoring) {
    handleStoppedState();
    logToConsole('[System] Connection dropped and restored. Monitoring stopped.', 'failure');
  }
});

socket.on('disconnect', () => {
  const dot = document.getElementById('connectionDot');
  const text = document.getElementById('connectionText');
  if (dot) {
    dot.style.background = '#fb7185';
    dot.style.boxShadow = '0 0 8px #fb7185';
  }
  if (text) {
    text.textContent = 'Server Disconnected';
    text.style.color = '#fb7185';
  }
  
  if (isMonitoring) {
    handleStoppedState();
    logToConsole('[System] Disconnected from server. Monitoring paused.', 'failure');
  }
});

// DOM Elements
const targetInput = document.getElementById('targetInput');

const intervalInput = document.getElementById('intervalInput');
const toggleBtn = document.getElementById('toggleBtn');
const checkOnceBtn = document.getElementById('checkOnceBtn');
const publicIpVal = document.getElementById('publicIpVal');
const pingModeSelect = document.getElementById('pingModeSelect');
const tcpPortGroup = document.getElementById('tcpPortGroup');
const tcpPortInput = document.getElementById('tcpPortInput');
const activeCount = document.getElementById('activeCount');
const targetsGrid = document.getElementById('targetsGrid');
const consoleBody = document.getElementById('consoleBody');
const clearConsoleBtn = document.getElementById('clearConsoleBtn');
const exportBtn = document.getElementById('exportBtn');
const clearGridBtn = document.getElementById('clearGridBtn');
const addActiveTargetGroup = document.getElementById('addActiveTargetGroup');
const activeTargetInput = document.getElementById('activeTargetInput');
const addActiveTargetBtn = document.getElementById('addActiveTargetBtn');



// Create custom tooltip element dynamically
const tooltipEl = document.createElement('div');
tooltipEl.className = 'custom-tooltip';
document.body.appendChild(tooltipEl);

// Performance optimization: Track visible cards in viewport to avoid rendering off-screen charts
const visibleCards = new Set();
const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const target = entry.target.getAttribute('data-target-name');
    if (entry.isIntersecting) {
      visibleCards.add(target);
      const state = targetStates[target];
      if (state) {
        if (!state.chart) {
          initializeChartForTarget(target, state);
        } else {
          state.chart.update('none');
        }
      }
    } else {
      visibleCards.delete(target);
    }
  });
}, { root: null, threshold: 0.05 });

function initializeChartForTarget(target, state) {
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const canvas = document.getElementById(`${cardId}-chart`);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 40);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array(20).fill(''),
      datasets: [{
        data: [...state.latencyHistory],
        borderColor: '#10b981',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        backgroundColor: gradient
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        x: { display: false },
        y: { display: false, min: 0 }
      }
    }
  });
}

// App State
let isMonitoring = false;
let targetStates = {}; // Map of target -> { sent, received, lost, latencyHistory, chart, logs }
let selectedTarget = null;
let localInterfaces = [];

// Fetch Public IP via HTTP with polling and direct client-side fallback (supports binding to source IP)
function getPublicIp(sourceIP = 'default') {
  publicIpVal.textContent = 'Detecting...';

  // If it's the default interface, we PREFER the browser's own client-side fetch
  // so that it matches exactly what the browser's NAT IP is (e.g. including default route/VPN/Proxy)
  if (sourceIP === 'default' || sourceIP === 'custom') {
    fetchPublicIpClientDirect();
    return;
  }

  // If a specific interface is selected, we let the server resolve it by binding to that interface
  const url = `/api/public-ip?sourceIP=${encodeURIComponent(sourceIP)}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.ip && data.ip !== 'Detecting...') {
        publicIpVal.textContent = data.ip;
      } else {
        publicIpVal.textContent = 'Unavailable';
      }
    })
    .catch(err => {
      console.warn('Failed to fetch public IP from server, trying direct client-side fetch:', err.message);
      fetchPublicIpClientDirect();
    });
}

async function fetchPublicIpClientDirect() {
  const apis = [
    'https://api.ipify.org?format=json',
    'https://ipinfo.io/json',
    'https://api.myip.com',
    'https://ipapi.co/json'
  ];
  for (const api of apis) {
    try {
      const currentVal = publicIpVal.textContent.trim();
      if (currentVal && currentVal !== 'Detecting...' && currentVal !== 'Unavailable') {
        return;
      }
      const res = await fetch(api);
      if (res.ok) {
        const data = await res.json();
        const ip = data.ip || data.query || data.ip_address;
        if (ip) {
          publicIpVal.textContent = ip;
          return;
        }
      }
    } catch (err) {
      // Ignore and try next
    }
  }
  publicIpVal.textContent = 'Unavailable';
}

getPublicIp();

// Click on Detected Public IP to view BGP advertisements on Hurricane Electric Singapore Looking Glass style page
publicIpVal.style.cursor = 'pointer';
publicIpVal.addEventListener('click', () => {
  const ip = publicIpVal.textContent.trim();
  if (ip && ip !== 'Detecting...' && ip !== 'Unavailable') {
    window.open(`/bgp.html?ip=${ip}`, `BGP_${ip.replace(/[^a-zA-Z0-9]/g, '_')}`, 'width=950,height=600,resizable=yes,scrollbars=yes');
  }
});



// Socket event: receive resolved hostname for an IP target
socket.on('resolved-hostname', (data) => {
  const { target, hostname } = data;
  if (!hostname) return;
  
  if (targetStates[target]) {
    targetStates[target].resolvedHostname = hostname;
    updateCardTitle(target, targetStates[target]);
  }
});

// Socket event: receive resolved IP for a domain target
socket.on('resolved-ip', (data) => {
  const { target, ip } = data;
  if (!ip) return;
  
  if (targetStates[target]) {
    targetStates[target].resolvedIp = ip;
    updateCardTitle(target, targetStates[target]);
  }
});

// Socket event: receive fallback IP when a nearby IP is found
socket.on('fallback-ip-found', (data) => {
  const { target, fallbackIp } = data;
  logToConsole(`[System] Found nearby pingable IP for ${target}: ${fallbackIp}. Adding to monitoring.`, 'system');
});

// Socket event: receive fallback IP not found notification
socket.on('fallback-ip-not-found', (data) => {
  const { target } = data;
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const noticeEl = document.getElementById(`${cardId}-notice`);
  if (noticeEl) {
    noticeEl.textContent = '⚠ No pingable IP at this subnet';
    noticeEl.style.display = 'block';
  }
  logToConsole(`[System] No pingable IP found in the /24 subnet for ${target}.`, 'warning');
});

// Socket event: receive fallback IP removal notification
socket.on('fallback-ip-removed', (data) => {
  const { target, fallbackIp } = data;
  const cardId = `card-${fallbackIp.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const card = document.getElementById(cardId);
  if (card) {
    card.style.transition = 'all 0.5s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-20px)';
    setTimeout(() => {
      card.remove();
    }, 500);
  }
  delete targetStates[fallbackIp];
  logToConsole(`[System] Nearby IP ${fallbackIp} removed because main target ${target} recovered.`, 'system');
});

// Socket event: receive system console log from server
socket.on('console-log', (data) => {
  logToConsole(data.text, data.type);
  if (data.type === 'failure') {
    alert(data.text);
  }
});

// Helper to update the card title with hostname/IP information
function updateCardTitle(target, state) {
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const h3 = document.querySelector(`#${cardId} .card-title h3`);
  if (!h3) return;

  let suffix = '';
  if (state.resolvedHostname) {
    suffix = ` (${state.resolvedHostname})`;
  } else if (state.resolvedIp) {
    suffix = ` (${state.resolvedIp})`;
  }

  h3.textContent = `${target}${suffix}`;
}

// Socket event: receive IP info (AS & ISP)
socket.on('ip-info', (data) => {
  const { target, as, isp } = data;
  if (targetStates[target]) {
    targetStates[target].as = as;
    targetStates[target].isp = isp;
  }
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const ispEl = document.getElementById(`${cardId}-isp`);
  if (ispEl) {
    ispEl.textContent = `ISP: ${isp} | AS: ${as}`;
  }
});

// Socket event: receive Bangladesh best latency from Globalping
socket.on('bd-best-latency', (data) => {
  const { target, latency, provider, asn, city } = data;
  if (targetStates[target]) {
    targetStates[target].bdBestLatency = latency;
    targetStates[target].bdBestProvider = provider;
    targetStates[target].bdBestAsn = asn;
    targetStates[target].bdBestCity = city;
  }

  // Update the new BD Best column DOM elements
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const bdBestEl = document.getElementById(`${cardId}-bd-best`);
  const bdProviderEl = document.getElementById(`${cardId}-bd-provider`);
  
  const tooltipText = `Provider: ${provider}\nAS: AS${asn || 'N/A'}\nCity: ${city || 'N/A'}`;
  
  if (bdBestEl) {
    bdBestEl.textContent = `${latency} ms`;
    bdBestEl.setAttribute('title', tooltipText);
  }
  if (bdProviderEl) {
    bdProviderEl.textContent = provider;
    bdProviderEl.setAttribute('title', tooltipText);
  }
});



// Handle Ping Mode dropdown change
pingModeSelect.addEventListener('change', () => {
  const val = pingModeSelect.value;
  if (val === 'tcp' || val === 'udp') {
    tcpPortGroup.style.display = 'flex';
    if (val === 'tcp') {
      tcpPortInput.value = '80';
      document.getElementById('portLabel').textContent = 'TCP Port';
    } else {
      tcpPortInput.value = '53';
      document.getElementById('portLabel').textContent = 'UDP Port';
    }
  } else {
    tcpPortGroup.style.display = 'none';
  }
});



// Toggle Monitoring
toggleBtn.addEventListener('click', () => {
  if (isMonitoring) {
    stopMonitoring();
  } else {
    startMonitoring();
  }
});

// Check Once (Single Ping Check)
checkOnceBtn.addEventListener('click', () => {
  if (!isMonitoring) {
    checkOnce();
  }
});

// Clear Console
clearConsoleBtn.addEventListener('click', () => {
  consoleBody.innerHTML = '';
  if (selectedTarget && targetStates[selectedTarget]) {
    targetStates[selectedTarget].logs = [];
  }
});

// Export Report to Excel (CSV)
exportBtn.addEventListener('click', downloadCSV);

// Clear Grid
clearGridBtn.addEventListener('click', () => {
  targetStates = {};
  selectedTarget = null;
  targetsGrid.innerHTML = `
    <div class="no-targets-msg">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>No targets being monitored. Configure and click "Start Monitor" to begin.</p>
    </div>
  `;
  consoleBody.innerHTML = '<div class="console-line system">[System] Ready to monitor...</div>';
  document.getElementById('terminalTitle').textContent = 'Live Ping Terminal (Click a target row to view logs)';
  updateGlobalStats();
  clearGridBtn.style.display = 'none';
});

function downloadCSV() {
  const targets = Object.keys(targetStates);
  if (targets.length === 0) {
    alert("No data available to export. Please add targets and start monitoring.");
    return;
  }

  // UTF-8 Byte Order Mark (BOM) to ensure Excel opens it with correct UTF-8 encoding
  const BOM = "\uFEFF";
  let csvContent = "Target,Resolved Hostname,Status,Current Latency,Avg Latency,Max Latency,Success Rate,Sent,Received,Lost,ISP / Owner,AS Info,BD Best Latency,BD Best Provider\n";

  targets.forEach(target => {
    const state = targetStates[target];
    const validLatencies = state.latencyHistory.filter(l => l !== null && l !== undefined);
    const avgLatency = validLatencies.length > 0 ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) : 0;
    const maxLatency = validLatencies.length > 0 ? Math.max(...validLatencies) : 0;
    const successRate = state.sent > 0 ? ((state.received / state.sent) * 100).toFixed(1) : "0.0";
    
    let lastLatency = "N/A";
    if (state.latencyHistory.length > 0) {
      const lastVal = state.latencyHistory[state.latencyHistory.length - 1];
      if (lastVal !== null && lastVal !== undefined) {
        lastLatency = `${lastVal} ms`;
      }
    }

    const status = state.sent > 0 && state.lost < state.sent ? "Online" : "Offline";
    const hostname = state.resolvedHostname || "N/A";
    const avgLatStr = avgLatency ? `${avgLatency} ms` : "N/A";
    const maxLatStr = maxLatency ? `${maxLatency} ms` : "N/A";
    const isp = state.isp || "N/A";
    const as = state.as || "N/A";
    const bdBestLat = state.bdBestLatency !== undefined && state.bdBestLatency !== null ? `${state.bdBestLatency} ms` : "N/A";
    const bdBestProv = state.bdBestProvider || "N/A";

    const row = `"${target}","${hostname}","${status}","${lastLatency}","${avgLatStr}","${maxLatStr}","${successRate}%",${state.sent},${state.received},${state.lost},"${isp}","${as}","${bdBestLat}","${bdBestProv}"\n`;
    csvContent += row;
  });

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `ping_monitor_report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function startMonitoring() {
  const targetText = targetInput.value.trim();
  if (!targetText) {
    alert('Please enter at least one target IP or Domain.');
    return;
  }

  const targets = targetText.split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (targets.length === 0) {
    alert('Please enter at least one valid target IP or Domain.');
    return;
  }

  // Get source IP
  let sourceIP = '';


  const intervalSec = parseFloat(intervalInput.value) || 2;
  const intervalMs = Math.max(intervalSec * 1000, 1000);

  // Reset states
  targetStates = {};
  selectedTarget = null;
  targetsGrid.innerHTML = '';
  clearGridBtn.style.display = 'none';
  document.getElementById('terminalTitle').textContent = 'Live Ping Terminal (Click a target row to view logs)';
  consoleBody.innerHTML = '';
  
  // Filter out duplicates to prevent duplicate ID crashes
  const uniqueTargets = [...new Set(targets)];

  // Create Cards & Initialize States
  uniqueTargets.forEach(target => {
    targetStates[target] = {
      sent: 0,
      received: 0,
      lost: 0,
      latencyHistory: [],
      chart: null,
      logs: [],
      lastOnlineTime: null,
      lastOfflineTime: null,
      resolvedHostname: null,
      resolvedIp: null,
      fallbackIp: null
    };
    createTargetCard(target);
  });

  const pingMode = pingModeSelect.value;
  const tcpPort = parseInt(tcpPortInput.value, 10) || 80;

  // Disable Inputs
  targetInput.disabled = true;
  intervalInput.disabled = true;
  pingModeSelect.disabled = true;
  tcpPortInput.disabled = true;

  // Change Button Style
  toggleBtn.classList.remove('btn-primary');
  toggleBtn.classList.add('btn-danger');
  toggleBtn.querySelector('.btn-text').textContent = 'Stop Monitor';
  toggleBtn.querySelector('.btn-icon').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
    </svg>
  `;

  isMonitoring = true;
  updateGlobalStats();

  if (addActiveTargetGroup) addActiveTargetGroup.style.display = 'block';

  logToConsole(`Starting monitoring for ${targets.length} targets...`, 'system');
  // Send start command to server
  socket.emit('start-monitoring', {
    targets,
    intervalMs,
    pingMode,
    tcpPort
  });
}

function stopMonitoring() {
  socket.emit('stop-monitoring');
  handleStoppedState();
  logToConsole('Monitoring session stopped.', 'system');
}

// Socket confirmations
socket.on('monitoring-started', () => {
  logToConsole('Monitoring session started successfully.', 'system');
});

socket.on('monitoring-stopped', () => {
  handleStoppedState();
  logToConsole('Monitoring session stopped.', 'system');
});

function handleStoppedState() {
  isMonitoring = false;
  
  if (addActiveTargetGroup) addActiveTargetGroup.style.display = 'none';
  if (activeTargetInput) activeTargetInput.value = '';

  // Enable Inputs Safely
  if (targetInput) targetInput.disabled = false;
  
  const interfaceSelect = document.getElementById('interfaceSelect');
  if (interfaceSelect) {
    interfaceSelect.disabled = false;
    const customSourceInput = document.getElementById('customSourceInput');
    if (interfaceSelect.value === 'custom' && customSourceInput) {
      customSourceInput.disabled = false;
    }
  }
  
  if (intervalInput) intervalInput.disabled = false;
  if (pingModeSelect) pingModeSelect.disabled = false;
  if (tcpPortInput) tcpPortInput.disabled = false;
  
  const executionSourceSelect = document.getElementById('executionSourceSelect');
  if (executionSourceSelect) {
    executionSourceSelect.disabled = false;
    
    const routerTypeSelect = document.getElementById('routerTypeSelect');
    if (routerTypeSelect) routerTypeSelect.disabled = false;
    
    const routerHostInput = document.getElementById('routerHostInput');
    if (routerHostInput) routerHostInput.disabled = false;
    
    const routerPortInput = document.getElementById('routerPortInput');
    if (routerPortInput) routerPortInput.disabled = false;
    
    const routerUserInput = document.getElementById('routerUserInput');
    if (routerUserInput) routerUserInput.disabled = false;
    
    const routerPassInput = document.getElementById('routerPassInput');
    if (routerPassInput) routerPassInput.disabled = false;
    
    const routerSourceInput = document.getElementById('routerSourceInput');
    if (routerSourceInput) routerSourceInput.disabled = false;
  }

  if (Object.keys(targetStates).length > 0) {
    clearGridBtn.style.display = 'flex';
  } else {
    clearGridBtn.style.display = 'none';
  }

  // Restore Button Style
  if (toggleBtn) {
    toggleBtn.classList.remove('btn-danger');
    toggleBtn.classList.add('btn-primary');
    const btnText = toggleBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Start Monitor';
    const btnIcon = toggleBtn.querySelector('.btn-icon');
    if (btnIcon) {
      btnIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
    }
  }
}

// Receive Ping Result
socket.on('ping-result', (data) => {
  if (!isMonitoring && (!checkOnceBtn || !checkOnceBtn.disabled)) return;
  const { target, status, latency, error, raw, timestamp, isFallbackFor } = data;
  
  if (!targetStates[target]) {
    // Dynamically initialize state and card for fallback target
    targetStates[target] = {
      sent: 0,
      received: 0,
      lost: 0,
      latencyHistory: [],
      chart: null,
      logs: [],
      lastOnlineTime: null,
      lastOfflineTime: null,
      resolvedHostname: null,
      resolvedIp: null,
      fallbackIp: null,
      isFallbackFor: isFallbackFor
    };
    createTargetCard(target, isFallbackFor);
  }

  const state = targetStates[target];

  // Update State Stats
  state.sent++;
  if (status === 'online') {
    state.received++;
    state.latencyHistory.push(latency);
    state.lastOnlineTime = timestamp;
  } else {
    state.lost++;
    state.latencyHistory.push(null); // Chart.js will show a gap
    state.lastOfflineTime = timestamp;
  }
  updateCardTitle(target, state);

  // Limit history length to 20 points
  if (state.latencyHistory.length > 20) {
    state.latencyHistory.shift();
  }

  // Calculate Success Rate
  const successRate = ((state.received / state.sent) * 100).toFixed(1);

  // Update Card UI
  updateCardUI(target, status, latency, error, successRate, state);

  // Format log line
  const timeStr = new Date(timestamp).toLocaleTimeString();
  const viaStr = data.via ? ` (via ${data.via})` : '';
  const logText = status === 'online' 
    ? `[${timeStr}] ${target}: Reply in ${latency}ms${viaStr}` 
    : `[${timeStr}] ${target}: Failed${viaStr} - ${error || 'Unknown error'}`;
  const logType = status === 'online' ? 'success' : 'failure';

  // Save to target logs
  state.logs.push({ text: logText, type: logType });
  if (state.logs.length > 1000) state.logs.shift();

  // Log to Console only if this target is selected
  if (selectedTarget === target) {
    logToConsole(logText, logType);
    
    // Limit console DOM elements to 1000 as well to prevent memory bloat
    while (consoleBody.children.length > 1000) {
      consoleBody.removeChild(consoleBody.firstChild);
    }
    
    updateTerminalHeader(target, state);
  }

  // Update Overall Dashboard Stats
  updateGlobalStats();
});

function checkOnce() {
  const targets = targetInput.value.split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (targets.length === 0) {
    alert('Please enter at least one target IP or Domain.');
    return;
  }

  let sourceIP = '';


  // Reset states
  targetStates = {};
  selectedTarget = null;
  targetsGrid.innerHTML = '';
  clearGridBtn.style.display = 'none';
  document.getElementById('terminalTitle').textContent = 'Live Ping Terminal (Click a target row to view logs)';
  consoleBody.innerHTML = '';

  // Filter out duplicates to prevent duplicate ID crashes
  const uniqueTargets = [...new Set(targets)];

  // Create Cards & Initialize States
  uniqueTargets.forEach(target => {
    targetStates[target] = {
      sent: 0,
      received: 0,
      lost: 0,
      latencyHistory: [],
      chart: null,
      logs: [],
      lastOnlineTime: null,
      lastOfflineTime: null
    };
    createTargetCard(target);
  });

  const pingMode = pingModeSelect.value;
  const tcpPort = parseInt(tcpPortInput.value, 10) || 80;

  // Disable Inputs & Both Buttons
  targetInput.disabled = true;
  intervalInput.disabled = true;
  pingModeSelect.disabled = true;
  tcpPortInput.disabled = true;
  toggleBtn.disabled = true;
  checkOnceBtn.disabled = true;
  
  const originalCheckBtnText = checkOnceBtn.querySelector('.btn-text').textContent;
  checkOnceBtn.querySelector('.btn-text').textContent = 'Checking...';

  logToConsole(`Starting single-ping check for ${targets.length} targets...`, 'system');

  socket.emit('check-once', {
    targets,
    pingMode,
    tcpPort
  });

  // Listen for completion once
  socket.once('check-once-complete', () => {
    // Re-enable inputs
    targetInput.disabled = false;
    intervalInput.disabled = false;
    pingModeSelect.disabled = false;
    tcpPortInput.disabled = false;
    toggleBtn.disabled = false;
    checkOnceBtn.disabled = false;
    checkOnceBtn.querySelector('.btn-text').textContent = originalCheckBtnText;
    if (Object.keys(targetStates).length > 0) {
      clearGridBtn.style.display = 'flex';
    }
    logToConsole('Single-ping check complete.', 'system');
  });
}

// UI Helpers
function createTargetCard(target, isFallbackFor = null) {
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  if (document.getElementById(cardId)) return; // Avoid duplicate cards

  const fallbackClass = isFallbackFor ? 'fallback-card' : '';
  const fallbackLabel = isFallbackFor 
    ? `<span class="fallback-label">➔ Nearby IP for ${isFallbackFor}</span>`
    : '';

  const cardHtml = `
    <div class="ping-card glass-card ${fallbackClass}" id="${cardId}" data-target-name="${target}" ${isFallbackFor ? `data-parent-target="${isFallbackFor}"` : ''}>
      <div class="card-info">
        <span class="badge badge-idle" id="${cardId}-badge">Idle</span>
        <div class="card-title">
          ${fallbackLabel}
          <h3>${target}</h3>
          <span class="card-status-text">Connecting...</span>
          <span class="card-isp-text" id="${cardId}-isp" style="font-size: 9px; color: var(--text-muted); display: block; margin-top: 2px; line-height: 1;"></span>
          <span class="card-notice-text" id="${cardId}-notice" style="font-size: 9px; color: #fb7185; display: none; margin-top: 2px; font-weight: 500; line-height: 1.1;"></span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <button class="btn-mtr" data-target="${target}" title="My Traceroute (MTR)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3v18h18M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
            </svg>
            <span>MTR</span>
          </button>
          <button class="btn-ports" data-target="${target}" title="Port Scanner" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--text-secondary); width: 28px; height: 28px; padding: 0; display: flex; justify-content: center; align-items: center; border-radius: 6px; cursor: pointer; transition: var(--transition-smooth);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 13px; height: 13px;">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          <button class="btn-reset" data-target="${target}" title="Reset Statistics" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--text-secondary); width: 28px; height: 28px; padding: 0; display: flex; justify-content: center; align-items: center; border-radius: 6px; cursor: pointer; transition: var(--transition-smooth);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width: 13px; height: 13px;">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="card-stats">
        <div class="stat-item latency-val">
          <span class="val" id="${cardId}-latency">--</span>
          <span class="lbl">Current</span>
        </div>
        <div class="stat-item avg-latency-val">
          <span class="val" id="${cardId}-avg-latency">--</span>
          <span class="lbl">Avg Latency</span>
        </div>
        <div class="stat-item max-latency-val">
          <span class="val" id="${cardId}-max-latency">--</span>
          <span class="lbl">Max Latency</span>
        </div>
        <div class="stat-item bd-best-val" style="cursor: pointer;" title="Click to check BD Best Latency">
          <span class="val" style="display: flex; flex-direction: column; align-items: center; line-height: 1.1;">
            <span id="${cardId}-bd-best" style="color: var(--accent-cyan); font-weight: 600; font-size: 11px;">Click</span>
            <span id="${cardId}-bd-provider" style="color: var(--text-muted); font-size: 8px; margin-top: 1px; font-weight: 500; max-width: 75px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">to check</span>
          </span>
          <span class="lbl">BD Best</span>
        </div>
        <div class="stat-item success-val">
          <span class="val" style="display: flex; flex-direction: column; align-items: center; line-height: 1.1;">
            <span id="${cardId}-success" style="color: var(--accent-green);">100%</span>
            <span id="${cardId}-fail" style="color: var(--accent-red); font-size: 10px; margin-top: 1px;">0%</span>
          </span>
          <span class="lbl">Succ / Fail</span>
        </div>
        <div class="stat-item count-val">
          <span class="val"><span id="${cardId}-received">0</span>/<span id="${cardId}-sent">0</span></span>
          <span class="lbl">Recv/Sent</span>
        </div>
      </div>

      <div class="chart-container">
        <canvas id="${cardId}-chart"></canvas>
      </div>
    </div>
  `;

  // Append card
  if (isFallbackFor) {
    const parentCardId = `card-${isFallbackFor.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const parentCard = document.getElementById(parentCardId);
    if (parentCard) {
      parentCard.insertAdjacentHTML('afterend', cardHtml);
    } else {
      targetsGrid.insertAdjacentHTML('beforeend', cardHtml);
    }
  } else {
    targetsGrid.insertAdjacentHTML('beforeend', cardHtml);
  }

  // Observe card for visibility optimization
  const card = document.getElementById(cardId);
  if (card && cardObserver) {
    cardObserver.observe(card);
  }

  // Add click event listener to select/filter logs
  card.addEventListener('click', () => {
    // Remove selected class from all other cards
    document.querySelectorAll('.ping-card').forEach(c => c.classList.remove('selected'));
    // Add selected class to this card
    card.classList.add('selected');
    selectedTarget = target;
    
    // Clear and reload logs for this target using a Fragment for performance
    consoleBody.innerHTML = '';
    const targetState = targetStates[target];
    if (targetState) {
      const fragment = document.createDocumentFragment();
      targetState.logs.forEach(log => {
        const line = document.createElement('div');
        line.classList.add('console-line');
        if (log.type) line.classList.add(log.type);
        line.textContent = log.text;
        fragment.appendChild(line);
      });
      consoleBody.appendChild(fragment);
      consoleBody.scrollTop = consoleBody.scrollHeight;
      updateTerminalHeader(target, targetState);
    }
  });

  // Add click listener for MTR button
  const mtrBtn = card.querySelector('.btn-mtr');
  mtrBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent selecting the card
    const targetVal = mtrBtn.getAttribute('data-target');
    const mode = pingModeSelect.value;
    const port = tcpPortInput.value;
    
    const executionSourceSelect = document.getElementById('executionSourceSelect');
    const executionSource = executionSourceSelect ? executionSourceSelect.value : 'local';
    
    let url = `/mtr.html?target=${targetVal}&mode=${mode}&port=${port}`;
    if (executionSource === 'router') {
      const routerTypeSelect = document.getElementById('routerTypeSelect');
      const routerHostInput = document.getElementById('routerHostInput');
      const routerPortInput = document.getElementById('routerPortInput');
      const routerUserInput = document.getElementById('routerUserInput');
      const routerPassInput = document.getElementById('routerPassInput');
      const routerSourceInput = document.getElementById('routerSourceInput');

      url += `&routerType=${routerTypeSelect ? routerTypeSelect.value : ''}&routerHost=${routerHostInput ? routerHostInput.value.trim() : ''}&routerPort=${routerPortInput ? routerPortInput.value : '22'}&routerUser=${routerUserInput ? routerUserInput.value.trim() : ''}&routerPass=${routerPassInput ? encodeURIComponent(routerPassInput.value) : ''}`;
      if (routerSourceInput && routerSourceInput.value.trim()) {
        url += `&routerSource=${routerSourceInput.value.trim()}`;
      }
    }
    window.open(url, `MTR_${targetVal.replace(/[^a-zA-Z0-9]/g, '_')}`, 'width=750,height=550,resizable=yes,scrollbars=yes');
  });
 
  // Add click listener for Trace button
  const traceBtn = card.querySelector('.btn-trace');
  if (traceBtn) {
    traceBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent selecting the card
      const targetVal = traceBtn.getAttribute('data-target');
      const mode = pingModeSelect.value;
      const port = tcpPortInput.value;
      
      const executionSourceSelect = document.getElementById('executionSourceSelect');
      const executionSource = executionSourceSelect ? executionSourceSelect.value : 'local';
      
      let url = `/trace.html?v=${Date.now()}&target=${targetVal}&mode=${mode}&port=${port}`;
      if (executionSource === 'router') {
        const routerTypeSelect = document.getElementById('routerTypeSelect');
        const routerHostInput = document.getElementById('routerHostInput');
        const routerPortInput = document.getElementById('routerPortInput');
        const routerUserInput = document.getElementById('routerUserInput');
        const routerPassInput = document.getElementById('routerPassInput');
        const routerSourceInput = document.getElementById('routerSourceInput');

        url += `&routerType=${routerTypeSelect ? routerTypeSelect.value : ''}&routerHost=${routerHostInput ? routerHostInput.value.trim() : ''}&routerPort=${routerPortInput ? routerPortInput.value : '22'}&routerUser=${routerUserInput ? routerUserInput.value.trim() : ''}&routerPass=${routerPassInput ? encodeURIComponent(routerPassInput.value) : ''}`;
        if (routerSourceInput && routerSourceInput.value.trim()) {
          url += `&routerSource=${routerSourceInput.value.trim()}`;
        }
      }
      window.open(url, `Trace_${targetVal.replace(/[^a-zA-Z0-9]/g, '_')}`, 'width=750,height=550,resizable=yes,scrollbars=yes');
    });
  }

  // Add click listener for Port Scanner button
  const portsBtn = card.querySelector('.btn-ports');
  if (portsBtn) {
    portsBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent selecting the card
      const targetVal = portsBtn.getAttribute('data-target');
      window.open(`/ports.html?target=${targetVal}`, `Ports_${targetVal.replace(/[^a-zA-Z0-9]/g, '_')}`, 'width=800,height=600,resizable=yes,scrollbars=yes');
    });
  }

  // Add click listener for Reset button
  const resetBtn = card.querySelector('.btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent selecting the card
      resetTargetStats(target);
    });
  }

  // Add click listener for BD Best (Globalping) check
  const bdBestValBtn = card.querySelector('.bd-best-val');
  bdBestValBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent selecting the card
    const bdBestEl = document.getElementById(`${cardId}-bd-best`);
    const bdProviderEl = document.getElementById(`${cardId}-bd-provider`);
    
    bdBestEl.textContent = '...';
    bdBestEl.style.fontSize = '14px';
    bdProviderEl.textContent = 'Checking...';
    
    socket.emit('query-globalping', { target });
  });

  // Add custom tooltip event listeners
  const bindTooltip = (element) => {
    element.addEventListener('mouseenter', (e) => {
      const state = targetStates[target];
      if (!state) return;
      
      const onlineTimeVal = state.lastOnlineTime ? new Date(state.lastOnlineTime).toLocaleTimeString() : 'Never';
      const offlineTimeVal = state.lastOfflineTime ? new Date(state.lastOfflineTime).toLocaleTimeString() : 'Never';
      
      const onlineValColor = state.lastOnlineTime ? '#f3f4f6' : '#f43f5e';
      const offlineValColor = state.lastOfflineTime ? '#f3f4f6' : '#34d399';
      
      tooltipEl.innerHTML = `
        <div style="margin-bottom: 4px; color: #34d399; font-weight: 500;">Last Online: <span style="color: ${onlineValColor}; font-weight: 600;">${onlineTimeVal}</span></div>
        <div style="color: #f43f5e; font-weight: 500;">Last Offline: <span style="color: ${offlineValColor}; font-weight: 600;">${offlineTimeVal}</span></div>
      `;
      tooltipEl.style.display = 'block';
    });
    
    element.addEventListener('mousemove', (e) => {
      tooltipEl.style.left = (e.clientX + 15) + 'px';
      tooltipEl.style.top = (e.clientY + 15) + 'px';
    });
    
    element.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
    });
  };
  
  const badge = document.getElementById(`${cardId}-badge`);
  if (badge) bindTooltip(badge);
  const successStatItem = card.querySelector('.success-val');
  if (successStatItem) bindTooltip(successStatItem);

  // Remove the immediate Chart.js initialization from card creation
  // It is now handled on-demand in the cardObserver when the card enters the viewport
}

function updateCardUI(target, status, latency, error, successRate, state) {
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const card = document.getElementById(cardId);
  if (!card) return;

  const badge = document.getElementById(`${cardId}-badge`);
  const latencyEl = document.getElementById(`${cardId}-latency`);
  const avgLatencyEl = document.getElementById(`${cardId}-avg-latency`);
  const maxLatencyEl = document.getElementById(`${cardId}-max-latency`);
  const successEl = document.getElementById(`${cardId}-success`);
  const sentEl = document.getElementById(`${cardId}-sent`);
  const receivedEl = document.getElementById(`${cardId}-received`);
  const statusTextEl = card.querySelector('.card-status-text');

  // Calculate Avg and Max latency
  const validLatencies = state.latencyHistory.filter(l => l !== null && l !== undefined);
  const avgLatency = validLatencies.length > 0 ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) : 0;
  const maxLatency = validLatencies.length > 0 ? Math.max(...validLatencies) : 0;

  // Update Status Class & Badge
  card.classList.remove('online', 'offline');
  badge.classList.remove('badge-online', 'badge-offline', 'badge-idle');

  if (status === 'online') {
    card.classList.add('online');
    badge.classList.add('badge-online');
    badge.textContent = 'Online';
    latencyEl.textContent = `${latency} ms`;
    statusTextEl.textContent = 'Responding normally';
  } else {
    card.classList.add('offline');
    badge.classList.add('badge-offline');
    badge.textContent = 'Offline';
    latencyEl.textContent = '--';
    statusTextEl.textContent = error || 'No response';
  }

  // Update Avg / Max UI
  avgLatencyEl.textContent = avgLatency ? `${avgLatency} ms` : '--';
  maxLatencyEl.textContent = maxLatency ? `${maxLatency} ms` : '--';

  // Stats
  successEl.textContent = `${successRate}%`;
  const failRate = (100 - parseFloat(successRate)).toFixed(1);
  const failEl = document.getElementById(`${cardId}-fail`);
  if (failEl) {
    failEl.textContent = `${failRate}%`;
  }
  sentEl.textContent = state.sent;
  receivedEl.textContent = state.received;

  // Update Sparkline Chart
  if (state.chart) {
    state.chart.data.datasets[0].data = [...state.latencyHistory];
    
    // Dynamically change chart border color based on status
    if (status === 'online') {
      state.chart.data.datasets[0].borderColor = '#10b981';
    } else {
      state.chart.data.datasets[0].borderColor = '#f43f5e';
    }
    
    // Only trigger heavy canvas rendering if the card is visible on screen!
    if (visibleCards.has(target)) {
      state.chart.update('none');
    }
  }

  // Hide the notice if the target is online
  const noticeEl = document.getElementById(`${cardId}-notice`);
  if (noticeEl && status === 'online') {
    noticeEl.style.display = 'none';
  }
}

function updateTerminalHeader(target, state) {
  const validLatencies = state.latencyHistory.filter(l => l !== null && l !== undefined);
  const avgLatency = validLatencies.length > 0 ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) : 0;
  const maxLatency = validLatencies.length > 0 ? Math.max(...validLatencies) : 0;
  
  const displayTitle = state.resolvedHostname ? `${target} (${state.resolvedHostname})` : target;
  
  document.getElementById('terminalTitle').innerHTML = `
    Live Ping Terminal &mdash; Monitored: <strong style="color: var(--accent-cyan);">${displayTitle}</strong> 
    (Avg: <span style="color: var(--accent-green);">${avgLatency}ms</span> | Max: <span style="color: var(--accent-red);">${maxLatency}ms</span>)
  `;
}

function updateGlobalStats() {
  const targets = Object.keys(targetStates);
  activeCount.textContent = targets.length;
}

function logToConsole(message, type = '') {
  const line = document.createElement('div');
  line.classList.add('console-line');
  if (type) line.classList.add(type);
  line.textContent = message;
  consoleBody.appendChild(line);

  // Auto scroll to bottom
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

// Handle Shutdown Button Click
const shutdownBtn = document.getElementById('shutdownBtn');
if (shutdownBtn) {
  shutdownBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to shutdown the Ping Monitor server?\n\nThis will stop all monitoring and close the server.')) {
      // Show shutdown overlay
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.background = 'rgba(5, 8, 12, 0.95)';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.zIndex = '99999';
      overlay.style.color = '#f3f4f6';
      overlay.style.fontFamily = 'var(--font-main)';
      
      // Add custom styles for the pulse animation if not exists
      if (!document.getElementById('shutdown-style')) {
        const style = document.createElement('style');
        style.id = 'shutdown-style';
        style.textContent = `
          @keyframes pulse-red {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }
      
      overlay.innerHTML = `
        <div style="text-align: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" style="width: 48px; height: 48px; margin-bottom: 16px; animation: pulse-red 2s infinite;">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>
          </svg>
          <h2 style="font-family: var(--font-title); font-size: 24px; margin-bottom: 8px;">Server Shutdown</h2>
          <p style="color: var(--text-secondary); font-size: 14px;">The Ping Monitor server has been stopped. You can now close this tab.</p>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      // Send shutdown request to server
      fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
    }
  });
}

// Bind active target addition events
if (addActiveTargetBtn) {
  addActiveTargetBtn.addEventListener('click', addTargetsToActiveSession);
}
if (activeTargetInput) {
  activeTargetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addTargetsToActiveSession();
    }
  });
}

// Function to add new targets dynamically during a running session
function addTargetsToActiveSession() {
  const inputText = activeTargetInput.value.trim();
  if (!inputText) return;

  // Split by comma, space, or newline
  const parsed = inputText.split(/[,\s\n]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (parsed.length === 0) return;

  // Filter out duplicates that are already being monitored
  const newTargets = parsed.filter(t => !targetStates[t]);

  if (newTargets.length > 0) {
    newTargets.forEach(target => {
      targetStates[target] = {
        sent: 0,
        received: 0,
        lost: 0,
        latencyHistory: [],
        chart: null,
        logs: [],
        lastOnlineTime: null,
        lastOfflineTime: null,
        resolvedHostname: null,
        resolvedIp: null,
        fallbackIp: null
      };
      createTargetCard(target);
    });

    socket.emit('add-targets', { targets: newTargets });
    updateGlobalStats();
    logToConsole(`[System] Dynamically added targets: ${newTargets.join(', ')}`, 'system');
  }

  activeTargetInput.value = '';
}

// Function to reset statistics, logs, and chart data for a specific target
function resetTargetStats(target) {
  const state = targetStates[target];
  if (!state) return;

  state.sent = 0;
  state.received = 0;
  state.lost = 0;
  state.latencyHistory = [];
  state.logs = [];
  state.lastOnlineTime = null;
  state.lastOfflineTime = null;

  // If there is a chart, clear its data
  if (state.chart) {
    state.chart.data.datasets[0].data = [];
    state.chart.update();
  }

  // Update Card UI to initial state
  const cardId = `card-${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  const latencyEl = document.getElementById(`${cardId}-latency`);
  if (latencyEl) latencyEl.textContent = '--';
  
  const avgLatencyEl = document.getElementById(`${cardId}-avg-latency`);
  if (avgLatencyEl) avgLatencyEl.textContent = '--';
  
  const maxLatencyEl = document.getElementById(`${cardId}-max-latency`);
  if (maxLatencyEl) maxLatencyEl.textContent = '--';
  
  const successEl = document.getElementById(`${cardId}-success`);
  if (successEl) successEl.textContent = '100%';
  
  const failEl = document.getElementById(`${cardId}-fail`);
  if (failEl) failEl.textContent = '0%';

  const receivedEl = document.getElementById(`${cardId}-received`);
  if (receivedEl) receivedEl.textContent = '0';
  
  const sentEl = document.getElementById(`${cardId}-sent`);
  if (sentEl) sentEl.textContent = '0';

  // Clear notice
  const noticeEl = document.getElementById(`${cardId}-notice`);
  if (noticeEl) {
    noticeEl.textContent = '';
    noticeEl.style.display = 'none';
  }

  // Clear console if this target is selected
  if (selectedTarget === target) {
    consoleBody.innerHTML = '';
    updateTerminalHeader(target, state);
  }

  logToConsole(`[System] Reset statistics for ${target}`, 'system');
}
