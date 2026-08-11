/**
 * Multi-Vendor IPsec VPN Configuration Generator
 * Core Application Logic (Cisco IOS, Huawei VRP, MikroTik RouterOS v6 & v7)
 * Supports both Policy-based and Route-based VPNs
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('vpn-form');
    const outputCode = document.getElementById('output-code');
    const explanationText = document.getElementById('explanation-text');
    const explanationCard = document.getElementById('explanation-card');
    
    // CIDR Selects & Custom inputs
    const localLanCidr = document.getElementById('local-lan-cidr');
    const localLanWildcard = document.getElementById('local-lan-wildcard');
    const remoteLanCidr = document.getElementById('remote-lan-cidr');
    const remoteLanWildcard = document.getElementById('remote-lan-wildcard');
    const wanCidr = document.getElementById('wan-cidr');
    const wanMask = document.getElementById('wan-mask');

    // VPN Type & Conditional containers
    const vpnType = document.getElementById('vpn-type');
    const tunnelSettingsCard = document.getElementById('tunnel-settings-card');
    const aclNameContainer = document.getElementById('acl-name-container');
    const tunnelCidr = document.getElementById('tunnel-cidr');
    const tunnelMask = document.getElementById('tunnel-mask');
    
    // Actions
    const btnCopy = document.getElementById('btn-copy');
    const btnDownload = document.getElementById('btn-download');
    const btnReset = document.getElementById('btn-reset');
    const btnGeneratePsk = document.getElementById('btn-generate-psk');

    // Vendor Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    let activeVendor = 'cisco';

    // Default Values
    const defaultValues = {
        vpnType: 'policy',
        isakmpPolicy: '1',
        isakmpEncr: 'aes 256',
        isakmpHash: 'sha1',
        isakmpAuth: 'pre-share',
        isakmpKey: 'Pr!m@Ry&Sec0Nd@rY',
        peerIp: '198.51.100.2',
        transformSetName: 'TS_SITE_A',
        ipsecEncr: 'esp-aes 256',
        ipsecHash: 'esp-sha-hmac',
        cryptoMapName: 'CRYPTO_MAP',
        cryptoMapSeq: '1',
        aclName: 'ACL_LAN_ALLOW',
        localLanIp: '192.168.1.0',
        localLanCidr: '24',
        localLanWildcard: '0.0.0.255',
        remoteLanIp: '172.16.1.0',
        remoteLanCidr: '24',
        remoteLanWildcard: '0.0.0.255',
        wanInterface: 'GigabitEthernet2/0',
        wanIp: '198.51.100.1',
        wanCidr: '30',
        wanMask: '255.255.255.252',
        tunnelInterface: 'Tunnel1',
        tunnelIp: '10.0.0.1',
        tunnelCidr: '30',
        tunnelMask: '255.255.255.252'
    };

    // Cisco IOS Command Explanations
    const ciscoExplanations = {
        'crypto_isakmp_policy': 'Starts <strong>ISAKMP (Internet Security Association and Key Management Protocol) policy</strong> configuration. The custom identifier or name (e.g., <strong>{policy}</strong>) defines this policy during Phase 1 negotiation.',
        'encr': 'Specifies the <strong>encryption algorithm</strong> (<strong>{encr}</strong>) to protect ISAKMP Phase 1 negotiations. Modern standards recommend AES 256 for optimal security.',
        'hash': 'Specifies the <strong>hash algorithm</strong> (<strong>{hash}</strong>) to ensure packet integrity and authentication during Phase 1 negotiations.',
        'authentication': 'Sets the <strong>authentication method</strong> (<strong>{auth}</strong>) to prove the identity of the remote router (usually a shared secret pre-shared key).',
        'crypto_isakmp_key': 'Configures the <strong>Pre-Shared Key (PSK)</strong>: <code>{key}</code>. It will be used to authenticate with the remote gateway at public IP address <strong>{peer_ip}</strong>.',
        'crypto_ipsec_transform_set': 'Defines the <strong>Phase 2 IPsec transform-set</strong> named <strong>{ts_name}</strong>. It specifies the actual encryption (<strong>{ipsec_encr}</strong>) and HMAC integrity algorithm (<strong>{ipsec_hash}</strong>) for user data.',
        'ip_access_list': 'Creates an <strong>extended Access Control List (ACL)</strong> named <strong>{acl_name}</strong>. This ACL defines the "interesting traffic" that should be encrypted and sent through the VPN tunnel.',
        'permit_ip': 'Directs the router to encrypt any traffic originating from the local LAN <strong>{local_ip}</strong> going to the remote LAN <strong>{remote_ip}</strong>.',
        'crypto_map_init': 'Declares a <strong>crypto map</strong> named <strong>{map_name}</strong> (sequence <strong>{map_seq}</strong>) using ISAKMP. This binds Phase 1, Phase 2, and the ACL together.',
        'set_peer': 'Inside the crypto map, sets the public IP address of the <strong>remote VPN gateway</strong> to <strong>{peer_ip}</strong>.',
        'set_transform_set': 'Binds the previously configured Phase 2 transform-set (<strong>{ts_name}</strong>) to this crypto map.',
        'match_address': 'Binds the interesting traffic ACL (<strong>{acl_name}</strong>) to this crypto map. Traffic matching this ACL will trigger the VPN tunnel negotiations.',
        'interface': 'Enters configuration mode for the physical WAN interface: <strong>{wan_interface}</strong>.',
        'description': 'Applies an administrative description to the interface for documentation and troubleshooting.',
        'ip_address': 'Assigns the public IP address <strong>{wan_ip}</strong> and subnet mask <strong>{wan_mask}</strong> to this WAN interface.',
        'negotiation': 'Enables speed and duplex <strong>auto-negotiation</strong> on the physical ethernet link.',
        'crypto_map_apply': 'Applies the crypto map <strong>{map_name}</strong> to the WAN interface. This activates IPsec encryption for any outbound traffic matching the interesting traffic ACL.',
        'end': 'Exits configuration mode and returns the router to privileged EXEC mode.',
        'comment': 'A comment line (indicated by <code>!</code>). Cisco IOS uses exclamation marks to separate configuration blocks or add annotations.',
        // Route-Based Cisco Explanations
        'crypto_ipsec_profile': 'Creates an <strong>IPsec Profile</strong> named <strong>{profile_name}</strong>. In Route-based VPNs, profiles are used instead of crypto maps to define Phase 2 parameters.',
        'set_transform_profile': 'Binds the Phase 2 transform-set (<strong>{ts_name}</strong>) to this IPsec profile.',
        'interface_tunnel': 'Enters configuration mode for the virtual interface: <strong>{tunnel_interface}</strong>.',
        'tunnel_source': 'Specifies the physical WAN interface (<strong>{wan_interface}</strong>) as the source of the tunnel.',
        'tunnel_destination': 'Specifies the remote gateway\'s public IP (<strong>{peer_ip}</strong>) as the destination of the tunnel.',
        'tunnel_mode_ipsec': 'Sets the encapsulation mode of the tunnel to <strong>IPsec over IPv4</strong>.',
        'tunnel_protection': 'Applies the IPsec profile (<strong>{profile_name}</strong>) to the tunnel interface. This ensures all traffic traversing the tunnel is encrypted.',
        'ip_route': 'Adds a <strong>static route</strong> directing all traffic destined for the remote LAN (<strong>{remote_ip}/{remote_cidr}</strong>) to flow through the virtual tunnel interface (<strong>{tunnel_interface}</strong>).'
    };

    // Huawei VRP Command Explanations
    const huaweiExplanations = {
        'hw_acl_init': 'Creates an <strong>advanced Access Control List (ACL)</strong> named <strong>{acl_name}</strong> (advanced ACLs in VRP handle detailed IPsec routing rules).',
        'hw_rule_permit': 'Specifies a rule to <strong>permit and encrypt</strong> traffic traveling from the local LAN <strong>{local_ip}</strong> to the remote LAN <strong>{remote_ip}</strong>.',
        'hw_ike_prop_init': 'Creates an <strong>IKE Proposal</strong> (<strong>{policy}</strong>) to negotiate security parameters for Phase 1.',
        'hw_ike_prop_encr': 'Defines the <strong>encryption algorithm</strong> (<strong>{encr}</strong>) used to secure the IKE negotiations.',
        'hw_ike_prop_hash': 'Defines the <strong>authentication algorithm</strong> (<strong>{hash}</strong>) to ensure packet integrity.',
        'hw_ike_prop_dh': 'Sets the <strong>Diffie-Hellman group</strong> (group2 - MODP 1024) for secure session key exchange.',
        'hw_ike_prop_auth': 'Sets the IKE authentication mode to <strong>pre-share key</strong>.',
        'hw_ike_peer_init': 'Defines the <strong>IKE Peer</strong> configuration to establish connections with the remote gateway.',
        'hw_ike_peer_prop': 'Binds the IKE Proposal (<strong>{policy}</strong>) to this peer configuration.',
        'hw_ike_peer_key': 'Configures the <strong>pre-shared key</strong>: <code>{key}</code> for authenticating the remote peer.',
        'hw_ike_peer_addr': 'Specifies the remote gateway\'s <strong>public WAN IP address</strong>: <strong>{peer_ip}</strong>.',
        'hw_ipsec_prop_init': 'Creates an <strong>IPsec Proposal</strong> named <strong>{ts_name}</strong> for Phase 2 negotiations.',
        'hw_ipsec_prop_trans': 'Sets the encapsulation protocol to <strong>ESP (Encapsulating Security Payload)</strong>.',
        'hw_ipsec_prop_encr': 'Defines the <strong>encryption algorithm</strong> (<strong>{ipsec_encr}</strong>) for protecting actual user data.',
        'hw_ipsec_prop_hash': 'Defines the <strong>authentication algorithm</strong> (<strong>{ipsec_hash}</strong>) for user data integrity.',
        'hw_ipsec_policy_init': 'Creates an <strong>IPsec Policy</strong> named <strong>{map_name}</strong> (sequence <strong>{map_seq}</strong>) using IKE negotiation.',
        'hw_ipsec_policy_acl': 'Binds the interesting traffic <strong>ACL</strong> (<strong>{acl_name}</strong>) to this policy.',
        'hw_ipsec_policy_proposal': 'Binds the <strong>IPsec Proposal</strong> (<strong>{ts_name}</strong>) to this policy.',
        'hw_ipsec_policy_peer': 'Binds the <strong>IKE Peer</strong> configuration to this policy.',
        'interface': 'Enters configuration mode for the physical or virtual WAN interface: <strong>{wan_interface}</strong>.',
        'description': 'Applies an administrative description to the interface for documentation and troubleshooting.',
        'ip_address': 'Assigns the IP address <strong>{wan_ip}</strong> and subnet mask <strong>{wan_mask}</strong>.',
        'hw_ipsec_apply': 'Applies the IPsec policy <strong>{map_name}</strong> to the WAN interface. This activates IPsec encryption for any outbound traffic matching the ACL.',
        'end': 'Exits configuration mode and returns the VRP router to system view.',
        'comment': 'A comment line (indicated by <code>#</code>). Huawei VRP uses hashes to separate configuration blocks.',
        // Route-Based Huawei Explanations
        'hw_ipsec_profile_init': 'Creates an <strong>IPsec Profile</strong> named <strong>{profile_name}</strong> to bundle IKE peer and proposal settings for the tunnel.',
        'hw_ipsec_profile_proposal': 'Binds the IPsec proposal (<strong>{ts_name}</strong>) to this profile.',
        'hw_ipsec_profile_peer': 'Binds the IKE peer (<strong>peer_{peer_ip}</strong>) to this profile.',
        'hw_interface_tunnel': 'Enters configuration mode for the virtual tunnel interface: <strong>{tunnel_interface}</strong>.',
        'hw_tunnel_protocol': 'Sets the tunnel encapsulation protocol to <strong>IPsec</strong>.',
        'hw_tunnel_source': 'Specifies the source physical interface or WAN IP (<strong>{wan_interface}</strong>) for the tunnel.',
        'hw_tunnel_destination': 'Specifies the remote peer public IP (<strong>{peer_ip}</strong>) as the destination.',
        'hw_tunnel_profile': 'Applies the IPsec profile (<strong>{profile_name}</strong>) to the tunnel interface to enable encryption.',
        'hw_ip_route': 'Adds a <strong>static route</strong> directing traffic for the remote LAN (<strong>{remote_ip}</strong>) to the virtual tunnel interface (<strong>{tunnel_interface}</strong>).'
    };

    // MikroTik RouterOS v6 Command Explanations
    const mikrotikV6Explanations = {
        'mt6_peer': 'Creates a monolithic <strong>IPsec Peer</strong> configuration under RouterOS v6. This single statement defines the remote IP <strong>{peer_ip}</strong>, pre-shared key (<code>{key}</code>), Phase 1 encryption (<strong>{encr}</strong>), hash (<strong>{hash}</strong>), and exchange mode in a single command, which was standard before ROS v6.43.',
        'mt_proposal': 'Creates an <strong>IPsec Proposal</strong> (<strong>{ts_name}</strong>) defining Phase 2 encryption and integrity algorithms for protecting actual user data.',
        'mt_nat_bypass': 'Adds a <strong>NAT Bypass rule</strong> at the top of the NAT chain, ensuring traffic between local and remote subnets is not translated by the WAN masquerade rule.',
        'mt6_policy': 'Creates an <strong>IPsec Policy</strong> linking local LAN (<strong>{local_ip}/{local_cidr}</strong>) and remote LAN (<strong>{remote_ip}/{remote_cidr}</strong>) directly via public peer IPs. In older RouterOS v6, the policy automatically matches the active peer based on IP address pairing without requiring an explicit peer parameter.',
        'comment': 'A comment line (indicated by <code>#</code>) used to annotate sections in RouterOS configuration scripts.',
        // Route-Based MikroTik Explanations
        'mt_ipip_tunnel': 'Creates a virtual <strong>IPIP Tunnel interface</strong> named <strong>{tunnel_interface}</strong>. On MikroTik, setting the <code>ipsec-secret</code> parameter automatically creates and negotiates a secure IPsec tunnel in the background using default profiles.',
        'mt_tunnel_ip': 'Assigns the local tunnel IP address <strong>{tunnel_ip}/{tunnel_cidr}</strong> to the virtual tunnel interface.',
        'mt_route': 'Adds a <strong>static route</strong> in RouterOS, routing all traffic destined for the remote LAN (<strong>{remote_ip}/{remote_cidr}</strong>) via the secure tunnel interface (<strong>{tunnel_interface}</strong>).'
    };

    // MikroTik RouterOS v7 Command Explanations
    const mikrotikV7Explanations = {
        'mt_profile': 'Creates an <strong>IPsec Profile</strong> (<strong>profile_{policy}</strong>). In RouterOS v7, Phase 1 parameters (encryption, hash, DH group) must be separated into a distinct profile block.',
        'mt_peer': 'Defines the <strong>IPsec Peer</strong> pointing to the remote public IP <strong>{peer_ip}</strong>, linking it to our profile.',
        'mt_identity': 'Configures the <strong>Pre-Shared Key</strong> (<code>{key}</code>) used to authenticate the remote peer. In RouterOS v7, credentials must be configured in a separate `/ip ipsec identity` command.',
        'mt_proposal': 'Creates an <strong>IPsec Proposal</strong> (<strong>{ts_name}</strong>) defining Phase 2 encryption and integrity algorithms for protecting actual user data.',
        'mt_nat_bypass': 'Adds a <strong>NAT Bypass rule</strong> at the top of the NAT chain, ensuring traffic between local and remote subnets is not translated by the WAN masquerade rule.',
        'mt7_policy': 'Creates an <strong>IPsec Policy</strong> that triggers encryption for traffic traveling between local LAN (<strong>{local_ip}/{local_cidr}</strong>) and remote LAN (<strong>{remote_ip}/{remote_cidr}</strong>). In RouterOS v7, this is explicitly bound to the peer (<strong>peer_{peer_ip}</strong>) for improved routing isolation.',
        'comment': 'A comment line (indicated by <code>#</code>) used to annotate sections in RouterOS configuration scripts.',
        // Route-Based
        'mt_ipip_tunnel': 'Creates a virtual <strong>IPIP Tunnel interface</strong> named <strong>{tunnel_interface}</strong>. On MikroTik, setting the <code>ipsec-secret</code> parameter automatically creates and negotiates a secure IPsec tunnel in the background using default profiles.',
        'mt_tunnel_ip': 'Assigns the local tunnel IP address <strong>{tunnel_ip}/{tunnel_cidr}</strong> to the virtual tunnel interface.',
        'mt_route': 'Adds a <strong>static route</strong> in RouterOS, routing all traffic destined for the remote LAN (<strong>{remote_ip}/{remote_cidr}</strong>) via the secure tunnel interface (<strong>{tunnel_interface}</strong>).'
    };

    // Helper: Generate Secure Pre-Shared Key
    function generateSecurePSK() {
        const length = 16;
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?";
        let password = "";
        
        password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
        password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
        password += "0123456789"[Math.floor(Math.random() * 10)];
        password += "!@#$%^&*()-_=+"[Math.floor(Math.random() * 14)];
        
        for (let i = 4; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            password += charset[randomIndex];
        }
        
        return password.split('').sort(() => 0.5 - Math.random()).join('');
    }

    // Helper: Convert CIDR prefix to Subnet Mask
    function cidrToSubnetMask(prefix) {
        const bits = parseInt(prefix, 10);
        if (isNaN(bits) || bits < 0 || bits > 32) return '255.255.255.0';
        
        let mask = [];
        for (let i = 0; i < 4; i++) {
            const n = Math.min(bits - i * 8, 8);
            if (n <= 0) {
                mask.push(0);
            } else {
                mask.push(256 - Math.pow(2, 8 - n));
            }
        }
        return mask.join('.');
    }

    // Helper: Convert CIDR prefix to Wildcard Mask
    function cidrToWildcardMask(prefix) {
        const subnetMask = cidrToSubnetMask(prefix);
        return subnetMask.split('.').map(octet => 255 - parseInt(octet, 10)).join('.');
    }

    // Helper: Convert Wildcard Mask to CIDR Number
    function wildcardToCidr(wildcard) {
        const octets = wildcard.trim().split('.');
        if (octets.length !== 4) return 24;
        const mask = octets.map(o => 255 - parseInt(o, 10));
        let bits = 0;
        mask.forEach(octet => {
            bits += octet.toString(2).replace(/0/g, '').length;
        });
        return bits;
    }

    // Helper: Convert Subnet Mask to CIDR Number
    function subnetToCidr(subnet) {
        const octets = subnet.trim().split('.');
        if (octets.length !== 4) return 30;
        let bits = 0;
        octets.map(o => parseInt(o, 10)).forEach(octet => {
            bits += octet.toString(2).replace(/0/g, '').length;
        });
        return bits;
    }

    // Helper: Validate IPv4 Address
    function isValidIPv4(ip) {
        const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipv4Regex.test(ip.trim());
    }

    // Helper: Validate Subnet Mask / Wildcard Mask
    function isValidMask(mask) {
        const octets = mask.trim().split('.');
        if (octets.length !== 4) return false;
        
        return octets.every(octet => {
            const val = parseInt(octet, 10);
            return !isNaN(val) && val >= 0 && val <= 255;
        });
    }

    // Helper: Validate Cisco names (no spaces, alphanumeric, underscores, hyphens)
    function isValidCiscoName(name) {
        const nameRegex = /^[a-zA-Z0-9_\-]+$/;
        return nameRegex.test(name.trim());
    }

    // Update Wildcard/Subnet masks based on CIDR selections
    function handleCidrChange(cidrSelect, maskInput, isWildcard = false) {
        const val = cidrSelect.value;
        if (val === 'custom') {
            maskInput.removeAttribute('readonly');
            maskInput.focus();
        } else {
            maskInput.setAttribute('readonly', true);
            maskInput.value = isWildcard ? cidrToWildcardMask(val) : cidrToSubnetMask(val);
        }
    }

    // Real-time Form Validation
    function validateForm() {
        let isValid = true;
        const isRouteBased = (vpnType.value === 'route');
        
        const inputs = {
            isakmpPolicy: { el: document.getElementById('isakmp-policy'), valEl: document.getElementById('val-isakmp-policy'), check: isValidCiscoName, msg: 'Use letters, numbers, underscores, or hyphens.' },
            peerIp: { el: document.getElementById('peer-ip'), valEl: document.getElementById('val-peer-ip'), check: isValidIPv4, msg: 'Invalid public IP address format.' },
            transformSetName: { el: document.getElementById('transform-set-name'), valEl: document.getElementById('val-transform-set-name'), check: isValidCiscoName, msg: 'Use letters, numbers, underscores, or hyphens.' },
            cryptoMapName: { el: document.getElementById('crypto-map-name'), valEl: document.getElementById('val-crypto-map-name'), check: isValidCiscoName, msg: 'Use letters, numbers, underscores, or hyphens.' },
            localLanIp: { el: document.getElementById('local-lan-ip'), valEl: document.getElementById('val-local-lan-ip'), check: isValidIPv4, msg: 'Invalid IP network format.' },
            remoteLanIp: { el: document.getElementById('remote-lan-ip'), valEl: document.getElementById('val-remote-lan-ip'), check: isValidIPv4, msg: 'Invalid IP network format.' },
            localLanWildcard: { el: localLanWildcard, valEl: document.getElementById('val-local-lan-wildcard'), check: isValidMask, msg: 'Invalid wildcard mask format.' },
            remoteLanWildcard: { el: remoteLanWildcard, valEl: document.getElementById('val-remote-lan-wildcard'), check: isValidMask, msg: 'Invalid wildcard mask format.' },
            wanInterface: { el: document.getElementById('wan-interface'), valEl: document.getElementById('val-wan-interface'), check: (v) => v.trim().length > 0, msg: 'Interface name is required.' },
            wanIp: { el: document.getElementById('wan-ip'), valEl: document.getElementById('val-wan-ip'), check: isValidIPv4, msg: 'Invalid public IP address format.' },
            wanMask: { el: wanMask, valEl: document.getElementById('val-wan-mask'), check: isValidMask, msg: 'Invalid subnet mask format.' }
        };

        // Add conditional validation for Policy-based
        if (!isRouteBased) {
            inputs.aclName = { el: document.getElementById('acl-name'), valEl: document.getElementById('val-acl-name'), check: isValidCiscoName, msg: 'Use letters, numbers, underscores, or hyphens.' };
        }

        // Add conditional validation for Route-based
        if (isRouteBased) {
            inputs.tunnelInterface = { el: document.getElementById('tunnel-interface'), valEl: document.getElementById('val-tunnel-interface'), check: (v) => v.trim().length > 0, msg: 'Tunnel name is required.' };
            inputs.tunnelIp = { el: document.getElementById('tunnel-ip'), valEl: document.getElementById('val-tunnel-ip'), check: isValidIPv4, msg: 'Invalid IP address format.' };
            inputs.tunnelMask = { el: tunnelMask, valEl: document.getElementById('val-tunnel-mask'), check: isValidMask, msg: 'Invalid subnet mask format.' };
        }

        for (const [key, field] of Object.entries(inputs)) {
            if (!field.el) continue;
            const val = field.el.value;
            const isFieldValid = field.check(val);
            
            if (!isFieldValid) {
                field.el.classList.add('input-invalid');
                field.valEl.textContent = field.msg;
                field.valEl.classList.add('active');
                isValid = false;
            } else {
                field.el.classList.remove('input-invalid');
                field.valEl.textContent = '';
                field.valEl.classList.remove('active');
            }
        }
        
        return isValid;
    }

    // Toggle conditional fields visibility based on VPN Type
    function handleVpnTypeToggle() {
        const isRouteBased = (vpnType.value === 'route');
        const tunnelInput = document.getElementById('tunnel-interface');
        
        if (isRouteBased) {
            tunnelSettingsCard.classList.remove('hidden');
            aclNameContainer.classList.add('hidden');
            
            // Set smart defaults for tunnel names based on vendor
            if (activeVendor.startsWith('mikrotik') && tunnelInput.value === 'Tunnel1') {
                tunnelInput.value = 'ipip-tunnel1';
            } else if (!activeVendor.startsWith('mikrotik') && tunnelInput.value === 'ipip-tunnel1') {
                tunnelInput.value = 'Tunnel1';
            }
        } else {
            tunnelSettingsCard.classList.add('hidden');
            aclNameContainer.classList.remove('hidden');
        }
        generateConfig();
    }

    // Generate Configuration and Update Preview
    function generateConfig() {
        const isFormValid = validateForm();
        const isRouteBased = (vpnType.value === 'route');
        
        // Get all form values
        const data = {
            policy: document.getElementById('isakmp-policy').value,
            encr: document.getElementById('isakmp-encr').value,
            hash: document.getElementById('isakmp-hash').value,
            auth: document.getElementById('isakmp-auth').value,
            key: document.getElementById('isakmp-key').value,
            peerIp: document.getElementById('peer-ip').value,
            tsName: document.getElementById('transform-set-name').value,
            ipsecEncr: document.getElementById('ipsec-encr').value,
            ipsecHash: document.getElementById('ipsec-hash').value,
            mapName: document.getElementById('crypto-map-name').value,
            mapSeq: document.getElementById('crypto-map-seq').value,
            aclName: document.getElementById('acl-name').value,
            localIp: document.getElementById('local-lan-ip').value,
            localWc: localLanWildcard.value,
            localCidr: localLanCidr.value !== 'custom' ? '/' + localLanCidr.value : '',
            remoteIp: document.getElementById('remote-lan-ip').value,
            remoteWc: remoteLanWildcard.value,
            remoteCidr: remoteLanCidr.value !== 'custom' ? '/' + remoteLanCidr.value : '',
            wanInterface: document.getElementById('wan-interface').value,
            wanIp: document.getElementById('wan-ip').value,
            wanMask: wanMask.value,
            // New Tunnel Settings
            tunnelInterface: document.getElementById('tunnel-interface').value,
            tunnelIp: document.getElementById('tunnel-ip').value,
            tunnelMask: tunnelMask.value,
            tunnelCidr: tunnelCidr.value !== 'custom' ? '/' + tunnelCidr.value : ''
        };

        // Determine active line template and explanations
        let scriptLines = [];
        let activeExplanations = {};

        if (activeVendor === 'cisco') {
            activeExplanations = ciscoExplanations;
            
            if (!isRouteBased) {
                // Cisco Policy-Based
                scriptLines = [
                    { type: 'crypto_isakmp_policy', text: `crypto isakmp policy ${data.policy}` },
                    { type: 'encr', text: ` encr ${data.encr}` },
                    { type: 'hash', text: ` hash ${data.hash}` },
                    { type: 'authentication', text: ` authentication ${data.auth}` },
                    { type: 'crypto_isakmp_key', text: `crypto isakmp key ${data.key} address ${data.peerIp} --- (Remote Peer WAN IP)` },
                    { type: 'comment', text: `!` },
                    { type: 'comment', text: `!` },
                    { type: 'crypto_ipsec_transform_set', text: `crypto ipsec transform-set ${data.tsName} ${data.ipsecEncr} ${data.ipsecHash}` },
                    { type: 'comment', text: `!` },
                    { type: 'ip_access_list', text: `ip access-list extended ${data.aclName}` },
                    { type: 'permit_ip', text: ` permit ip ${data.localIp} ${data.localWc} ${data.remoteIp} ${data.remoteWc} --- (LAN to LAN allow)` },
                    { type: 'comment', text: `!` },
                    { type: 'crypto_map_init', text: `crypto map ${data.mapName} ${data.mapSeq} ipsec-isakmp` },
                    { type: 'set_peer', text: ` set peer ${data.peerIp} --- (Remote Peer WAN IP)` },
                    { type: 'set_transform_set', text: ` set transform-set ${data.tsName}` },
                    { type: 'match_address', text: ` match address ${data.aclName}` },
                    { type: 'comment', text: ` !` },
                    { type: 'interface', text: `interface ${data.wanInterface}` },
                    { type: 'description', text: ` description WAN` },
                    { type: 'ip_address', text: ` ip address ${data.wanIp} ${data.wanMask}` },
                    { type: 'negotiation', text: ` negotiation auto` },
                    { type: 'crypto_map_apply', text: ` crypto map ${data.mapName}` },
                    { type: 'end', text: `end` }
                ];
            } else {
                // Cisco Route-Based (VTI)
                const profileName = `${data.mapName}_PROFILE`;
                scriptLines = [
                    { type: 'crypto_isakmp_policy', text: `crypto isakmp policy ${data.policy}` },
                    { type: 'encr', text: ` encr ${data.encr}` },
                    { type: 'hash', text: ` hash ${data.hash}` },
                    { type: 'authentication', text: ` authentication ${data.auth}` },
                    { type: 'crypto_isakmp_key', text: `crypto isakmp key ${data.key} address ${data.peerIp} --- (Remote Peer WAN IP)` },
                    { type: 'comment', text: `!` },
                    { type: 'comment', text: `!` },
                    { type: 'crypto_ipsec_transform_set', text: `crypto ipsec transform-set ${data.tsName} ${data.ipsecEncr} ${data.ipsecHash}` },
                    { type: 'comment', text: `!` },
                    { type: 'crypto_ipsec_profile', text: `crypto ipsec profile ${profileName}` },
                    { type: 'set_transform_profile', text: ` set transform-set ${data.tsName}` },
                    { type: 'comment', text: `!` },
                    { type: 'interface_tunnel', text: `interface ${data.tunnelInterface}` },
                    { type: 'description', text: ` description VPN Tunnel to Remote Peer` },
                    { type: 'ip_address', text: ` ip address ${data.tunnelIp} ${data.tunnelMask}` },
                    { type: 'tunnel_source', text: ` tunnel source ${data.wanInterface}` },
                    { type: 'tunnel_destination', text: ` tunnel destination ${data.peerIp}` },
                    { type: 'tunnel_mode_ipsec', text: ` tunnel mode ipsec ipv4` },
                    { type: 'tunnel_protection', text: ` tunnel protection ipsec profile ${profileName}` },
                    { type: 'comment', text: `!` },
                    { type: 'interface', text: `interface ${data.wanInterface}` },
                    { type: 'description', text: ` description WAN` },
                    { type: 'ip_address', text: ` ip address ${data.wanIp} ${data.wanMask}` },
                    { type: 'negotiation', text: ` negotiation auto` },
                    { type: 'comment', text: `!` },
                    { type: 'ip_route', text: `ip route ${data.remoteIp} ${data.remoteWc.split('.').map(o => 255 - parseInt(o, 10)).join('.')} ${data.tunnelInterface}` },
                    { type: 'end', text: `end` }
                ];
            }
        } else if (activeVendor === 'huawei') {
            activeExplanations = huaweiExplanations;
            
            const vrpEncr = data.encr.replace(' ', '-');
            const vrpHash = data.hash === 'sha1' ? 'sha1' : data.hash;
            const vrpIpsecEncr = data.ipsecEncr.replace('esp-', '').replace(' ', '-');
            const vrpIpsecHash = data.ipsecHash.replace('esp-', '').replace('-hmac', '');

            if (!isRouteBased) {
                // Huawei Policy-Based
                scriptLines = [
                    { type: 'comment', text: `#` },
                    { type: 'hw_acl_init', text: `acl name ${data.aclName} advanced` },
                    { type: 'hw_rule_permit', text: ` rule 5 permit ip source ${data.localIp} ${data.localWc} destination ${data.remoteIp} ${data.remoteWc}` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ike_prop_init', text: `ike proposal ${data.policy}` },
                    { type: 'hw_ike_prop_encr', text: ` encryption-algorithm ${vrpEncr}` },
                    { type: 'hw_ike_prop_hash', text: ` authentication-algorithm ${vrpHash}` },
                    { type: 'hw_ike_prop_dh', text: ` dh group2` },
                    { type: 'hw_ike_prop_auth', text: ` authentication-mode pre-share` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ike_peer_init', text: `ike peer peer_${data.peerIp}` },
                    { type: 'hw_ike_peer_prop', text: ` ike-proposal ${data.policy}` },
                    { type: 'hw_ike_peer_key', text: ` pre-shared-key simple ${data.key}` },
                    { type: 'hw_ike_peer_addr', text: ` remote-address ${data.peerIp}` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ipsec_prop_init', text: `ipsec proposal ${data.tsName}` },
                    { type: 'hw_ipsec_prop_trans', text: ` transform esp` },
                    { type: 'hw_ipsec_prop_encr', text: ` esp encryption-algorithm ${vrpIpsecEncr}` },
                    { type: 'hw_ipsec_prop_hash', text: ` esp authentication-algorithm ${vrpIpsecHash}` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ipsec_policy_init', text: `ipsec policy ${data.mapName} ${data.mapSeq} isakmp` },
                    { type: 'hw_ipsec_policy_acl', text: ` security acl ${data.aclName}` },
                    { type: 'hw_ipsec_policy_proposal', text: ` proposal ${data.tsName}` },
                    { type: 'hw_ipsec_policy_peer', text: ` ike-peer peer_${data.peerIp}` },
                    { type: 'comment', text: `#` },
                    { type: 'interface', text: `interface ${data.wanInterface}` },
                    { type: 'description', text: ` description WAN` },
                    { type: 'ip_address', text: ` ip address ${data.wanIp} ${data.wanMask}` },
                    { type: 'hw_ipsec_apply', text: ` ipsec policy ${data.mapName}` },
                    { type: 'end', text: `return` }
                ];
            } else {
                // Huawei Route-Based
                const profileName = `${data.mapName}_PROFILE`;
                scriptLines = [
                    { type: 'comment', text: `#` },
                    { type: 'hw_ike_prop_init', text: `ike proposal ${data.policy}` },
                    { type: 'hw_ike_prop_encr', text: ` encryption-algorithm ${vrpEncr}` },
                    { type: 'hw_ike_prop_hash', text: ` authentication-algorithm ${vrpHash}` },
                    { type: 'hw_ike_prop_dh', text: ` dh group2` },
                    { type: 'hw_ike_prop_auth', text: ` authentication-mode pre-share` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ike_peer_init', text: `ike peer peer_${data.peerIp}` },
                    { type: 'hw_ike_peer_prop', text: ` ike-proposal ${data.policy}` },
                    { type: 'hw_ike_peer_key', text: ` pre-shared-key simple ${data.key}` },
                    { type: 'hw_ike_peer_addr', text: ` remote-address ${data.peerIp}` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ipsec_prop_init', text: `ipsec proposal ${data.tsName}` },
                    { type: 'hw_ipsec_prop_trans', text: ` transform esp` },
                    { type: 'hw_ipsec_prop_encr', text: ` esp encryption-algorithm ${vrpIpsecEncr}` },
                    { type: 'hw_ipsec_prop_hash', text: ` esp authentication-algorithm ${vrpIpsecHash}` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ipsec_profile_init', text: `ipsec profile ${profileName}` },
                    { type: 'hw_ipsec_profile_proposal', text: ` proposal ${data.tsName}` },
                    { type: 'hw_ipsec_profile_peer', text: ` ike-peer peer_${data.peerIp}` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_interface_tunnel', text: `interface ${data.tunnelInterface}` },
                    { type: 'description', text: ` description VPN Tunnel to Remote Peer` },
                    { type: 'ip_address', text: ` ip address ${data.tunnelIp} ${data.tunnelMask}` },
                    { type: 'hw_tunnel_protocol', text: ` tunnel-protocol ipsec` },
                    { type: 'hw_tunnel_source', text: ` source ${data.wanInterface}` },
                    { type: 'hw_tunnel_destination', text: ` destination ${data.peerIp}` },
                    { type: 'hw_tunnel_profile', text: ` ipsec profile ${profileName}` },
                    { type: 'comment', text: `#` },
                    { type: 'interface', text: `interface ${data.wanInterface}` },
                    { type: 'description', text: ` description WAN` },
                    { type: 'ip_address', text: ` ip address ${data.wanIp} ${data.wanMask}` },
                    { type: 'comment', text: `#` },
                    { type: 'hw_ip_route', text: `ip route-static ${data.remoteIp} ${data.remoteWc.split('.').map(o => 255 - parseInt(o, 10)).join('.')} ${data.tunnelInterface}` },
                    { type: 'end', text: `return` }
                ];
            }
        } else if (activeVendor === 'mikrotik-v6') {
            activeExplanations = mikrotikV6Explanations;
            
            const localCidrNum = wildcardToCidr(data.localWc);
            const remoteCidrNum = wildcardToCidr(data.remoteWc);
            
            const mtEncr = data.encr.replace(' ', '-');
            const mtHash = data.hash;
            const mtIpsecEncr = data.ipsecEncr.replace('esp-', '').replace(' ', '-');
            const mtIpsecHash = data.ipsecHash.replace('esp-', '').replace('-hmac', '');

            if (!isRouteBased) {
                // MikroTik v6 Policy-Based
                scriptLines = [
                    { type: 'comment', text: `# Phase 1 Peer & Credentials (Monolithic ROSv6)` },
                    { type: 'mt6_peer', text: `/ip ipsec peer\nadd address=${data.peerIp}/32 port=500 auth-method=pre-shared-key secret="${data.key}" \\\n    exchange-mode=main send-initial-contact=yes nat-traversal=yes \\\n    enc-algorithms=${mtEncr} hash-algorithm=${mtHash} dh-group=modp1024 lifetime=1d` },
                    { type: 'comment', text: `# Phase 2 (IPsec) Proposal` },
                    { type: 'mt_proposal', text: `/ip ipsec proposal\nadd name=${data.tsName} enc-algorithms=${mtIpsecEncr}-cbc auth-algorithms=${mtIpsecHash} lifetime=8h` },
                    { type: 'comment', text: `# NAT Bypass to prevent local traffic from being NATed before IPsec` },
                    { type: 'mt_nat_bypass', text: `/ip firewall nat\nadd chain=srcnat action=accept src-address=${data.localIp}/${localCidrNum} dst-address=${data.remoteIp}/${remoteCidrNum} place-before=0 comment="VPN Bypass"` },
                    { type: 'comment', text: `# IPsec Policy (Interesting Traffic - IP-matched in ROSv6)` },
                    { type: 'mt6_policy', text: `/ip ipsec policy\nadd src-address=${data.localIp}/${localCidrNum} dst-address=${data.remoteIp}/${remoteCidrNum} protocol=ip action=encrypt \\\n    tunnel=yes sa-src-address=${data.wanIp} sa-dst-address=${data.peerIp} proposal=${data.tsName}` }
                ];
            } else {
                // MikroTik v6 Route-Based (IPIP tunnel with IPsec)
                const tunnelCidrNum = subnetToCidr(data.tunnelMask);
                scriptLines = [
                    { type: 'comment', text: `# Create Secure IPIP Tunnel Interface` },
                    { type: 'mt_ipip_tunnel', text: `/interface ipip\nadd name=${data.tunnelInterface} local-address=${data.wanIp} remote-address=${data.peerIp} ipsec-secret="${data.key}" comment="VPN Tunnel"` },
                    { type: 'comment', text: `# Assign IP Address to Tunnel Interface` },
                    { type: 'mt_tunnel_ip', text: `/ip address\nadd address=${data.tunnelIp}/${tunnelCidrNum} interface=${data.tunnelInterface}` },
                    { type: 'comment', text: `# Static Routing over Secure Tunnel` },
                    { type: 'mt_route', text: `/ip route\nadd dst-address=${data.remoteIp}/${remoteCidrNum} gateway=${data.tunnelInterface} comment="VPN Route"` }
                ];
            }
        } else if (activeVendor === 'mikrotik-v7') {
            activeExplanations = mikrotikV7Explanations;
            
            const localCidrNum = wildcardToCidr(data.localWc);
            const remoteCidrNum = wildcardToCidr(data.remoteWc);
            
            const mtEncr = data.encr.replace(' ', '-');
            const mtHash = data.hash;
            const mtIpsecEncr = data.ipsecEncr.replace('esp-', '').replace(' ', '-');
            const mtIpsecHash = data.ipsecHash.replace('esp-', '').replace('-hmac', '');

            if (!isRouteBased) {
                // MikroTik v7 Policy-Based
                scriptLines = [
                    { type: 'comment', text: `# Phase 1 (ISAKMP) Profile` },
                    { type: 'mt_profile', text: `/ip ipsec profile\nadd name=profile_${data.policy} enc-algorithms=${mtEncr} hash-algorithm=${mtHash} dh-group=modp1024` },
                    { type: 'comment', text: `# Phase 1 Peer` },
                    { type: 'mt_peer', text: `/ip ipsec peer\nadd name=peer_${data.peerIp} address=${data.peerIp} profile=profile_${data.policy} exchange-mode=main` },
                    { type: 'comment', text: `# Pre-Shared Key (Identity split in ROSv7)` },
                    { type: 'mt_identity', text: `/ip ipsec identity\nadd peer=peer_${data.peerIp} secret="${data.key}" auth-method=pre-shared-key` },
                    { type: 'comment', text: `# Phase 2 (IPsec) Proposal` },
                    { type: 'mt_proposal', text: `/ip ipsec proposal\nadd name=${data.tsName} enc-algorithms=${mtIpsecEncr}-cbc auth-algorithms=${mtIpsecHash} lifetime=8h` },
                    { type: 'comment', text: `# NAT Bypass to prevent local traffic from being NATed before IPsec` },
                    { type: 'mt_nat_bypass', text: `/ip firewall nat\nadd chain=srcnat action=accept src-address=${data.localIp}/${localCidrNum} dst-address=${data.remoteIp}/${remoteCidrNum} place-before=0 comment="VPN Bypass"` },
                    { type: 'comment', text: `# IPsec Policy (Interesting Traffic - Peer-bound in ROSv7)` },
                    { type: 'mt7_policy', text: `/ip ipsec policy\nadd src-address=${data.localIp}/${localCidrNum} dst-address=${data.remoteIp}/${remoteCidrNum} protocol=ip action=encrypt \\\n    tunnel=yes sa-src-address=${data.wanIp} sa-dst-address=${data.peerIp} proposal=${data.tsName} peer=peer_${data.peerIp}` }
                ];
            } else {
                // MikroTik v7 Route-Based (IPIP tunnel with IPsec)
                const tunnelCidrNum = subnetToCidr(data.tunnelMask);
                scriptLines = [
                    { type: 'comment', text: `# Create Secure IPIP Tunnel Interface` },
                    { type: 'mt_ipip_tunnel', text: `/interface ipip\nadd name=${data.tunnelInterface} local-address=${data.wanIp} remote-address=${data.peerIp} ipsec-secret="${data.key}" comment="VPN Tunnel"` },
                    { type: 'comment', text: `# Assign IP Address to Tunnel Interface` },
                    { type: 'mt_tunnel_ip', text: `/ip address\nadd address=${data.tunnelIp}/${tunnelCidrNum} interface=${data.tunnelInterface}` },
                    { type: 'comment', text: `# Static Routing over Secure Tunnel` },
                    { type: 'mt_route', text: `/ip route\nadd dst-address=${data.remoteIp}/${remoteCidrNum} gateway=${data.tunnelInterface} comment="VPN Route"` }
                ];
            }
        }

        // Format HTML output with syntax highlighting and interactive line structure
        outputCode.innerHTML = '';
        
        scriptLines.forEach((line, index) => {
            const span = document.createElement('span');
            span.className = 'code-line';
            span.dataset.lineId = line.type;
            
            const localCidrNum = wildcardToCidr(data.localWc);
            const remoteCidrNum = wildcardToCidr(data.remoteWc);
            const tunnelCidrNum = subnetToCidr(data.tunnelMask);

            // Apply variables to explanation template
            let explanation = activeExplanations[line.type] || '';
            explanation = explanation
                .replace('{policy}', data.policy)
                .replace('{encr}', data.encr)
                .replace('{hash}', data.hash)
                .replace('{auth}', data.auth)
                .replace('{key}', data.key)
                .replace('{peer_ip}', data.peerIp)
                .replace('{ts_name}', data.tsName)
                .replace('{profile_name}', `${data.mapName}_PROFILE`)
                .replace('{ipsec_encr}', data.ipsecEncr)
                .replace('{ipsec_hash}', data.ipsecHash)
                .replace('{map_name}', data.mapName)
                .replace('{map_seq}', data.mapSeq)
                .replace('{acl_name}', data.aclName)
                .replace('{local_ip}', data.localIp)
                .replace('{local_wc}', data.localWc)
                .replace('{local_cidr}', localCidrNum)
                .replace('{remote_ip}', data.remoteIp)
                .replace('{remote_wc}', data.remoteWc)
                .replace('{remote_cidr}', remoteCidrNum)
                .replace('{wan_interface}', data.wanInterface)
                .replace('{wan_ip}', data.wanIp)
                .replace('{wan_mask}', data.wanMask)
                // New Route-based variables
                .replace('{tunnel_interface}', data.tunnelInterface)
                .replace('{tunnel_ip}', data.tunnelIp)
                .replace('{tunnel_cidr}', tunnelCidrNum)
                .replace('{tunnel_mask}', data.tunnelMask);

            span.dataset.explanation = explanation;
            
            // Format the code line with markup
            span.innerHTML = highlightCiscoScript(line.text, line.type, data);
            
            // Interactivity: Hover & Click
            span.addEventListener('mouseenter', handleLineHover);
            span.addEventListener('mouseleave', handleLineLeave);
            span.addEventListener('click', handleLineClick);

            outputCode.appendChild(span);
        });
    }

    // Highlighter Engine
    function highlightCiscoScript(text, type, data) {
        let html = escapeHTML(text);

        if (type === 'comment') {
            return `<span class="c-comment">${html}</span>`;
        }

        // Highlight common verbs (keywords)
        const keywords = [
            'crypto', 'isakmp', 'policy', 'key', 'address', 'ipsec', 'transform-set',
            'ip', 'access-list', 'extended', 'permit', 'map', 'set', 'match',
            'interface', 'description', 'negotiation', 'end', 'acl', 'rule',
            'ike', 'proposal', 'encryption-algorithm', 'authentication-algorithm',
            'dh', 'authentication-mode', 'pre-shared-key', 'remote-address',
            'transform', 'esp', 'security', 'profile', 'peer', 'identity',
            'action', 'tunnel', 'sa-src-address', 'sa-dst-address', 'add',
            'chain', 'comment', 'place-before', 'return', 'source', 'destination',
            'mode', 'protection', 'route', 'route-static'
        ];
        
        // Highlight configuration arguments
        const args = [
            'encr', 'hash', 'authentication', 'peer', 'match address', 'negotiation auto',
            'aes', 'sha1', 'sha256', 'sha384', 'sha512', '3des', 'md5', 'pre-share', 'rsa-sig',
            'esp-aes', 'esp-sha-hmac', 'esp-sha256-hmac', 'esp-md5-hmac', 'esp-3des', 'ipsec-isakmp',
            'advanced', 'simple', 'isakmp', 'main', 'pre-shared-key', 'esp-aes-cbc',
            'srcnat', 'accept', 'encrypt', 'notrack', 'prerouting', 'yes', 'ipv4', 'tunnel-protocol'
        ];

        // Replace keywords
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'g');
            html = html.replace(regex, `<span class="c-keyword">${keyword}</span>`);
        });

        // Replace args
        args.forEach(arg => {
            const regex = new RegExp(`\\b${arg}\\b`, 'g');
            html = html.replace(regex, `<span class="c-arg">${arg}</span>`);
        });

        // Highlight user values
        const localCidrNum = wildcardToCidr(data.localWc);
        const remoteCidrNum = wildcardToCidr(data.remoteWc);
        const tunnelCidrNum = subnetToCidr(data.tunnelMask);

        const userValues = [
            data.policy, data.key, data.peerIp, data.tsName, data.mapName, data.mapSeq,
            data.aclName, data.localIp, data.localWc, data.remoteIp, data.remoteWc,
            data.wanInterface, data.wanIp, data.wanMask, 
            `${data.localIp}/${localCidrNum}`, `${data.remoteIp}/${remoteCidrNum}`,
            data.tunnelInterface, data.tunnelIp, data.tunnelMask,
            `${data.tunnelIp}/${tunnelCidrNum}`, `${data.mapName}_PROFILE`
        ];

        userValues.sort((a, b) => b.toString().length - a.toString().length);

        userValues.forEach(val => {
            if (!val || val.toString().trim() === '') return;
            const escapedVal = escapeRegExp(val.toString());
            const regex = new RegExp(`(?<![A-Za-z0-9_\\-<>])(${escapedVal})(?![A-Za-z0-9_\\-<>])`, 'g');
            html = html.replace(regex, `<span class="c-val">$1</span>`);
        });

        html = html.replace(/(---.*$)/g, `<span class="c-comment">$1</span>`);

        return html;
    }

    // Helper: Escape HTML
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Helper: Escape Regex characters
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Interactive Hover/Click actions for code lines
    let activeClickedLine = null;

    function handleLineHover(e) {
        if (activeClickedLine) return;
        
        const explanation = e.currentTarget.dataset.explanation;
        if (explanation) {
            explanationText.innerHTML = explanation;
            explanationCard.classList.add('highlight');
        }
    }

    function handleLineLeave() {
        if (activeClickedLine) return;
        
        const currentVendorName = activeVendor === 'cisco' ? 'Cisco IOS' 
                                  : activeVendor === 'huawei' ? 'Huawei VRP' 
                                  : activeVendor === 'mikrotik-v6' ? 'MikroTik RouterOS v6' 
                                  : 'MikroTik RouterOS v7';
        explanationText.innerHTML = `Hover or click on any line of code in the editor above to see a detailed explanation of what that command does in the ${currentVendorName} environment.`;
        explanationCard.classList.remove('highlight');
    }

    function handleLineClick(e) {
        document.querySelectorAll('.code-line').forEach(line => line.classList.remove('active'));
        
        const currentVendorName = activeVendor === 'cisco' ? 'Cisco IOS' 
                                  : activeVendor === 'huawei' ? 'Huawei VRP' 
                                  : activeVendor === 'mikrotik-v6' ? 'MikroTik RouterOS v6' 
                                  : 'MikroTik RouterOS v7';

        if (activeClickedLine === e.currentTarget) {
            activeClickedLine = null;
            explanationText.innerHTML = `Hover or click on any line of code in the editor above to see a detailed explanation of what that command does in the ${currentVendorName} environment.`;
            explanationCard.classList.remove('highlight');
        } else {
            activeClickedLine = e.currentTarget;
            activeClickedLine.classList.add('active');
            
            const explanation = activeClickedLine.dataset.explanation;
            explanationText.innerHTML = explanation;
            explanationCard.classList.add('highlight');
        }
    }

    // Copy Configuration to Clipboard
    function copyConfig() {
        const lines = Array.from(document.querySelectorAll('.code-line'))
            .map(span => span.textContent.split('---')[0].trimEnd());
        
        const rawConfig = lines.join('\n');

        navigator.clipboard.writeText(rawConfig).then(() => {
            const originalText = btnCopy.innerHTML;
            btnCopy.classList.add('copy-success');
            btnCopy.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied!
            `;
            
            setTimeout(() => {
                btnCopy.classList.remove('copy-success');
                btnCopy.innerHTML = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy config: ', err);
            alert('Could not copy configuration. Please select and copy manually.');
        });
    }

    // Download Configuration File
    function downloadConfig() {
        const lines = Array.from(document.querySelectorAll('.code-line'))
            .map(span => span.textContent.split('---')[0].trimEnd());
        const rawConfig = lines.join('\n');
        
        const mapName = document.getElementById('crypto-map-name').value || 'VPN';
        const fileExt = activeVendor.startsWith('mikrotik') ? 'rsc' : 'cfg';
        const filename = `${mapName.toLowerCase()}_${activeVendor}_config.${fileExt}`;
        
        const blob = new Blob([rawConfig], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Reset Form to Default Values
    function resetForm() {
        Object.keys(defaultValues).forEach(key => {
            const el = document.getElementsByName(key)[0];
            if (el) {
                el.value = defaultValues[key];
                
                if (el.tagName === 'SELECT') {
                    if (key === 'localLanCidr') {
                        localLanWildcard.value = defaultValues.localLanWildcard;
                        localLanWildcard.setAttribute('readonly', true);
                    } else if (key === 'remoteLanCidr') {
                        remoteLanWildcard.value = defaultValues.remoteLanWildcard;
                        remoteLanWildcard.setAttribute('readonly', true);
                    } else if (key === 'wanCidr') {
                        wanMask.value = defaultValues.wanMask;
                        wanMask.setAttribute('readonly', true);
                    } else if (key === 'tunnelCidr') {
                        tunnelMask.value = defaultValues.tunnelMask;
                        tunnelMask.setAttribute('readonly', true);
                    }
                }
            }
        });
        
        activeClickedLine = null;
        handleVpnTypeToggle();
    }

    // Bind Event Listeners
    form.addEventListener('input', generateConfig);
    vpnType.addEventListener('change', handleVpnTypeToggle);
    
    // Mask calculations on dropdown changes
    localLanCidr.addEventListener('change', () => {
        handleCidrChange(localLanCidr, localLanWildcard, true);
        generateConfig();
    });
    
    remoteLanCidr.addEventListener('change', () => {
        handleCidrChange(remoteLanCidr, remoteLanWildcard, true);
        generateConfig();
    });
    
    wanCidr.addEventListener('change', () => {
        handleCidrChange(wanCidr, wanMask, false);
        generateConfig();
    });

    tunnelCidr.addEventListener('change', () => {
        handleCidrChange(tunnelCidr, tunnelMask, false);
        generateConfig();
    });
    
    // Custom mask changes require regeneration
    localLanWildcard.addEventListener('input', generateConfig);
    remoteLanWildcard.addEventListener('input', generateConfig);
    wanMask.addEventListener('input', generateConfig);
    tunnelMask.addEventListener('input', generateConfig);

    // Actions
    btnCopy.addEventListener('click', copyConfig);
    btnDownload.addEventListener('click', downloadConfig);
    btnReset.addEventListener('click', resetForm);
    
    btnGeneratePsk.addEventListener('click', () => {
        const securePsk = generateSecurePSK();
        document.getElementById('isakmp-key').value = securePsk;
        generateConfig();
    });

    // Vendor Tab Switch Bindings
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeVendor = e.currentTarget.dataset.vendor;
            
            const terminalTitle = document.querySelector('.terminal-title');
            const btnDownload = document.getElementById('btn-download');
            const tunnelInput = document.getElementById('tunnel-interface');
            
            if (activeVendor === 'cisco') {
                terminalTitle.textContent = 'Cisco IOS Configuration Terminal';
                btnDownload.textContent = 'Download (.cfg)';
                if (tunnelInput.value === 'ipip-tunnel1') tunnelInput.value = 'Tunnel1';
            } else if (activeVendor === 'huawei') {
                terminalTitle.textContent = 'Huawei VRP Configuration Terminal';
                btnDownload.textContent = 'Download (.cfg)';
                if (tunnelInput.value === 'ipip-tunnel1') tunnelInput.value = 'Tunnel1';
            } else if (activeVendor === 'mikrotik-v6') {
                terminalTitle.textContent = 'MikroTik RouterOS v6 Configuration Terminal';
                btnDownload.textContent = 'Download (.rsc)';
                if (tunnelInput.value === 'Tunnel1') tunnelInput.value = 'ipip-tunnel1';
            } else if (activeVendor === 'mikrotik-v7') {
                terminalTitle.textContent = 'MikroTik RouterOS v7 Configuration Terminal';
                btnDownload.textContent = 'Download (.rsc)';
                if (tunnelInput.value === 'Tunnel1') tunnelInput.value = 'ipip-tunnel1';
            }
            
            activeClickedLine = null;
            const currentVendorName = activeVendor === 'cisco' ? 'Cisco IOS' 
                                      : activeVendor === 'huawei' ? 'Huawei VRP' 
                                      : activeVendor === 'mikrotik-v6' ? 'MikroTik RouterOS v6' 
                                      : 'MikroTik RouterOS v7';
            explanationText.innerHTML = `Hover or click on any line of code in the editor above to see a detailed explanation of what that command does in the ${currentVendorName} environment.`;
            explanationCard.classList.remove('highlight');

            generateConfig();
        });
    });

    // Initial Run
    handleVpnTypeToggle();
});
