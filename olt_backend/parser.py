import re

def parse_vsol_onu_status(text):
    """
    Parses VSOL show onu status output.
    Example:
    OnuID  State       Mac             Mode       LastDyingGaspTime
    -------------------------------------------------------------
    1      online      VSOL00123456    gpon       2026-07-06 12:00:00
    2      offline     VSOL00123457    gpon       2026-07-06 11:30:00
    """
    return parse_generic_onu_status(text)

def parse_cdata_ont_status(text):
    """
    Parses CDATA show ont info output.
    """
    return parse_generic_onu_status(text)

def parse_generic_onu_status(text):
    """
    Format-agnostic parser to find ONT/ONU status, Serial Numbers, and IDs from OLT output tables/details.
    Works for VSOL, CDATA, Huawei, FH-Net, PHYHOME, UTStarcom.
    """
    onus = []
    lines = text.splitlines()
    
    # Check if this is the detail view format (contains key-value colons and ONT-ID / ONU-ID)
    is_detail_view = any(":" in line and any(k in line.lower() for k in ("ont-id", "onu-id", "onu id", "ont id")) for line in lines)
    
    if is_detail_view:
        info = {}
        for line in lines:
            line = line.strip()
            if ":" in line:
                key, val = line.split(":", 1)
                info[key.strip().lower()] = val.strip()
        
        id_key = next((k for k in info if any(x in k for x in ("ont-id", "onu-id", "onu id", "ont id"))), None)
        if id_key:
            run_state = ""
            for k, v in info.items():
                if any(x in k for x in ("state", "status", "run state", "run-state")):
                    run_state = v
                    break
            sn = info.get("serial number") or info.get("serial-number") or info.get("sn") or info.get("mac") or info.get("mac-address") or info.get("mac address") or "Unknown"
            desc = info.get("description") or info.get("desc") or ""
            
            # Remove parentheses or brackets from serial
            sn_clean = sn.strip("()[]")
            
            return [{
                "id": int(info[id_key]),
                "status": "online" if run_state.lower() in ("online", "up", "active", "working", "enable") else "offline",
                "sn": sn_clean,
                "description": desc or f"SN: {sn_clean}"
            }]
        return []
        
    for line in lines:
        line = line.strip()
        if not line or line.startswith('-') or line.startswith('=') or any(h in line.lower() for h in ("index", "ont-id", "onuid", "onu-id", "mac address", "mac-address", "registertime", "state", "status", "control-flag")):
            continue
            
        parts = line.split()
        if len(parts) >= 2:
            status = "offline"
            status_idx = -1
            for idx, p in enumerate(parts):
                p_lower = p.lower()
                if p_lower in ("online", "offline", "up", "down", "active", "working", "up/active"):
                    status = "online" if p_lower in ("online", "up", "active", "working", "up/active") else "offline"
                    status_idx = idx
                    break
            
            if status_idx != -1:
                onu_id = None
                # ID is usually the first digit or path-like token
                for p in parts:
                    p_clean = p.split('/')[-1] if '/' in p else p
                    if p_clean.isdigit():
                        onu_id = int(p_clean)
                        break
                
                # SN is usually a hex string or SN format
                sn = "Unknown"
                for idx, p in enumerate(parts):
                    p_clean = p.strip("()[]")
                    if len(p_clean) >= 8 and any(c in p_clean.lower() for c in "abcdef") and any(c.isdigit() for c in p_clean):
                        sn = p_clean
                        break
                        
                if onu_id is not None:
                    onus.append({
                        "id": onu_id,
                        "status": status,
                        "sn": sn,
                        "description": f"ONT ID: {onu_id}"
                    })
    return onus

