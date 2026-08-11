import re

def clean_mac(m):
    return "".join(c.lower() for c in m if c.isalnum())

def parse_vsol_mac_table(text):
    """
    Parses VSOL OLT MAC address table.
    Format:
    VlanId     MacAddress       Type      Port
    --------------------------------------------------
    100        00e0-fc12-3456   dynamic   gpon0/1:15
    """
    return parse_generic_mac_table(text)

def parse_cdata_mac_table(text):
    """
    Parses CDATA OLT MAC address table. Supports multiple table formats dynamically.
    Format 1 (Standard):
    Vlan-ID    MAC-Address         Type        Port        ONT-ID
    -------------------------------------------------------------
    100        00:e0:fc:12:34:56   dynamic     gpon 0/1    15

    Format 2 (Alternative):
    MAC             VLAN    Sport   Port            Onu     Gemid   MAC-Type
    -----------------------------------------------------------------------------
    00:1F:CA:05:35:90  830  -       xge0/0/1        -       -       dynamic
    """
    return parse_generic_mac_table(text)

def parse_generic_mac_table(text, default_vlan=None):
    """
    A smart, format-agnostic OLT MAC Address table parser.
    Iterates line-by-line, detects column headers dynamically, and extracts fields with precision.
    """
    entries = []
    lines = text.strip().split('\n')
    
    # 1. Detect header columns
    header_parts = []
    for line in lines:
        line_lower = line.strip().lower()
        if any(h in line_lower for h in ("vlan", "mac", "type", "port", "onu", "ont")):
            # Standardize names to find column positions
            cleaned_header = line_lower.replace("-", " ").replace("_", " ").replace("/", " ")
            header_parts = cleaned_header.split()
            break
            
    # Default column indices
    mac_col = -1
    vlan_col = -1
    ont_col = -1
    port_col = -1
    type_col = -1
    sport_col = -1
    gemid_col = -1
    
    if header_parts:
        for idx, part in enumerate(header_parts):
            if "mac" in part:
                mac_col = idx
            elif "vlan" in part:
                vlan_col = idx
            elif "onu" in part or "ont" in part:
                ont_col = idx
            elif "port" in part:
                port_col = idx
            elif "type" in part:
                type_col = idx
            elif "sport" in part:
                sport_col = idx
            elif "gem" in part:
                gemid_col = idx

    # Regex for various MAC formats (colons, hyphens, dots, or raw hex)
    mac_pattern = re.compile(
        r'(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}|' # 00:e0:fc:12... or 00-e0-fc-12...
        r'(?:[0-9a-fA-F]{4}[-:.]){2}[0-9a-fA-F]{4}|' # 00e0:fc12:3456, 00e0-fc12-3456, 00e0.fc12.3456
        r'[0-9a-fA-F]{12}'                          # 12 digits raw hex
    )
    
    for line in lines:
        line_strip = line.strip()
        if not line_strip:
            continue
            
        # Skip header metadata lines
        if any(h in line_strip.lower() for h in ("vlan", "mac", "type", "port", "total", "illegal", "active", "index", "welcome", "password")) or line_strip.startswith('-') or line_strip.startswith('='):
            continue
            
        # Merge spaces in port prefixes (e.g. "GPON 0/8:002" -> "GPON0/8:002", "GE 0/5" -> "GE0/5")
        line_strip = re.sub(r'\b(gpon|ge|xe|xge|tg|epon|pon)\s+(\d+/\d+)', r'\1\2', line_strip, flags=re.IGNORECASE)
        parts = line_strip.split()
        if len(parts) < 2:
            continue
            
        # Find MAC address token
        mac = None
        curr_mac_idx = -1
        for idx, p in enumerate(parts):
            p_clean = p.strip("(),[]")
            if mac_pattern.match(p_clean):
                mac = p_clean
                curr_mac_idx = idx
                break
                
        if not mac:
            continue
            
        vlan = default_vlan
        mtype = "dynamic"
        port = "-"
        ont_id = None
        sport = "-"
        gemid = "-"
        
        # If we successfully parsed header columns, extract values by index
        if header_parts and len(parts) == len(header_parts):
            if vlan_col != -1 and vlan_col < len(parts):
                vlan = parts[vlan_col]
            if ont_col != -1 and ont_col < len(parts):
                ont_id = parts[ont_col]
            if port_col != -1 and port_col < len(parts):
                port = parts[port_col]
            if type_col != -1 and type_col < len(parts):
                mtype = parts[type_col]
            if sport_col != -1 and sport_col < len(parts):
                sport = parts[sport_col]
            if gemid_col != -1 and gemid_col < len(parts):
                gemid = parts[gemid_col]
        else:
            # Fallback to heuristic parsing if column counts differ or no header found
            for p in parts:
                if p.lower() in ("dynamic", "static"):
                    mtype = p.lower()
                    break
                    
            integers = [p for idx, p in enumerate(parts) if p.isdigit() and idx != curr_mac_idx]
            
            port_candidates = [p for p in parts if '/' in p or p.lower().startswith(('gpon', 'ge', 'xge', 'pon', 'uni', 'ethernet'))]
            if port_candidates:
                port = port_candidates[0]
                if ":" in port:
                    port_part, ont_part = port.split(":", 1)
                    port = port_part
                    ont_id = ont_part
                elif len(port.split('/')) == 3:
                    s, p_num, o = port.split('/')
                    if not any(prefix in s.lower() for prefix in ('ge', 'xe', 'xge', 'tg', 'ethernet')):
                        port = f"{s}/{p_num}"
                        ont_id = o
                    
            non_port_ints = [val for val in integers if val != ont_id]
            if non_port_ints:
                if len(non_port_ints) == 1:
                    val = int(non_port_ints[0])
                    if default_vlan:
                        ont_id = str(val)
                    else:
                        if val <= 128:
                            ont_id = str(val)
                        else:
                            vlan = str(val)
                elif len(non_port_ints) >= 2:
                    val1 = int(non_port_ints[0])
                    val2 = int(non_port_ints[1])
                    if 1 <= val1 <= 4094:
                        vlan = str(val1)
                        ont_id = str(val2)
                    else:
                        ont_id = str(val1)
                        vlan = str(val2)
                        
        # Post-process port and ont_id for unified formats
        if port and port != "-":
            # Clean GPON interface prefix if present
            if port.lower().startswith("gpon") and port.lower() != "gpon":
                port = port.lower().replace("gpon", "")
                
            if ":" in port:
                port_part, ont_part = port.split(":", 1)
                port = port_part
                if not ont_id or ont_id == "-":
                    ont_id = ont_part
            elif len(port.split('/')) == 3:
                s, p_num, o = port.split('/')
                if not any(prefix in s.lower() for prefix in ('ge', 'xe', 'xge', 'tg', 'ethernet')):
                    port = f"{s}/{p_num}"
                    if not ont_id or ont_id == "-":
                        ont_id = o
                    
        # If port is missing but ont_id contains slot/port/onu (e.g. FH-Net EPON)
        if (not port or port == "-") and ont_id and len(ont_id.split('/')) == 3:
            s, p_num, o = ont_id.split('/')
            port = f"{s}/{p_num}"
            ont_id = o
            
        # Ensure uplink ports never get assigned an ONT ID
        if port and any(prefix in port.lower() for prefix in ('ge', 'xe', 'xge', 'tg', 'ethernet')):
            ont_id = None
            
        # Clean up values
        if ont_id == "-":
            ont_id = None
        if sport == "-":
            sport = "-"
        if gemid == "-":
            gemid = "-"
            
        entries.append({
            "mac": mac,
            "vlan": str(vlan) if vlan else (str(default_vlan) if default_vlan else "-"),
            "sport": sport,
            "port": port,
            "ont_id": ont_id,
            "gemid": gemid,
            "type": mtype
        })
        
    return entries
