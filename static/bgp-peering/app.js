// BGP Peering Config Generator Logic - Simplified Mapping Mode

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Views
    const inputView = document.getElementById('input-view');
    const resultView = document.getElementById('result-view');
    
    // DOM Elements - Navigation Buttons
    const btnGenerate = document.getElementById('btn-generate');
    const btnBack = document.getElementById('btn-back');
    const btnLoadDemo = document.getElementById('btn-load-demo');

    // DOM Elements - Inputs
    const clientNameInput = document.getElementById('client-name');
    const clientAsnInput = document.getElementById('client-asn');
    const ispAsnInput = document.getElementById('isp-asn');
    const clientPrefixInput = document.getElementById('client-prefix');
    const clientCidrSelect = document.getElementById('client-cidr');
    const clientGatewayInput = document.getElementById('client-gateway');
    
    // R1 Peering Link Inputs
    const r1DeviceSelect = document.getElementById('r1-device-select');
    const r1VlanInput = document.getElementById('r1-vlan');
    const r1IspIfInput = document.getElementById('r1-isp-if');
    const r1ClientPortInput = document.getElementById('r1-client-port');
    const r1IspIpInput = document.getElementById('r1-isp-ip');
    const r1ClientIpInput = document.getElementById('r1-client-ip');
    const r1NetIpInput = document.getElementById('r1-net-ip');
    
    // R2 Peering Link Inputs
    const r2DeviceSelect = document.getElementById('r2-device-select');
    const r2VlanInput = document.getElementById('r2-vlan');
    const r2IspIfInput = document.getElementById('r2-isp-if');
    const r2ClientPortInput = document.getElementById('r2-client-port');
    const r2IspIpInput = document.getElementById('r2-isp-ip');
    const r2ClientIpInput = document.getElementById('r2-client-ip');
    const r2NetIpInput = document.getElementById('r2-net-ip');
    
    // Client and Strategy
    const clientDeviceSelect = document.getElementById('client-device-select');
    const clientLanPortInput = document.getElementById('client-lan-port');
    const peeringStrategySelect = document.getElementById('peering-strategy');
    const r1PrefValInput = document.getElementById('r1-pref-val');
    const r2PrefValInput = document.getElementById('r2-pref-val');
    const backupDetailsDiv = document.getElementById('backup-details');

    // Result Card Elements
    const cardR1 = document.getElementById('card-r1');
    const cardR2 = document.getElementById('card-r2');
    const cardClient = document.getElementById('card-client');

    // Device display labels
    const deviceLabels = {
        'ros6': 'MikroTik RouterOS v6',
        'ros7': 'MikroTik RouterOS v7',
        'huawei': 'Huawei VRP',
        'cisco': 'Cisco IOS-XE',
        'juniper': 'Juniper Junos'
    };

    // Load Demo Data Action
    btnLoadDemo.addEventListener('click', () => {
        clientNameInput.value = "Brandix Bangladesh Limited. (U3)";
        clientAsnInput.value = "65448";
        ispAsnInput.value = "23688";
        clientPrefixInput.value = "123.200.18.192";
        clientCidrSelect.value = "30";
        clientGatewayInput.value = "123.200.18.193";
        
        r1DeviceSelect.value = "ros6";
        r1VlanInput.value = "2512";
        r1IspIfInput.value = "ether1_Link3_Data";
        r1ClientPortInput.value = "ether1";
        r1IspIpInput.value = "10.248.69.145";
        r1ClientIpInput.value = "10.248.69.146";
        r1NetIpInput.value = "10.248.69.144";
        
        r2DeviceSelect.value = "ros6";
        r2VlanInput.value = "503";
        r2IspIfInput.value = "ether3";
        r2ClientPortInput.value = "ether5";
        r2IspIpInput.value = "10.248.69.149";
        r2ClientIpInput.value = "10.248.69.150";
        r2NetIpInput.value = "10.248.69.148";
        
        clientDeviceSelect.value = "ros6";
        clientLanPortInput.value = "ether4-LAN";
        peeringStrategySelect.value = "active-backup-r1"; // R1 Primary, R2 Backup
        r1PrefValInput.value = "120";
        r2PrefValInput.value = "100";
        
        toggleStrategyDependencies();
    });

    // Strategy Change Toggle
    peeringStrategySelect.addEventListener('change', toggleStrategyDependencies);

    function toggleStrategyDependencies() {
        const strategy = peeringStrategySelect.value;
        if (strategy === 'active-active') {
            backupDetailsDiv.classList.remove('active');
        } else {
            backupDetailsDiv.classList.add('active');
        }
    }

    // --- NAVIGATION ACTIONS ---
    
    // Page transition: Entry to Output View
    btnGenerate.addEventListener('click', () => {
        // Run config generation first
        generateAllConfigs();
        
        // Dynamic Title on Results Page
        document.getElementById('result-client-title').textContent = 
            `BGP Configuration - ${clientNameInput.value || 'Client'}`;
        
        // Hide Entry Page, show Results Page
        inputView.classList.remove('active');
        setTimeout(() => {
            inputView.classList.add('hidden');
            resultView.classList.remove('hidden');
            setTimeout(() => {
                resultView.classList.add('active');
            }, 50);
        }, 200);
    });

    // Page transition: Back to Entry Page
    btnBack.addEventListener('click', () => {
        resultView.classList.remove('active');
        setTimeout(() => {
            resultView.classList.add('hidden');
            inputView.classList.remove('hidden');
            setTimeout(() => {
                inputView.classList.add('active');
            }, 50);
        }, 200);
    });

    // Helper functions for configuration templates
    function sanitize(str) {
        return str.replace(/[^a-zA-Z0-9-_\.]/g, '_');
    }

    function getSubnetMask(cidr) {
        const masks = {
            24: '255.255.255.0',
            25: '255.255.255.128',
            26: '255.255.255.192',
            27: '255.255.255.224',
            28: '255.255.255.240',
            29: '255.255.255.248',
            30: '255.255.255.252',
            32: '255.255.255.255'
        };
        return masks[cidr] || '255.255.255.252';
    }

    function updateFilenameAndLabel(role, deviceType) {
        const labelEl = document.getElementById(`${role}-device-label`);
        const fileEl = document.getElementById(`${role}-filename`);
        
        if (deviceType === 'none') return;
        
        labelEl.textContent = deviceLabels[deviceType];
        
        let ext = 'rsc';
        if (deviceType === 'huawei' || deviceType === 'cisco') ext = 'cfg';
        else if (deviceType === 'juniper') ext = 'txt';
        
        fileEl.textContent = `${role}-bgp-peering.${ext}`;
    }

    // ---- GENERATOR ENGINE ----

    function generateAllConfigs() {
        const clientName = clientNameInput.value || "Client";
        const clientNameSafe = sanitize(clientName);
        const clientAsn = clientAsnInput.value || "65448";
        const ispAsn = ispAsnInput.value || "23688";
        const clientPrefix = clientPrefixInput.value || "123.200.18.192";
        const clientCidr = clientCidrSelect.value || "30";
        const clientGateway = clientGatewayInput.value || "123.200.18.193";
        
        const r1Device = r1DeviceSelect.value;
        const r1Vlan = r1VlanInput.value || "2512";
        const r1IspIf = r1IspIfInput.value || "ether1_Link3_Data";
        const r1ClientPort = r1ClientPortInput.value || "ether1";
        const r1IspIp = r1IspIpInput.value || "10.248.69.145";
        const r1ClientIp = r1ClientIpInput.value || "10.248.69.146";
        const r1NetIp = r1NetIpInput.value || "10.248.69.144";
        
        const r2Device = r2DeviceSelect.value;
        const r2Vlan = r2VlanInput.value || "503";
        const r2IspIf = r2IspIfInput.value || "ether3";
        const r2ClientPort = r2ClientPortInput.value || "ether5";
        const r2IspIp = r2IspIpInput.value || "10.248.69.149";
        const r2ClientIp = r2ClientIpInput.value || "10.248.69.150";
        const r2NetIp = r2NetIpInput.value || "10.248.69.148";

        const clientDevice = clientDeviceSelect.value;
        const clientLanPort = clientLanPortInput.value || "ether4-LAN";
        const strategy = peeringStrategySelect.value;
        const r1PrefVal = parseInt(r1PrefValInput.value) || 120;
        const r2PrefVal = parseInt(r2PrefValInput.value) || 100;

        // 1. Generate ISP R1
        if (r1Device === 'none') {
            cardR1.classList.add('hidden');
        } else {
            cardR1.classList.remove('hidden');
            updateFilenameAndLabel('r1', r1Device);
            const r1Code = generateIspRouterConfig(1, r1Device, {
                clientName, clientNameSafe, clientAsn, ispAsn, clientPrefix, clientCidr,
                vlan: r1Vlan, physIf: r1IspIf, ispIp: r1IspIp, clientIp: r1ClientIp, netIp: r1NetIp,
                strategy, r1PrefVal, r2PrefVal
            });
            document.getElementById('r1-code').textContent = r1Code;
        }

        // 2. Generate ISP R2
        if (r2Device === 'none') {
            cardR2.classList.add('hidden');
        } else {
            cardR2.classList.remove('hidden');
            updateFilenameAndLabel('r2', r2Device);
            const r2Code = generateIspRouterConfig(2, r2Device, {
                clientName, clientNameSafe, clientAsn, ispAsn, clientPrefix, clientCidr,
                vlan: r2Vlan, physIf: r2IspIf, ispIp: r2IspIp, clientIp: r2ClientIp, netIp: r2NetIp,
                strategy, r1PrefVal, r2PrefVal
            });
            document.getElementById('r2-code').textContent = r2Code;
        }

        // 3. Generate Client Router (CE)
        if (clientDevice === 'none') {
            cardClient.classList.add('hidden');
        } else {
            cardClient.classList.remove('hidden');
            updateFilenameAndLabel('client', clientDevice);
            const clientCode = generateClientRouterConfig(clientDevice, {
                clientName, clientNameSafe, clientAsn, ispAsn, clientPrefix, clientCidr, clientGateway,
                r1Vlan, r1IspIp, r1ClientIp, r1NetIp, r1ClientPort,
                r2Vlan, r2IspIp, r2ClientIp, r2NetIp, r2ClientPort,
                clientLanPort, strategy, r1PrefVal, r2PrefVal
            });
            document.getElementById('client-code').textContent = clientCode;
        }
    }

    // ISP ROUTER CONFIG GENERATOR (R1 or R2)
    function generateIspRouterConfig(routerNum, device, data) {
        const isR1 = (routerNum === 1);
        const linkName = isR1 ? "Primary" : "Secondary";
        
        if (device === 'ros7') {
            return `# ISP Router ${routerNum} (${linkName} Link) - MikroTik RouterOS v7 Configuration
# Client: ${data.clientName} (ASN: ${data.clientAsn})

# 1. Interface & VLAN Configuration
/interface vlan
add interface=${data.physIf} name=vlan${data.vlan}-${data.clientNameSafe}-${linkName} vlan-id=${data.vlan} comment="Link to ${data.clientName} (${linkName})"

# 2. IP Address Configuration
/ip address
add address=${data.ispIp}/30 interface=vlan${data.vlan}-${data.clientNameSafe}-${linkName} comment="BGP Peering with ${data.clientName}"

# 3. BGP Filter Configuration (Accept Client Block, Send Default Route)
/routing filter rule
add chain=${data.clientNameSafe}-IN disabled=no rule="if (dst in ${data.clientPrefix}/${data.clientCidr}) {accept}" comment="Accept Client Prefix"
add chain=${data.clientNameSafe}-IN disabled=no rule="if (dst-len in 0-128) {reject;}" comment="Reject all other prefixes"
add chain=${data.clientNameSafe}-OUT disabled=no rule="if (dst == 0.0.0.0/0) {accept}" comment="Send Default Route"
add chain=${data.clientNameSafe}-OUT disabled=no rule="if (dst-len in 0-128) {reject;}" comment="Reject all other prefixes"

# 4. BGP Connection Configuration
/routing bgp connection
add as=${data.ispAsn} disabled=no input.filter=${data.clientNameSafe}-IN local.role=ebgp name=${data.clientNameSafe}-${linkName} \\
    nexthop-choice=default output.default-originate=if-installed .filter-chain=${data.clientNameSafe}-OUT \\
    remote.address=${data.clientIp}/32 .as=${data.clientAsn} router-id=${data.ispIp} routing-table=main templates=default

# 5. IP Firewall Address-list Configuration
/ip firewall address-list
add address=${data.clientPrefix}/${data.clientCidr} list=NAT
add address=${data.netIp}/30 list=NAT`;

        } else if (device === 'ros6') {
            return `# ISP Router ${routerNum} (${linkName} Link) - MikroTik RouterOS v6 Configuration
# Client: ${data.clientName} (ASN: ${data.clientAsn})

# 1. Interface & VLAN Configuration
/interface vlan
add interface=${data.physIf} name=vlan${data.vlan}-${data.clientNameSafe}-${linkName} vlan-id=${data.vlan} comment="Link to ${data.clientName} (${linkName})" disabled=no

# 2. IP Address Configuration
/ip address
add address=${data.ispIp}/30 interface=vlan${data.vlan}-${data.clientNameSafe}-${linkName} comment="BGP Peering with ${data.clientName}" disabled=no

# 3. BGP Filter Configuration
/routing filter
add chain=${data.clientNameSafe}-OUT prefix=0.0.0.0/0 action=accept comment="Send Default Route"
add chain=${data.clientNameSafe}-OUT action=discard comment="Reject all other prefixes"
add chain=${data.clientNameSafe}-IN prefix=${data.clientPrefix}/${data.clientCidr} action=accept comment="Accept Client Prefix"
add chain=${data.clientNameSafe}-IN action=discard comment="Reject all other prefixes"

# 4. BGP Peering Configuration
/routing bgp peer
add default-originate=if-installed in-filter=${data.clientNameSafe}-IN name=${data.clientNameSafe}-${linkName} \\
    out-filter=${data.clientNameSafe}-OUT remote-address=${data.clientIp} remote-as=${data.clientAsn} comment="BGP Peering" disabled=no

# 5. BGP Network Advertisement
/routing bgp network
add network=${data.netIp}/30 synchronize=no
add network=${data.clientPrefix}/${data.clientCidr} synchronize=no

# 6. IP Firewall Address-list Configuration
/ip firewall address-list
add address=${data.clientPrefix}/${data.clientCidr} list=NAT
add address=${data.netIp}/30 list=NAT`;

        } else if (device === 'huawei') {
            return `# ISP Router ${routerNum} (${linkName} Link) - Huawei VRP Configuration
# Client: ${data.clientName} (ASN: ${data.clientAsn})

system-view
#
# 1. Interface Subinterface & VLAN Termination Configuration
interface ${data.physIf}.${data.vlan}
 description Link_to_${data.clientNameSafe}_${linkName}
 vlan-type dot1q ${data.vlan}
 ip address ${data.ispIp} 30
 statistic enable
#
# 2. IP Prefix Lists & Route Policy Configuration
ip ip-prefix ${data.clientNameSafe}_IN_IN permit ${data.clientPrefix} ${data.clientCidr}
ip ip-prefix ${data.clientNameSafe}_OUT_OUT permit 0.0.0.0 0
#
route-policy ${data.clientNameSafe}_IN permit node 10
 if-match ip-prefix ${data.clientNameSafe}_IN_IN
 apply cost 10
#
route-policy ${data.clientNameSafe}_OUT permit node 10
 if-match ip-prefix ${data.clientNameSafe}_OUT_OUT
 apply local-preference 200
#
# 3. BGP Peer Configuration
bgp ${data.ispAsn}
 peer ${data.clientIp} as-number ${data.clientAsn}
 peer ${data.clientIp} description ${data.clientName}
 #
 ipv4-family unicast
  undo synchronization
  peer ${data.clientIp} enable
  peer ${data.clientIp} route-policy ${data.clientNameSafe}_IN import
  peer ${data.clientIp} route-policy ${data.clientNameSafe}_OUT export
  peer ${data.clientIp} default-route-advertise
  network ${data.netIp} 30
#
commit
return`;

        } else if (device === 'cisco') {
            return `! ISP Router ${routerNum} (${linkName} Link) - Cisco IOS Configuration
! Client: ${data.clientName} (ASN: ${data.clientAsn})

! 1. Interface & VLAN Configuration
interface ${data.physIf}.${data.vlan}
 description ${data.clientName}-${linkName}
 encapsulation dot1Q ${data.vlan}
 ip address ${data.ispIp} 255.255.255.252
!
! 2. Prefix list and Route Map Configuration
ip prefix-list ${data.clientNameSafe.toUpperCase()}-IN seq 5 permit ${data.clientPrefix}/${data.clientCidr}
ip prefix-list DEFAULT seq 10 permit 0.0.0.0/0
!
route-map RM-IN-${data.clientNameSafe.toUpperCase()} permit 10
 match ip address prefix-list ${data.clientNameSafe.toUpperCase()}-IN
!
route-map RM-OUT-${data.clientNameSafe.toUpperCase()} permit 10
 match ip address prefix-list DEFAULT
!
! 3. BGP Configuration
router bgp ${data.ispAsn}
 neighbor ${data.clientIp} remote-as ${data.clientAsn}
 neighbor ${data.clientIp} description ${data.clientName}-${linkName}
 !
 address-family ipv4
  neighbor ${data.clientIp} activate
  neighbor ${data.clientIp} soft-reconfiguration inbound
  neighbor ${data.clientIp} route-map RM-IN-${data.clientNameSafe.toUpperCase()} in
  neighbor ${data.clientIp} route-map RM-OUT-${data.clientNameSafe.toUpperCase()} out
  neighbor ${data.clientIp} prefix-list ${data.clientNameSafe.toUpperCase()}-in in
  neighbor ${data.clientIp} prefix-list default out
  network ${data.netIp} mask 255.255.255.252
 exit-address-family`;

        } else if (device === 'juniper') {
            return `# ISP Router ${routerNum} (${linkName} Link) - Juniper Junos Configuration
# Client: ${data.clientName} (ASN: ${data.clientAsn})

# 1. Interface Configuration
set interfaces ${data.physIf} unit ${data.vlan} description "${data.clientName} ${linkName}"
set interfaces ${data.physIf} unit ${data.vlan} vlan-id ${data.vlan}
set interfaces ${data.physIf} unit ${data.vlan} family inet address ${data.ispIp}/30

# 2. Policy Configuration
set logical-systems DATA policy-options policy-statement ${data.clientNameSafe}-in term term-1 from route-filter ${data.clientPrefix}/${data.clientCidr} exact
set logical-systems DATA policy-options policy-statement ${data.clientNameSafe}-in term term-1 then accept
set logical-systems DATA policy-options policy-statement ${data.clientNameSafe}-in term term-100 then reject

# 3. BGP Configuration
set protocols bgp group ${data.clientNameSafe} neighbor ${data.clientIp} description "${data.clientName}-${linkName}"
set protocols bgp group ${data.clientNameSafe} neighbor ${data.clientIp} local-address ${data.ispIp}
set protocols bgp group ${data.clientNameSafe} neighbor ${data.clientIp} import ${data.clientNameSafe}-in
set protocols bgp group ${data.clientNameSafe} neighbor ${data.clientIp} export eBGP-Default-client
set protocols bgp group ${data.clientNameSafe} neighbor ${data.clientIp} remove-private
set protocols bgp group ${data.clientNameSafe} neighbor ${data.clientIp} peer-as ${data.clientAsn}`;
        }
        return '';
    }

    // CLIENT ROUTER CONFIG GENERATOR (CE END)
    function generateClientRouterConfig(device, data) {
        const clientMask = getSubnetMask(data.clientCidr);
        
        let r1Lp = 100;
        let r2Lp = 100;
        let r1Med = 10;
        let r2Med = 10;

        if (data.strategy === 'active-backup-r1') {
            r1Lp = data.r1PrefVal; // 120
            r2Lp = data.r2PrefVal; // 100
            r1Med = 10;
            r2Med = 20;
        } else if (data.strategy === 'active-backup-r2') {
            r1Lp = data.r2PrefVal; // 100
            r2Lp = data.r1PrefVal; // 120
            r1Med = 20;
            r2Med = 10;
        }

        if (device === 'ros7') {
            return `# Client Router (Customer premises) - MikroTik RouterOS v7 Configuration
# Strategy: ${data.strategy}

# 1. Interface & VLAN Configuration
/interface bridge
add name=Loopback

# 2. IP Address Configuration
/ip address
add address=${data.r1ClientIp}/30 interface=${data.r1ClientPort} comment="WAN IP to R1 Primary"
add address=${data.r2ClientIp}/30 interface=${data.r2ClientPort} comment="WAN IP to R2 Secondary"
add address=${data.clientGateway}/30 interface=Loopback comment="Loopback IP"

# 3. Static NMS / server routes
/ip route
add disabled=no distance=1 dst-address=203.76.99.0/24 gateway=${data.r1IspIp} routing-table=main scope=30 target-scope=10
add disabled=no distance=1 dst-address=203.76.99.0/24 gateway=${data.r2IspIp} routing-table=main scope=30 target-scope=10

# 4. IP Firewall Address-list Configuration
/ip firewall address-list
add address=${data.clientPrefix}/${data.clientCidr} list=BGP-Advertisement

# 5. BGP Filter Configuration (Accept Default Route, Advertise Own Prefix)
/routing filter rule
add chain=Primary-Default-In disabled=no rule="if (dst == 0.0.0.0/0) { set bgp-local-pref ${r1Lp}; accept }"
add chain=Primary-Default-In disabled=no rule="if (dst == 0.0.0.0/0) { reject }"
add chain=Secondary-Default-In disabled=no rule="if (dst == 0.0.0.0/0) { set bgp-local-pref ${r2Lp}; accept }"
add chain=Secondary-Default-In disabled=no rule="if (dst == 0.0.0.0/0) { reject }"
add chain=Primary-Default-OUT disabled=no rule="if (dst in ${data.clientPrefix}/${data.clientCidr}) { set bgp-med ${r1Med}; accept }"
add chain=Primary-Default-OUT disabled=no rule="if (dst == 0.0.0.0/0) { reject }"
add chain=Secondary-Default-OUT disabled=no rule="if (dst in ${data.clientPrefix}/${data.clientCidr}) { set bgp-med ${r2Med}; accept }"
add chain=Secondary-Default-OUT disabled=no rule="if (dst == 0.0.0.0/0) { reject }"

# 6. BGP Connection Configuration
/routing bgp template
set default as=${data.clientAsn} disabled=no routing-table=main

/routing bgp connection
add as=${data.clientAsn} disabled=no input.filter=Primary-Default-In local.role=ebgp name=Primary-Peer \\
    output.default-originate=never .filter-chain=Primary-Default-OUT .network=BGP-Advertisement \\
    remote.address=${data.r1IspIp}/32 .as=${data.ispAsn} router-id=${data.clientGateway} routing-table=main templates=default

add as=${data.clientAsn} disabled=no input.filter=Secondary-Default-In local.role=ebgp name=Secondary-Peer \\
    output.default-originate=never .filter-chain=Secondary-Default-OUT .network=BGP-Advertisement \\
    remote.address=${data.r2IspIp}/32 .as=${data.ispAsn} router-id=${data.clientGateway} routing-table=main templates=default

# 7. System Identity
/system identity
set name=${data.clientNameSafe}`;

        } else if (device === 'ros6') {
            return `# Client Router (Customer premises) - MikroTik RouterOS v6 Configuration
# Strategy: ${data.strategy}

# 1. Interface & VLAN Configuration
/interface bridge
add name=Loopback

# 2. IP Address Configuration
/ip address
add address=${data.r1ClientIp}/30 interface=${data.r1ClientPort} comment="Primary WAN IP" disabled=no
add address=${data.r2ClientIp}/30 interface=${data.r2ClientPort} comment="Secondary WAN IP" disabled=no
add address=${data.clientGateway}/30 interface=Loopback comment="Loopback IP" disabled=no

# 3. Static NMS / server routes
/ip route
add check-gateway=ping distance=1 dst-address=203.76.99.0/24 gateway=${data.r1IspIp} disabled=no
add check-gateway=ping distance=1 dst-address=203.76.99.0/24 gateway=${data.r2IspIp} disabled=no

# 4. BGP Filter Configuration
/routing filter
# Inbound Filters
add action=accept chain=Primary-Default-In prefix=0.0.0.0/0 set-bgp-local-pref=${r1Lp} comment="Primary default route LP"
add action=discard chain=Primary-Default-In prefix-length=0-128
add action=accept chain=Secondary-Default-In prefix=0.0.0.0/0 set-bgp-local-pref=${r2Lp} comment="Secondary default route LP"
add action=discard chain=Secondary-Default-In prefix-length=0-128
# Outbound Filters
add action=accept chain=Primary-Network-Out prefix=${data.clientPrefix}/${data.clientCidr} set-bgp-med=${r1Med} comment="Advertise to Primary with MED"
add action=discard chain=Primary-Network-Out prefix-length=0-128
add action=accept chain=Secondary-Network-Out prefix=${data.clientPrefix}/${data.clientCidr} set-bgp-med=${r2Med} comment="Advertise to Secondary with MED"
add action=discard chain=Secondary-Network-Out prefix-length=0-128

# 5. BGP Instance and Networks
/routing bgp instance
set default as=${data.clientAsn}

/routing bgp network
add network=${data.clientPrefix}/${data.clientCidr} synchronize=no

# 6. BGP Peering configuration
/routing bgp peer
add in-filter=Primary-Default-In name=Primary-Peer out-filter=Primary-Network-Out \\
    remote-address=${data.r1IspIp} remote-as=${data.ispAsn} comment="Peering to ISP R1" disabled=no
add in-filter=Secondary-Default-In name=Secondary-Peer out-filter=Secondary-Network-Out \\
    remote-address=${data.r2IspIp} remote-as=${data.ispAsn} comment="Peering to ISP R2" disabled=no

# 7. System Identity
/system identity
set name=${data.clientNameSafe}

# 8. Additional LAN Configuration
/interface bridge
add name=LAN-bridge
/interface bridge port
add bridge=LAN-bridge interface=${data.clientLanPort}
# Add your LAN subnet IP on LAN-bridge manually`;

        } else if (device === 'huawei') {
            return `# Client Router (Customer premises) - Huawei VRP Configuration
# Strategy: ${data.strategy}

system-view
#
# 1. Interface Configuration
interface GigabitEthernet0/0/0
 description Loopback
 ip address ${data.clientGateway} 30
#
interface ${data.r1ClientPort}
 description WAN_link_to_ISP_R1_Primary
 ip address ${data.r1ClientIp} 255.255.255.252
#
interface ${data.r2ClientPort}
 description WAN_link_to_ISP_R2_Secondary
 ip address ${data.r2ClientIp} 255.255.255.252
#
${data.clientLanPort ? `interface ${data.clientLanPort}\n description Client_LAN_Interface\n ip address ${data.clientGateway} ${clientMask}\n#\n` : ''}# 2. Static NMS / Server Routes
ip route-static 203.76.99.0 255.255.255.0 ${data.r1IspIp}
ip route-static 203.76.99.0 255.255.255.0 ${data.r2IspIp} preference 70
#
# 3. IP Prefix lists and Route policies
ip ip-prefix PL-OUT-CLIENT permit ${data.clientPrefix} ${data.clientCidr}
ip ip-prefix Default_IN permit 0.0.0.0 0
#
# Route maps for R1
route-policy PRIMARY_IN permit node 10
 if-match ip-prefix Default_IN
 apply local-preference ${r1Lp}
#
route-policy PRIMARY_OUT permit node 10
 if-match ip-prefix PL-OUT-CLIENT
 apply cost ${r1Med}
#
# Route maps for R2
route-policy SECONDARY_IN permit node 10
 if-match ip-prefix Default_IN
 apply local-preference ${r2Lp}
#
route-policy SECONDARY_OUT permit node 10
 if-match ip-prefix PL-OUT-CLIENT
 apply cost ${r2Med}
#
# 4. BGP Peering Configuration
bgp ${data.clientAsn}
 router-id ${data.clientGateway}
 peer ${data.r1IspIp} as-number ${data.ispAsn}
 peer ${data.r1IspIp} description Primary-Peer
 peer ${data.r2IspIp} as-number ${data.ispAsn}
 peer ${data.r2IspIp} description Secondary-Peer
 #
 ipv4-family unicast
  undo synchronization
  network ${data.clientPrefix} ${clientMask}
  #
  peer ${data.r1IspIp} enable
  peer ${data.r1IspIp} route-policy PRIMARY_IN import
  peer ${data.r1IspIp} route-policy PRIMARY_OUT export
  #
  peer ${data.r2IspIp} enable
  peer ${data.r2IspIp} route-policy SECONDARY_IN import
  peer ${data.r2IspIp} route-policy SECONDARY_OUT export
#
commit
return`;

        } else if (device === 'cisco') {
            return `! Client Router (Customer premises) - Cisco IOS Configuration
! Strategy: ${data.strategy}

configure terminal
!
! 1. Hostname Setup
hostname ${data.clientNameSafe}
!
! 2. Interface Configuration
interface GigabitEthernet0/0
 description Loopback-Bridge
 ip address ${data.clientGateway} 255.255.255.252
 no shutdown
!
interface ${data.r1ClientPort}
 description Primary-Peer
 ip address ${data.r1ClientIp} 255.255.255.252
 no shutdown
!
interface ${data.r2ClientPort}
 description Secondary-Peer
 ip address ${data.r2ClientIp} 255.255.255.252
 no shutdown
!
${data.clientLanPort ? `interface ${data.clientLanPort}\n description Client_LAN_Interface\n ip address ${data.clientGateway} ${clientMask}\n no shutdown\n!\n` : ''}! 3. Static NMS / Server Routes
ip route 203.76.99.0 255.255.255.0 ${data.r1IspIp}
ip route 203.76.99.0 255.255.255.0 ${data.r2IspIp} 2
!
! 4. Prefix lists and Route maps
ip prefix-list Default_IN seq 10 permit 0.0.0.0/0
ip prefix-list Default_IN seq 50 deny 0.0.0.0/0 le 32
ip prefix-list ${data.clientNameSafe.toUpperCase()}_OUT seq 10 permit ${data.clientPrefix}/${data.clientCidr}
ip prefix-list ${data.clientNameSafe.toUpperCase()}_OUT seq 50 deny 0.0.0.0/0 le 32
!
route-map PRIMARY_IN permit 10
 match ip address prefix-list Default_IN
 set local-preference ${r1Lp}
!
route-map SECONDARY_IN permit 10
 match ip address prefix-list Default_IN
 set local-preference ${r2Lp}
!
route-map PRIMARY_OUT permit 10
 match ip address prefix-list ${data.clientNameSafe.toUpperCase()}_OUT
 set metric ${r1Med}
!
route-map SECONDARY_OUT permit 10
 match ip address prefix-list ${data.clientNameSafe.toUpperCase()}_OUT
 set metric ${r2Med}
!
! 5. BGP Peering Configuration
router bgp ${data.clientAsn}
 neighbor ${data.r1IspIp} remote-as ${data.ispAsn}
 neighbor ${data.r1IspIp} description Primary-Peer
 neighbor ${data.r2IspIp} remote-as ${data.ispAsn}
 neighbor ${data.r2IspIp} description Secondary-Peer
 !
 address-family ipv4
  neighbor ${data.r1IspIp} activate
  neighbor ${data.r1IspIp} soft-reconfiguration inbound
  neighbor ${data.r1IspIp} route-map PRIMARY_IN in
  neighbor ${data.r1IspIp} route-map PRIMARY_OUT out
  !
  neighbor ${data.r2IspIp} activate
  neighbor ${data.r2IspIp} soft-reconfiguration inbound
  neighbor ${data.r2IspIp} route-map SECONDARY_IN in
  neighbor ${data.r2IspIp} route-map SECONDARY_OUT out
  !
  network ${data.clientPrefix} mask ${clientMask}
 exit-address-family`;
        } else if (device === 'juniper') {
            return `# Client Router (Customer premises) - Juniper Junos Configuration
# Strategy: ${data.strategy}

# 1. Interface & VLAN Configuration
set interfaces ge-0/0/0 unit 0 description "Loopback"
set interfaces ge-0/0/0 unit 0 family inet address ${data.clientGateway}/30

set interfaces ${data.r1ClientPort} unit 0 description "Primary-Peer"
set interfaces ${data.r1ClientPort} unit 0 family inet address ${data.r1ClientIp}/30

set interfaces ${data.r2ClientPort} unit 0 description "Secondary-Peer"
set interfaces ${data.r2ClientPort} unit 0 family inet address ${data.r2ClientIp}/30

${data.clientLanPort ? `set interfaces ${data.clientLanPort} unit 0 description "Client LAN Interface"\nset interfaces ${data.clientLanPort} unit 0 family inet address ${data.clientGateway}/${data.clientCidr}\n` : ''}
# 2. Static NMS / Server Routes
set routing-options static route 203.76.99.0/24 next-hop ${data.r1IspIp}
set routing-options static route 203.76.99.0/24 next-hop ${data.r2IspIp} metric 2

# 3. Policy and Prefix list configuration
set policy-options prefix-list PL-OUT-CLIENT ${data.clientPrefix}/${data.clientCidr}
set policy-options prefix-list Default-IN 0.0.0.0/0

set policy-options policy-statement PRIMARY_IN term term-1 from prefix-list Default-IN
set policy-options policy-statement PRIMARY_IN term term-1 then local-preference ${r1Lp}
set policy-options policy-statement PRIMARY_IN term term-1 then accept
set policy-options policy-statement PRIMARY_IN term term-2 then reject

set policy-options policy-statement SECONDARY_IN term term-1 from prefix-list Default-IN
set policy-options policy-statement SECONDARY_IN term term-1 then local-preference ${r2Lp}
set policy-options policy-statement SECONDARY_IN term term-1 then accept
set policy-options policy-statement SECONDARY_IN term term-2 then reject

set policy-options policy-statement PRIMARY_OUT term term-1 from prefix-list PL-OUT-CLIENT
set policy-options policy-statement PRIMARY_OUT term term-1 then metric ${r1Med}
set policy-options policy-statement PRIMARY_OUT term term-1 then accept
set policy-options policy-statement PRIMARY_OUT term term-2 then reject

set policy-options policy-statement SECONDARY_OUT term term-1 from prefix-list PL-OUT-CLIENT
set policy-options policy-statement SECONDARY_OUT term term-1 then metric ${r2Med}
set policy-options policy-statement SECONDARY_OUT term term-1 then accept
set policy-options policy-statement SECONDARY_OUT term term-2 then reject

# 4. BGP Configuration
set protocols bgp group PRIMARY-PEER type external
set protocols bgp group PRIMARY-PEER neighbor ${data.r1IspIp} peer-as ${data.ispAsn}
set protocols bgp group PRIMARY-PEER neighbor ${data.r1IspIp} description "Primary-Peer"
set protocols bgp group PRIMARY-PEER neighbor ${data.r1IspIp} import PRIMARY_IN
set protocols bgp group PRIMARY-PEER neighbor ${data.r1IspIp} export PRIMARY_OUT

set protocols bgp group SECONDARY-PEER type external
set protocols bgp group SECONDARY-PEER neighbor ${data.r2IspIp} peer-as ${data.ispAsn}
set protocols bgp group SECONDARY-PEER neighbor ${data.r2IspIp} description "Secondary-Peer"
set protocols bgp group SECONDARY-PEER neighbor ${data.r2IspIp} import SECONDARY_IN
set protocols bgp group SECONDARY-PEER neighbor ${data.r2IspIp} export SECONDARY_OUT`;
        }
        return '';
    }

    // ---- CLIPBOARD & DOWNLOAD ENGINE ----

    // Copy to clipboard function
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const codeEl = document.getElementById(targetId);
            
            navigator.clipboard.writeText(codeEl.textContent).then(() => {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<span class="icon">✅</span> Copied!';
                btn.classList.add('copied');
                
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        });
    });

    // Download file function
    document.querySelectorAll('.btn-download').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const filenameId = btn.getAttribute('data-filename-id');
            
            const codeText = document.getElementById(targetId).textContent;
            const filename = document.getElementById(filenameId).textContent;
            
            const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 0);
        });
    });

    // Run strategy dependency check at start
    toggleStrategyDependencies();
});