def parse_optical_info(text):
    """
    Parses optical transceiver diagnostic info for all brands.
    Supports standard key-value outputs as well as FH-Net parenthesized dBm fields.
    """
    result = {
        "rx_power": "N/A",
        "tx_power": "N/A",
        "olt_rx_power": "N/A",
        "temperature": "N/A",
        "voltage": "N/A",
        "bias_current": "N/A",
        "raw": text
    }
    
    for line in text.splitlines():
        line = line.strip()
        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip().lower()
            val = val.strip()
            
            # Prioritize dBm value if parenthesized, e.g. "1.5 mW (1.83 dBm)" or "(-20.1773 dBm)"
            dbm_match = re.search(r'(-?\d+\.?\d*)\s*dBm', val, re.IGNORECASE)
            if dbm_match:
                num_val = dbm_match.group(1)
            else:
                match = re.search(r'(-?\d+\.?\d*)', val)
                num_val = match.group(1) if match else val
            
            if not num_val or num_val.lower() == "n/a" or num_val.lower() == "none" or num_val == "-":
                num_val = "N/A"
                
            if "olt rx" in key or "olt-rx" in key:
                result["olt_rx_power"] = f"{num_val} dBm" if num_val != "N/A" else "N/A"
            elif "rx" in key or "input" in key:
                result["rx_power"] = f"{num_val} dBm" if num_val != "N/A" else "N/A"
            elif "tx" in key or "output" in key:
                result["tx_power"] = f"{num_val} dBm" if num_val != "N/A" else "N/A"
            elif "temp" in key or "temperature" in key:
                result["temperature"] = f"{num_val} °C" if num_val != "N/A" else "N/A"
            elif "volt" in key:
                result["voltage"] = f"{num_val} V" if num_val != "N/A" else "N/A"
            elif "bias" in key:
                result["bias_current"] = f"{num_val} mA" if num_val != "N/A" else "N/A"
                
    return result

def parse_vsol_autofind(text):
    """
    Parses VSOL show onu auto-find output.
    """
    onus = []
    lines = text.splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith('-') or line.startswith('=') or "GPON" in line or "Mac" in line or "OnuID" in line:
            continue
        parts = line.split()
        if len(parts) >= 2:
            port_part = parts[0]
            if port_part.isdigit() or ("/" in port_part):
                sn = parts[1]
                rssi = parts[2] if len(parts) > 2 else "Unknown"
                onus.append({
                    "port": port_part,
                    "sn": sn,
                    "rssi": f"{rssi} dBm" if rssi != "Unknown" and "db" not in rssi.lower() else rssi
                })
    return onus

def parse_cdata_autofind(text):
    """
    Parses CDATA show ont autofind output.
    """
    onus = []
    lines = text.splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith('-') or line.startswith('=') or "Index" in line or "ONT-SN" in line:
            continue
        parts = line.split()
        if len(parts) >= 2:
            if parts[0].isdigit():
                sn = parts[1]
                rssi = parts[2] if len(parts) > 2 else "Unknown"
                onus.append({
                    "port": "Unknown",
                    "sn": sn,
                    "rssi": f"{rssi} dBm" if rssi != "Unknown" and "db" not in rssi.lower() else rssi
                })
    return onus

def parse_generic_vlan_info(text):
    """
    Parses OLT show vlan <id> details output.
    Extracts Vlan ID, Name, Mac Address, Tagged Ports, Untagged Ports.
    """
    result = {
        "vlan_id": "N/A",
        "name": "N/A",
        "mac_address": "N/A",
        "tagged_ports": "N/A",
        "untagged_ports": "N/A",
        "raw": text
    }
    
    lines = text.splitlines()
    current_key = None
    tagged_list = []
    untagged_list = []
    
    for line in lines:
        line_strip = line.strip()
        if not line_strip:
            continue
            
        if ":" in line_strip:
            parts = line_strip.split(":", 1)
            key = parts[0].strip().lower()
            val = parts[1].strip()
            
            if "vlan id" in key or "vlan-id" in key:
                result["vlan_id"] = val
                current_key = "vlan_id"
            elif "name" in key:
                result["name"] = val
                current_key = "name"
            elif "mac" in key:
                result["mac_address"] = val
                current_key = "mac_address"
            elif "tagged" in key:
                if val:
                    tagged_list.append(val)
                current_key = "tagged"
            elif "untagged" in key:
                if val:
                    untagged_list.append(val)
                current_key = "untagged"
            else:
                current_key = None
        else:
            if current_key == "tagged":
                tagged_list.append(line_strip)
            elif current_key == "untagged":
                untagged_list.append(line_strip)
                
    if tagged_list:
        result["tagged_ports"] = ", ".join(tagged_list)
    if untagged_list:
        result["untagged_ports"] = ", ".join(untagged_list)
        
    return result
