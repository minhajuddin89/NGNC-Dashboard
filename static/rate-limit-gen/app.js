/**
 * Huawei Bandwidth Rate-Limit & QoS Policy Generator
 * Supports:
 *   1. Huawei NetEngine 8000 (NE8000) Router - Interface CAR Policy (CIR x 125 CBS)
 *   2. Huawei CloudEngine / S6730 Switch - MQC Traffic Policy (CIR x 150 CBS / PBS)
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let state = {
        device: 'ne8000', // 'ne8000' | 's6730'
        mode: 'symmetric', // 'symmetric' | 'asymmetric'
        activeTab: 'standard', // 'standard' | 'interface' | 'rollback'
        bwValue: 100,
        bwUnit: 'Mbps',
        bwInValue: 100,
        bwInUnit: 'Mbps',
        bwOutValue: 100,
        bwOutUnit: 'Mbps',
        interfaceName: '',
        serviceDescription: '',
        includeInbound: true,
        includeOutbound: true,
        includeComments: false, // Default: false (Pure CLI commands without comments)
        aclName: 'BW-Limit-for-any 3991',
        customPolicyName: '',
        cirMultiplier: 1000, // 1 Mbps = 1000 Kbps
        cbsMultiplier: 125   // Default for NE8000 = 125, for S6730 = 150
    };

    // --- DOM Elements ---
    const deviceNE8000 = document.getElementById('deviceNE8000');
    const deviceS6730 = document.getElementById('deviceS6730');
    const s6730Options = document.getElementById('s6730Options');

    const tabSymmetric = document.getElementById('tabSymmetric');
    const tabAsymmetric = document.getElementById('tabAsymmetric');
    const symmetricGroup = document.getElementById('symmetricGroup');
    const asymmetricGroup = document.getElementById('asymmetricGroup');

    const inputBw = document.getElementById('inputBw');
    const selectBwUnit = document.getElementById('selectBwUnit');

    const inputBwIn = document.getElementById('inputBwIn');
    const selectBwInUnit = document.getElementById('selectBwInUnit');
    const inputBwOut = document.getElementById('inputBwOut');
    const selectBwOutUnit = document.getElementById('selectBwOutUnit');

    const inputInterface = document.getElementById('inputInterface');
    const inputDescription = document.getElementById('inputDescription');

    const inputAclName = document.getElementById('inputAclName');
    const inputPolicyName = document.getElementById('inputPolicyName');

    const checkInbound = document.getElementById('checkInbound');
    const checkOutbound = document.getElementById('checkOutbound');
    const checkComments = document.getElementById('checkComments');

    const inspectorTitle = document.getElementById('inspectorTitle');
    const metricCir = document.getElementById('metricCir');
    const metricCbs = document.getElementById('metricCbs');
    const metricDuration = document.getElementById('metricDuration');
    const formulaHintText = document.getElementById('formulaHintText');

    const terminalTitle = document.getElementById('terminalTitle');
    const terminalStatusText = document.getElementById('terminalStatusText');
    const codeDisplay = document.getElementById('codeDisplay');
    const btnCopy = document.getElementById('btnCopy');
    const btnDownload = document.getElementById('btnDownload');

    const presetChips = document.querySelectorAll('.preset-chip');
    const terminalTabs = document.querySelectorAll('.terminal-tab-btn');

    const accordionToggle = document.getElementById('accordionToggle');
    const advancedContent = document.getElementById('advancedContent');
    const inputCbsRatio = document.getElementById('inputCbsRatio');

    // --- Calculations ---
    function convertToMbps(val, unit) {
        val = parseFloat(val) || 0;
        if (unit === 'Gbps') return val * 1000;
        if (unit === 'Kbps') return val / 1000;
        return val; // Mbps
    }

    function calculateCar(bwMbps) {
        const cirKbps = Math.round(bwMbps * state.cirMultiplier);
        const cbsBytes = Math.round(cirKbps * state.cbsMultiplier);
        return {
            bwMbps,
            cirKbps,
            pirKbps: cirKbps,
            cbsBytes,
            pbsBytes: cbsBytes
        };
    }

    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function getPolicyName(rateVal, rateUnit, suffix = '') {
        if (state.customPolicyName.trim()) {
            return suffix ? `${state.customPolicyName.trim()}-${suffix}` : state.customPolicyName.trim();
        }
        return `BW-${rateVal}${rateUnit}${suffix ? '-' + suffix : ''}`;
    }

    // --- Syntax Highlighting Formatter ---
    function highlightScript(text) {
        const lines = text.split('\n');
        return lines.map(line => {
            // Comment lines
            if (line.trim().startsWith('#')) {
                return `<span class="syn-comment">${escapeHtml(line)}</span>`;
            }
            // S6730 Undo MQC commands
            if (line.includes('undo traffic') || line.includes('undo classifier') || line.includes('undo acl')) {
                return line.replace(/(undo\s+traffic-policy|undo\s+traffic\s+policy|undo\s+traffic\s+behavior|undo\s+traffic\s+classifier|undo\s+classifier|undo\s+acl)/g, '<span class="syn-undo">$1</span>')
                           .replace(/(inbound|outbound)/g, '<span class="syn-dir">$1</span>');
            }
            // S6730 MQC Traffic Behavior Line
            if (line.includes('car cir ') && line.includes('color-blind')) {
                return line.replace(/(car)/g, '<span class="syn-cmd">$1</span>')
                           .replace(/(cir|pir|cbs|pbs)/g, '<span class="syn-param">$1</span>')
                           .replace(/(\b\d+\b)/g, '<span class="syn-num">$1</span>')
                           .replace(/(mode\s+color-blind)/g, '<span class="syn-iface">$1</span>')
                           .replace(/(green\s+pass|yellow\s+pass)/g, '<span class="syn-dir">$1</span>')
                           .replace(/(red\s+discard)/g, '<span class="syn-undo">$1</span>');
            }
            // S6730 MQC Keywords
            if (line.includes('traffic classifier') || line.includes('traffic behavior') || line.includes('traffic policy') || line.includes('traffic-policy')) {
                return line.replace(/(traffic\s+classifier|traffic\s+behavior|traffic\s+policy|traffic-policy)/g, '<span class="syn-cmd">$1</span>')
                           .replace(/(operator\s+or|if-match\s+acl|match-order\s+config|classifier|behavior)/g, '<span class="syn-param">$1</span>')
                           .replace(/(inbound|outbound)/g, '<span class="syn-dir">$1</span>');
            }
            // ACL Keywords
            if (line.includes('acl name') || line.includes('rule 5 permit ip')) {
                return line.replace(/(acl\s+name|acl)/g, '<span class="syn-cmd">$1</span>')
                           .replace(/(rule\s+\d+\s+permit\s+ip)/g, '<span class="syn-dir">$1</span>');
            }
            // NE8000 undo qos car
            if (line.includes('undo qos car')) {
                return line.replace(/(undo qos car)/g, '<span class="syn-undo">$1</span>')
                           .replace(/(inbound|outbound)/g, '<span class="syn-dir">$1</span>');
            }
            // NE8000 qos car commands
            if (line.includes('qos car')) {
                return line.replace(/(qos car)/g, '<span class="syn-cmd">$1</span>')
                           .replace(/(cir|cbs)/g, '<span class="syn-param">$1</span>')
                           .replace(/(\b\d+\b)/g, '<span class="syn-num">$1</span>')
                           .replace(/(inbound|outbound)/g, '<span class="syn-dir">$1</span>');
            }
            // Interface and system keywords
            if (line.trim().startsWith('interface ')) {
                return line.replace(/(interface\s+)([\w\/\.\-]+)/g, '<span class="syn-param">$1</span><span class="syn-iface">$2</span>');
            }
            if (line.trim().startsWith('description ')) {
                return line.replace(/(description\s+)(.*)/g, '<span class="syn-param">$1</span><span class="syn-comment">$2</span>');
            }
            if (['system-view', 'commit', 'return', 'quit'].includes(line.trim())) {
                return `<span class="syn-cmd">${escapeHtml(line)}</span>`;
            }
            return escapeHtml(line);
        }).join('\n');
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // --- Core Script Generator ---
    function generateScript() {
        let inData, outData;

        if (state.mode === 'symmetric') {
            const mbps = convertToMbps(state.bwValue, state.bwUnit);
            inData = calculateCar(mbps);
            outData = inData;
        } else {
            const inMbps = convertToMbps(state.bwInValue, state.bwInUnit);
            const outMbps = convertToMbps(state.bwOutValue, state.bwOutUnit);
            inData = calculateCar(inMbps);
            outData = calculateCar(outMbps);
        }

        // Update Metrics Inspector
        metricCir.textContent = `${formatNumber(inData.cirKbps)} Kbps`;
        metricCbs.textContent = `${formatNumber(inData.cbsBytes)} Bytes`;
        const bufferSec = (state.cbsMultiplier * 8 / 1000).toFixed(2);
        metricDuration.textContent = `${bufferSec}s buffer`;

        const iface = state.interfaceName.trim();
        const desc = state.serviceDescription.trim();
        const hasIface = iface.length > 0;
        const acl = state.aclName.trim() || 'BW-Limit-for-any 3991';
        const withComments = state.includeComments;

        let script = '';

        if (state.device === 'ne8000') {
            // =========================================================================
            // HUAWEI NE8000 ROUTER (Interface CAR)
            // =========================================================================
            if (state.activeTab === 'rollback') {
                if (withComments) {
                    script += `# ==========================================================================\n`;
                    script += `# Huawei NE8000 Rate-Limit Rollback / Removal Script\n`;
                    if (hasIface) script += `# Target Interface: ${iface}\n`;
                    script += `# Generated: ${new Date().toLocaleString()}\n`;
                    script += `# ==========================================================================\n\n`;
                }

                if (hasIface) {
                    script += `system-view\n`;
                    script += `interface ${iface}\n`;
                    if (state.includeInbound) script += ` undo qos car inbound\n`;
                    if (state.includeOutbound) script += ` undo qos car outbound\n`;
                    script += `commit\n`;
                    script += `return\n`;
                } else {
                    if (state.includeInbound) script += `undo qos car inbound\n`;
                    if (state.includeOutbound) script += `undo qos car outbound\n`;
                }

            } else if (state.activeTab === 'interface') {
                if (withComments) {
                    script += `# ==========================================================================\n`;
                    script += `# Huawei NE8000 Complete Interface Rate-Limit Configuration\n`;
                    script += `# Bandwidth: ${state.mode === 'symmetric' ? `${state.bwValue} ${state.bwUnit}` : `In: ${state.bwInValue} ${state.bwInUnit} | Out: ${state.bwOutValue} ${state.bwOutUnit}`}\n`;
                    script += `# ==========================================================================\n\n`;
                }

                script += `system-view\n`;
                script += `interface ${hasIface ? iface : 'GigabitEthernet0/1/0.100'}\n`;
                if (desc) {
                    script += ` description ${desc}\n`;
                }
                if (state.includeInbound) {
                    script += ` qos car cir ${inData.cirKbps} cbs ${inData.cbsBytes} inbound\n`;
                }
                if (state.includeOutbound) {
                    script += ` qos car cir ${outData.cirKbps} cbs ${outData.cbsBytes} outbound\n`;
                }
                script += `commit\n`;
                script += `return\n`;

            } else {
                // Standard Config
                if (withComments) {
                    script += `# ==========================================================================\n`;
                    script += `# Huawei NE8000 CAR Rate-Limit Policy Configuration\n`;
                    script += `# Bandwidth: ${state.mode === 'symmetric' ? `${state.bwValue} ${state.bwUnit}` : `In: ${state.bwInValue} ${state.bwInUnit} | Out: ${state.bwOutValue} ${state.bwOutUnit}`}\n`;
                    script += `# Ratio: CIR = BW * 1000 Kbps | CBS = CIR * ${state.cbsMultiplier} Bytes\n`;
                    if (hasIface) script += `# Target Interface: ${iface}\n`;
                    script += `# ==========================================================================\n\n`;
                }

                if (hasIface) {
                    script += `system-view\n`;
                    script += `interface ${iface}\n`;
                    if (desc) script += ` description ${desc}\n`;
                    if (state.includeInbound) script += ` qos car cir ${inData.cirKbps} cbs ${inData.cbsBytes} inbound\n`;
                    if (state.includeOutbound) script += ` qos car cir ${outData.cirKbps} cbs ${outData.cbsBytes} outbound\n`;
                    script += `commit\n`;
                    script += `return\n`;
                } else {
                    if (state.includeInbound) script += `qos car cir ${inData.cirKbps} cbs ${inData.cbsBytes} inbound\n`;
                    if (state.includeOutbound) script += `qos car cir ${outData.cirKbps} cbs ${outData.cbsBytes} outbound\n`;
                }
            }

        } else {
            // =========================================================================
            // HUAWEI S6730 SWITCH (MQC Traffic Policy)
            // =========================================================================
            const isSymmetric = state.mode === 'symmetric';
            const policyNameMain = getPolicyName(state.bwValue, state.bwUnit);
            const policyNameIn = isSymmetric ? policyNameMain : getPolicyName(state.bwInValue, state.bwInUnit, 'IN');
            const policyNameOut = isSymmetric ? policyNameMain : getPolicyName(state.bwOutValue, state.bwOutUnit, 'OUT');

            if (state.activeTab === 'rollback') {
                if (withComments) {
                    script += `# ==========================================================================\n`;
                    script += `# Huawei S6730 Rate-Limit Rollback / Removal Script\n`;
                    if (hasIface) script += `# Target Interface: ${iface}\n`;
                    script += `# Policy: ${isSymmetric ? policyNameMain : `${policyNameIn} / ${policyNameOut}`}\n`;
                    script += `# Generated: ${new Date().toLocaleString()}\n`;
                    script += `# ==========================================================================\n\n`;
                }

                script += `system-view\n`;
                if (hasIface) {
                    script += `interface ${iface}\n`;
                    if (state.includeInbound) script += ` undo traffic-policy inbound\n`;
                    if (state.includeOutbound) script += ` undo traffic-policy outbound\n`;
                    script += `quit\n\n`;
                } else {
                    if (state.includeInbound) script += `undo traffic-policy inbound\n`;
                    if (state.includeOutbound) script += `undo traffic-policy outbound\n\n`;
                }

                if (withComments) {
                    script += `# --- Delete MQC Traffic Policy Definitions ---\n`;
                }

                if (isSymmetric) {
                    script += `traffic policy ${policyNameMain}\n`;
                    script += ` undo classifier ${policyNameMain}\n`;
                    script += `quit\n`;
                    script += `undo traffic policy ${policyNameMain}\n`;
                    script += `undo traffic behavior ${policyNameMain}\n`;
                    script += `undo traffic classifier ${policyNameMain}\n`;
                } else {
                    if (state.includeInbound) {
                        script += `traffic policy ${policyNameIn}\n undo classifier ${policyNameIn}\nquit\n`;
                        script += `undo traffic policy ${policyNameIn}\nundo traffic behavior ${policyNameIn}\nundo traffic classifier ${policyNameIn}\n`;
                    }
                    if (state.includeOutbound) {
                        script += `traffic policy ${policyNameOut}\n undo classifier ${policyNameOut}\nquit\n`;
                        script += `undo traffic policy ${policyNameOut}\nundo traffic behavior ${policyNameOut}\nundo traffic classifier ${policyNameOut}\n`;
                    }
                }
                script += `return\n`;

            } else if (state.activeTab === 'interface') {
                if (withComments) {
                    script += `# ==========================================================================\n`;
                    script += `# Huawei S6730 Complete Interface Application Block\n`;
                    script += `# Target Interface: ${hasIface ? iface : 'GigabitEthernet0/0/1'}\n`;
                    script += `# ==========================================================================\n\n`;
                }

                script += `system-view\n`;
                script += `interface ${hasIface ? iface : 'GigabitEthernet0/0/1'}\n`;
                if (desc) script += ` description ${desc}\n`;
                if (state.includeInbound) {
                    script += ` traffic-policy ${policyNameIn} inbound\n`;
                }
                if (state.includeOutbound) {
                    script += ` traffic-policy ${policyNameOut} outbound\n`;
                }
                script += `quit\n`;
                script += `return\n`;

            } else {
                // Standard S6730 MQC Script
                if (withComments) {
                    script += `# ==========================================================================\n`;
                    script += `# Huawei S6730 MQC Bandwidth Rate-Limit Configuration\n`;
                    script += `# Rate: ${isSymmetric ? `${state.bwValue} ${state.bwUnit}` : `In: ${state.bwInValue} ${state.bwInUnit} | Out: ${state.bwOutValue} ${state.bwOutUnit}`}\n`;
                    script += `# CIR = PIR = ${inData.cirKbps} Kbps | CBS = PBS = ${inData.cbsBytes} Bytes\n`;
                    if (hasIface) script += `# Target Interface: ${iface}\n`;
                    script += `# ==========================================================================\n\n`;
                }

                script += `system-view\n\n`;

                // 1. ACL Definition
                if (withComments) script += `# 1. Define Advanced ACL\n`;
                script += `acl name ${acl}\n`;
                script += ` rule 5 permit ip\n`;
                script += `quit\n\n`;

                // 2. Classifiers & Behaviors
                if (isSymmetric) {
                    if (withComments) script += `# 2. Define Traffic Classifier\n`;
                    script += `traffic classifier ${policyNameMain} operator or\n`;
                    script += ` if-match acl ${acl.split(' ')[0]}\n`;
                    script += `quit\n\n`;

                    if (withComments) script += `# 3. Define Traffic Behavior with Color-Blind CAR\n`;
                    script += `traffic behavior ${policyNameMain}\n`;
                    script += ` car cir ${inData.cirKbps} pir ${inData.pirKbps} cbs ${inData.cbsBytes} pbs ${inData.pbsBytes} mode color-blind green pass yellow pass red discard\n`;
                    script += `quit\n\n`;

                    if (withComments) script += `# 4. Define Traffic Policy\n`;
                    script += `traffic policy ${policyNameMain} match-order config\n`;
                    script += ` classifier ${policyNameMain} behavior ${policyNameMain}\n`;
                    script += `quit\n\n`;

                    if (withComments) script += `# 5. Apply Traffic Policy to Interface\n`;
                    if (hasIface) {
                        script += `interface ${iface}\n`;
                        if (desc) script += ` description ${desc}\n`;
                        if (state.includeInbound) script += ` traffic-policy ${policyNameMain} inbound\n`;
                        if (state.includeOutbound) script += ` traffic-policy ${policyNameMain} outbound\n`;
                        script += `quit\n`;
                    } else {
                        if (state.includeInbound) script += `traffic-policy ${policyNameMain} inbound\n`;
                        if (state.includeOutbound) script += `traffic-policy ${policyNameMain} outbound\n`;
                    }
                } else {
                    // Asymmetric S6730 Policy
                    if (state.includeInbound) {
                        if (withComments) script += `# 2A. Inbound Classifier & Behavior (${state.bwInValue} ${state.bwInUnit})\n`;
                        script += `traffic classifier ${policyNameIn} operator or\n if-match acl ${acl.split(' ')[0]}\nquit\n\n`;
                        script += `traffic behavior ${policyNameIn}\n car cir ${inData.cirKbps} pir ${inData.pirKbps} cbs ${inData.cbsBytes} pbs ${inData.pbsBytes} mode color-blind green pass yellow pass red discard\nquit\n\n`;
                        script += `traffic policy ${policyNameIn} match-order config\n classifier ${policyNameIn} behavior ${policyNameIn}\nquit\n\n`;
                    }
                    if (state.includeOutbound) {
                        if (withComments) script += `# 2B. Outbound Classifier & Behavior (${state.bwOutValue} ${state.bwOutUnit})\n`;
                        script += `traffic classifier ${policyNameOut} operator or\n if-match acl ${acl.split(' ')[0]}\nquit\n\n`;
                        script += `traffic behavior ${policyNameOut}\n car cir ${outData.cirKbps} pir ${outData.pirKbps} cbs ${outData.cbsBytes} pbs ${outData.pbsBytes} mode color-blind green pass yellow pass red discard\nquit\n\n`;
                        script += `traffic policy ${policyNameOut} match-order config\n classifier ${policyNameOut} behavior ${policyNameOut}\nquit\n\n`;
                    }

                    if (withComments) script += `# 3. Apply Traffic Policies to Interface\n`;
                    if (hasIface) {
                        script += `interface ${iface}\n`;
                        if (desc) script += ` description ${desc}\n`;
                        if (state.includeInbound) script += ` traffic-policy ${policyNameIn} inbound\n`;
                        if (state.includeOutbound) script += ` traffic-policy ${policyNameOut} outbound\n`;
                        script += `quit\n`;
                    } else {
                        if (state.includeInbound) script += `traffic-policy ${policyNameIn} inbound\n`;
                        if (state.includeOutbound) script += `traffic-policy ${policyNameOut} outbound\n`;
                    }
                }

                script += `return\n`;
            }
        }

        // Clean up multi-empty lines if comments are disabled
        let cleanText = script;
        if (!withComments) {
            cleanText = cleanText.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
            cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim() + '\n';
        }

        // Render plain text into dataset for copying/downloading
        codeDisplay.dataset.plainCode = cleanText;
        // Render highlighted HTML
        codeDisplay.innerHTML = highlightScript(cleanText);
    }

    // --- Device Switching ---
    function setDevice(deviceType) {
        state.device = deviceType;

        if (deviceType === 'ne8000') {
            deviceNE8000.classList.add('active');
            deviceS6730.classList.remove('active');
            s6730Options.style.display = 'none';

            state.cbsMultiplier = 125;
            inputCbsRatio.value = 125;
            inspectorTitle.textContent = 'Calculated CAR Parameters (NE8000)';
            formulaHintText.textContent = 'CIR = BW(Mbps) × 1000 | CBS = CIR × 125 Bytes';
            terminalTitle.textContent = 'HUAWEI_NE8000_VRP:~# script_output.cfg';
            terminalStatusText.textContent = 'Ready to apply to Huawei NetEngine 8000 CLI';

        } else {
            deviceS6730.classList.add('active');
            deviceNE8000.classList.remove('active');
            s6730Options.style.display = 'block';

            state.cbsMultiplier = 150;
            inputCbsRatio.value = 150;
            inspectorTitle.textContent = 'Calculated MQC CAR Parameters (S6730)';
            formulaHintText.textContent = 'CIR = PIR = BW(Mbps) × 1000 | CBS = PBS = CIR × 150 Bytes';
            terminalTitle.textContent = 'HUAWEI_S6730_VRP:~# traffic_policy.cfg';
            terminalStatusText.textContent = 'Ready to apply to Huawei S6730 Switch CLI';
        }

        generateScript();
        if (window.lucide) window.lucide.createIcons();
    }

    deviceNE8000.addEventListener('click', () => setDevice('ne8000'));
    deviceS6730.addEventListener('click', () => setDevice('s6730'));

    // --- Toast Notification ---
    function showToast(message) {
        const existing = document.querySelector('.toast-msg');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.innerHTML = `<i data-lucide="check-circle" style="width: 18px; height: 18px;"></i> <span>${message}</span>`;
        document.body.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();

        setTimeout(() => {
            toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 2200);
    }

    // --- Event Listeners ---

    // Comments Toggle Checkbox
    if (checkComments) {
        checkComments.checked = state.includeComments;
        checkComments.addEventListener('change', () => {
            state.includeComments = checkComments.checked;
            generateScript();
        });
    }

    // Symmetric / Asymmetric Mode Tabs
    tabSymmetric.addEventListener('click', () => {
        state.mode = 'symmetric';
        tabSymmetric.classList.add('active');
        tabAsymmetric.classList.remove('active');
        symmetricGroup.style.display = 'block';
        asymmetricGroup.style.display = 'none';
        generateScript();
    });

    tabAsymmetric.addEventListener('click', () => {
        state.mode = 'asymmetric';
        tabAsymmetric.classList.add('active');
        tabSymmetric.classList.remove('active');
        symmetricGroup.style.display = 'none';
        asymmetricGroup.style.display = 'block';
        generateScript();
    });

    // Preset Chips
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const mbps = parseFloat(chip.getAttribute('data-bw'));
            state.bwValue = mbps;
            state.bwUnit = 'Mbps';
            inputBw.value = mbps;
            selectBwUnit.value = 'Mbps';

            state.bwInValue = mbps;
            state.bwInUnit = 'Mbps';
            inputBwIn.value = mbps;
            selectBwInUnit.value = 'Mbps';

            state.bwOutValue = mbps;
            state.bwOutUnit = 'Mbps';
            inputBwOut.value = mbps;
            selectBwOutUnit.value = 'Mbps';

            generateScript();
        });
    });

    // Inputs Change Listeners
    inputBw.addEventListener('input', () => {
        state.bwValue = parseFloat(inputBw.value) || 0;
        presetChips.forEach(c => c.classList.remove('active'));
        generateScript();
    });

    selectBwUnit.addEventListener('change', () => {
        state.bwUnit = selectBwUnit.value;
        generateScript();
    });

    inputBwIn.addEventListener('input', () => {
        state.bwInValue = parseFloat(inputBwIn.value) || 0;
        generateScript();
    });

    selectBwInUnit.addEventListener('change', () => {
        state.bwInUnit = selectBwInUnit.value;
        generateScript();
    });

    inputBwOut.addEventListener('input', () => {
        state.bwOutValue = parseFloat(inputBwOut.value) || 0;
        generateScript();
    });

    selectBwOutUnit.addEventListener('change', () => {
        state.bwOutUnit = selectBwOutUnit.value;
        generateScript();
    });

    inputInterface.addEventListener('input', () => {
        state.interfaceName = inputInterface.value;
        generateScript();
    });

    inputDescription.addEventListener('input', () => {
        state.serviceDescription = inputDescription.value;
        generateScript();
    });

    inputAclName.addEventListener('input', () => {
        state.aclName = inputAclName.value;
        generateScript();
    });

    inputPolicyName.addEventListener('input', () => {
        state.customPolicyName = inputPolicyName.value;
        generateScript();
    });

    checkInbound.addEventListener('change', () => {
        state.includeInbound = checkInbound.checked;
        checkInbound.closest('.checkbox-card').classList.toggle('checked', checkInbound.checked);
        generateScript();
    });

    checkOutbound.addEventListener('change', () => {
        state.includeOutbound = checkOutbound.checked;
        checkOutbound.closest('.checkbox-card').classList.toggle('checked', checkOutbound.checked);
        generateScript();
    });

    // Terminal Tabs
    terminalTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            terminalTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeTab = tab.getAttribute('data-tab');
            generateScript();
        });
    });

    // Accordion Toggle for Advanced Settings
    accordionToggle.addEventListener('click', () => {
        advancedContent.classList.toggle('open');
        const icon = accordionToggle.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', advancedContent.classList.contains('open') ? 'chevron-up' : 'chevron-down');
            if (window.lucide) window.lucide.createIcons();
        }
    });

    inputCbsRatio.addEventListener('input', () => {
        const val = parseFloat(inputCbsRatio.value) || (state.device === 'ne8000' ? 125 : 150);
        state.cbsMultiplier = val;
        generateScript();
    });

    // Copy to Clipboard (Copies Clean CLI Commands Without Comments)
    btnCopy.addEventListener('click', async () => {
        let plainText = codeDisplay.dataset.plainCode || codeDisplay.innerText;
        
        // Strip out any comment lines (#) to guarantee 100% clean CLI execution
        if (!state.includeComments) {
            plainText = plainText
                .split('\n')
                .filter(line => !line.trim().startsWith('#'))
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        try {
            await navigator.clipboard.writeText(plainText);
            showToast('Clean CLI commands copied (no comments)!');
            const origHtml = btnCopy.innerHTML;
            btnCopy.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px;"></i> Copied!`;
            if (window.lucide) window.lucide.createIcons();
            setTimeout(() => {
                btnCopy.innerHTML = origHtml;
                if (window.lucide) window.lucide.createIcons();
            }, 1800);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast('Failed to copy to clipboard.');
        }
    });

    // Download Script File (.cfg)
    btnDownload.addEventListener('click', () => {
        const plainText = codeDisplay.dataset.plainCode || codeDisplay.innerText;
        const filename = `${state.device}_ratelimit_${state.bwValue}${state.bwUnit.toLowerCase()}_${state.activeTab}.cfg`;
        const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Downloaded: ${filename}`);
    });

    // Initial render
    generateScript();
    if (window.lucide) window.lucide.createIcons();
});
