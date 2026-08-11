import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import os
import json
import uuid
import csv
import io
import re
import sys
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from parser import parse_vsol_onu_status, parse_cdata_ont_status, parse_optical_info, parse_vsol_autofind, parse_cdata_autofind, parse_generic_onu_status, parse_generic_vlan_info
from mac_parser import parse_vsol_mac_table, parse_cdata_mac_table, parse_generic_mac_table
from telnet_client import OLTConnection

from flask import Blueprint
olt_bp = Blueprint('olt', __name__)



# --- SIMULATION MOCK DATA ---
def simulate_optical_info(ont_id):
    rx_powers = {
        1: "-18.45 dBm",
        2: "-26.12 dBm",  # Warning / Borderline low
        3: "N/A",         # Offline
        4: "-15.20 dBm",  # Strong signal
        5: "N/A"          # Offline
    }
    rx = rx_powers.get(int(ont_id) if str(ont_id).isdigit() else 1, "-20.00 dBm")
    if rx == "N/A":
        return {
            "rx_power": "N/A",
            "tx_power": "N/A",
            "olt_rx_power": "N/A",
            "temperature": "N/A",
            "voltage": "N/A",
            "bias_current": "N/A",
            "raw": "ONT is Offline. Optical signals not available."
        }
    return {
        "rx_power": rx,
        "tx_power": "2.15 dBm",
        "olt_rx_power": "-19.80 dBm",
        "temperature": "43.5 °C",
        "voltage": "3.31 V",
        "bias_current": "12.4 mA",
        "raw": f"ONT Rx Power    : {rx}\nONT Tx Power    : 2.15 dBm\nOLT Rx Power    : -19.80 dBm\nTemperature     : 43.5 C\nVoltage         : 3.31 V\nBias Current    : 12.4 mA"
    }


# --- ROUTES ---

def get_db_file_path():
    if hasattr(sys, '_MEIPASS'):
        exe_dir = os.path.dirname(sys.executable)
        target_path = os.path.join(exe_dir, 'olts.json')
        if not os.path.exists(target_path):
            bundled_path = os.path.join(sys._MEIPASS, 'backend', 'olts.json')
            if os.path.exists(bundled_path):
                import shutil
                try:
                    shutil.copy(bundled_path, target_path)
                except Exception:
                    pass
        return target_path
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'olts.json')

DB_FILE = get_db_file_path()

@olt_bp.after_request
def add_header(response):
    response.cache_control.no_store = True
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

# @app.route('/')
def serve_index_disabled():
    return 'disabled'

# @app.route('/<path:path>')
def serve_static_disabled(path):
    return 'disabled'

# GET: Fetch list of OLT profiles
@olt_bp.route('/olts', methods=['GET'])
def get_olts_list():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return jsonify(json.load(f))
        except Exception:
            pass
    return jsonify([])

# POST: Import OLT profiles from CSV or JSON file upload
@olt_bp.route('/olts/import', methods=['POST'])
def import_olts():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    filename = file.filename.lower()
    olts = []
    
    try:
        if filename.endswith('.json'):
            content = file.read().decode('utf-8')
            olts = json.loads(content)
        elif filename.endswith('.csv'):
            content = file.read().decode('utf-8')
            csv_reader = csv.DictReader(io.StringIO(content))
            for row in csv_reader:
                mapped = {}
                for k, v in row.items():
                    if k:
                        k_clean = k.strip().lower().replace(' ', '_').replace('-', '_')
                        mapped[k_clean] = v.strip() if v else ""
                
                # Check required fields
                host = mapped.get('host') or mapped.get('ip') or mapped.get('ip_address')
                if not host:
                    continue  # skip invalid rows
                    
                name = mapped.get('name') or mapped.get('olt_name') or f"OLT-{host}"
                port = int(mapped.get('port')) if mapped.get('port') and mapped.get('port').isdigit() else 23
                username = mapped.get('username') or mapped.get('user') or "admin"
                password = mapped.get('password') or mapped.get('pass') or ""
                enable_password = mapped.get('enable_password') or mapped.get('enable_pass') or mapped.get('enable') or ""
                brand = mapped.get('brand') or mapped.get('model') or mapped.get('type') or "vsol"
                
                olts.append({
                    "id": str(uuid.uuid4()),
                    "name": name,
                    "host": host,
                    "port": port,
                    "username": username,
                    "password": password,
                    "enable_password": enable_password,
                    "brand": brand.lower()
                })
        else:
            return jsonify({"error": "Unsupported file format. Please upload .csv or .json"}), 400
            
        with open(DB_FILE, 'w') as f:
            json.dump(olts, f, indent=4)
            
        return jsonify({"success": True, "count": len(olts)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Helper to get connection params from request JSON
def get_conn_params(data):
    host = data.get("host")
    port_val = data.get("port", 23)
    try:
        port = int(port_val)
    except (ValueError, TypeError):
        port = 23
    username = data.get("username")
    password = data.get("password")
    enable_password = data.get("enable_password", "")
    brand = data.get("brand", "vsol").lower()
    
    # Redirect localhost:23 to simulator port 9923
    if host in ("127.0.0.1", "localhost") and port == 23:
        host = "127.0.0.1"
        port = 9923
        
    return host, port, username, password, enable_password, brand

import re

def parse_interfaces_from_output(output, brand):
    lines = output.splitlines()
    interfaces = set()
    
    p_simple = re.compile(r'\b(ge\d+|xge\d+|xe\d+|tg\d+|ethernet\d+)\b', re.IGNORECASE)
    p_long = re.compile(r'\b(gigabitethernet|giga-ethernet|giga|ethernet|tg|xe)\s*\d+/\d+\b', re.IGNORECASE)
    p_huawei = re.compile(r'\b\d+/\d+/\d+\b')
    p_slot_port = re.compile(r'\b\d+/\d+\b')
    
    for line in lines:
        line_lower = line.lower()
        if any(x in line_lower for x in ('gpon', 'epon', 'pon', 'olt', 'onu', 'loopback', 'null', 'vlan', 'smartgroup')):
            continue
            
        m_simple = p_simple.findall(line)
        for m in m_simple:
            interfaces.add(m.lower())
            
        m_long = p_long.findall(line)
        for m in m_long:
            interfaces.add(m.lower())
            
        m_huawei = p_huawei.findall(line)
        for m in m_huawei:
            interfaces.add(m)
            
        if any(w in line_lower for w in ('interface', 'port', 'link', 'up', 'down', 'speed', 'duplex', 'phy', 'protocol')):
            m_slot_port = p_slot_port.findall(line)
            for m in m_slot_port:
                parts = m.split('/')
                if len(parts[0]) < 3 and len(parts[1]) < 3:
                    interfaces.add(m)
                    
    def natural_sort_key(s):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]
        
    return sorted(list(interfaces), key=natural_sort_key)

def fetch_olt_interfaces(conn):
    brand = conn.brand.lower()
    commands = []
    if 'vsol' in brand or 'atop' in brand:
        commands = ['show interface brief', 'show port state all', 'show interface']
    elif 'huawei' in brand:
        commands = ['display interface brief', 'display interface']
    elif 'phyhome' in brand:
        commands = ['show interface brief', 'show port status', 'show interface']
    else:
        commands = ['show interface brief', 'show interface status', 'show interface']
        
    for cmd in commands:
        try:
            output = conn.execute_cmd(cmd)
            interfaces = parse_interfaces_from_output(output, brand)
            if interfaces:
                return interfaces
        except Exception:
            continue
    return []

def get_fallback_interfaces(brand):
    brand_lower = brand.lower()
    if 'vsol' in brand_lower or 'atop' in brand_lower:
        return ['ge1', 'ge2', 'ge3', 'ge4', 'ge5', 'ge6', 'ge7', 'ge8', 'xge1', 'xge2', 'xge3', 'xge4']
    elif 'huawei' in brand_lower:
        return ['0/19/0', '0/19/1', '0/20/0', '0/20/1']
    elif 'phyhome' in brand_lower:
        return ['ge1', 'ge2', 'ge3', 'ge4', 'xge1', 'xge2']
    else:
        return ['ge1', 'ge2', 'ge3', 'ge4', 'ge5', 'ge6', 'ge7', 'ge8', 'ge9', 'ge10', 'ge11', 'ge12', 'xge1', 'xge2', 'xge3', 'xge4', 'xge5', 'xge6', 'xge7', 'xge8']

# POST /api/query/interfaces
@olt_bp.route('/query/interfaces', methods=['POST'])
def query_interfaces():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password', 'brand')):
        return jsonify({"error": "Missing parameters"}), 400
        
    host, port, username, password, enable_password, brand = get_conn_params(data)
    
    try:
        conn = get_cached_connection(host, port, username, password, enable_password, brand)
        interfaces = fetch_olt_interfaces(conn)
        if not interfaces:
            interfaces = get_fallback_interfaces(brand)
        return jsonify({"success": True, "interfaces": interfaces})
    except Exception as e:
        interfaces = get_fallback_interfaces(brand)
        return jsonify({"success": False, "interfaces": interfaces, "error": str(e)})
# Global sessions cache to keep Telnet connections open persistently
sessions_cache = {}

def get_cached_connection(host, port, username, password, enable_password, brand):
    key = f"{host}:{port}:{brand}"
    if key in sessions_cache:
        conn = sessions_cache[key]
        if conn.client and conn.client.sock:
            try:
                # Test connection by doing a dry-run send
                conn.client.sock.send(b"")
                return conn
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass
                del sessions_cache[key]
                
    # Create new persistent connection
    conn = OLTConnection(host, port, username, password, enable_password, brand)
    conn.connect()
    sessions_cache[key] = conn
    return conn

# POST /api/auth/login
@olt_bp.route('/auth/login', methods=['POST'])
def auth_login():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password', 'brand')):
        return jsonify({"error": "Missing connection parameters"}), 400
        
    host, port, username, password, enable_password, brand = get_conn_params(data)
    
    # Close any existing session for this OLT in cache to reset cleanly
    key = f"{host}:{port}:{brand}"
    if key in sessions_cache:
        try:
            sessions_cache[key].close()
        except Exception:
            pass
        del sessions_cache[key]
        
    try:
        # Establish, log in, and cache the session
        conn = get_cached_connection(host, port, username, password, enable_password, brand)
        log = conn.session_log
        conn.session_log = "" 
        return jsonify({"success": True, "message": "Login succeeded!", "console_log": log})
    except Exception as e:
        log = conn.session_log if 'conn' in locals() else ""
        if key in sessions_cache:
            del sessions_cache[key]
        return jsonify({"error": str(e), "console_log": log}), 500

# POST /api/auth/disconnect
@olt_bp.route('/auth/disconnect', methods=['POST'])
def auth_disconnect():
    data = request.json
    host = data.get("host")
    port = int(data.get("port", 23))
    
    # Redirect localhost:23 to simulator port 9923
    if host in ("127.0.0.1", "localhost") and port == 23:
        host = "127.0.0.1"
        port = 9923
        
    prefix = f"{host}:{port}:"
    keys_to_del = [k for k in sessions_cache if k.startswith(prefix)]
    if keys_to_del:
        for k in keys_to_del:
            try:
                sessions_cache[k].close()
            except Exception:
                pass
            del sessions_cache[k]
        return jsonify({"success": True, "message": "Sessions closed and removed from cache."})
    return jsonify({"success": True, "message": "No active session to close."})

# Brand helper functions
def execute_vlan_search(conn, brand, vlan_id):
    brand = brand.lower()
    
    # 1. Fetch VLAN details
    vlan_cmd = f"show vlan {vlan_id}"
    if brand == 'huawei_gpon':
        vlan_cmd = f"display vlan {vlan_id}"
    elif brand == 'phyhome_epon':
        vlan_cmd = "display vlan-database"
        
    vlan_raw = conn.execute_command(vlan_cmd)
    vlan_info = parse_generic_vlan_info(vlan_raw)
    vlan_info["vlan_id"] = str(vlan_id)
    
    # 2. Fetch MAC addresses
    if brand in ('vsol', 'vsol_gpon', 'atop'):
        raw_out = conn.execute_command(f"show mac address-table vlan {vlan_id}")
        macs = parse_vsol_mac_table(raw_out)
    elif brand in ('cdata', 'cdata_gpon'):
        raw_out = conn.execute_command(f"show mac-address vlan {vlan_id}")
        macs = parse_cdata_mac_table(raw_out)
    elif brand == 'huawei_gpon':
        raw_out = conn.execute_command(f"display mac-address vlan {vlan_id}")
        macs = parse_generic_mac_table(raw_out, default_vlan=vlan_id)
    elif brand == 'cdata_epon':
        raw_out = conn.execute_command("show olt 1 mac-address-table")
        macs = parse_generic_mac_table(raw_out, default_vlan=vlan_id)
    elif brand == 'fhnet_epon':
        raw_out = conn.execute_command("show onu-status")
        macs = parse_generic_mac_table(raw_out, default_vlan=vlan_id)
    elif brand == 'phyhome_epon':
        raw_out = conn.execute_command("display mac-table")
        macs = parse_generic_mac_table(raw_out, default_vlan=vlan_id)
    elif brand == 'utstarcom_epon':
        raw_out = conn.execute_command("show interface epon-olt 1/1 onu brief")
        macs = parse_generic_mac_table(raw_out, default_vlan=vlan_id)
    else:
        raw_out = conn.execute_command(f"show mac-address vlan {vlan_id}")
        macs = parse_generic_mac_table(raw_out, default_vlan=vlan_id)
    return raw_out, macs, vlan_info

def execute_mac_table_fetch(conn, brand):
    brand = brand.lower()
    if brand in ('vsol', 'vsol_gpon', 'atop'):
        raw_out = conn.execute_command("show mac address-table")
        macs = parse_vsol_mac_table(raw_out)
    elif brand in ('cdata', 'cdata_gpon'):
        raw_out = conn.execute_command("show mac-address")
        macs = parse_cdata_mac_table(raw_out)
    elif brand == 'huawei_gpon':
        raw_out = conn.execute_command("display mac-address")
        macs = parse_generic_mac_table(raw_out)
    elif brand == 'cdata_epon':
        raw_out = conn.execute_command("show olt 1 mac-address-table")
        macs = parse_generic_mac_table(raw_out)
    elif brand == 'fhnet_epon':
        raw_out = conn.execute_command("show onu-status")
        macs = parse_generic_mac_table(raw_out)
    elif brand == 'phyhome_epon':
        raw_out = conn.execute_command("display mac-table")
        macs = parse_generic_mac_table(raw_out)
    elif brand == 'utstarcom_epon':
        raw_out = conn.execute_command("show interface epon-olt 1/1 onu brief")
        macs = parse_generic_mac_table(raw_out)
    else:
        raw_out = conn.execute_command("show mac-address")
        macs = parse_generic_mac_table(raw_out)
    return raw_out, macs

def execute_ont_diagnostics(conn, brand, gpon_port, ont_id):
    brand = brand.lower()
    ont_status = "unknown"
    ont_sn = "N/A"
    ont_desc = "N/A"
    
    optical_info = {
        "rx_power": "N/A",
        "tx_power": "N/A",
        "olt_rx_power": "N/A",
        "temperature": "N/A",
        "voltage": "N/A",
        "bias_current": "N/A",
        "raw": ""
    }
    
    if brand in ('vsol', 'vsol_gpon', 'atop'):
        raw_status = conn.execute_command(f"show onu status port {gpon_port}")
        onus = parse_vsol_onu_status(raw_status)
        match_onu = next((o for o in onus if str(o["id"]) == str(ont_id)), None)
        if match_onu:
            ont_status = match_onu["status"]
            ont_sn = match_onu["sn"]
            ont_desc = match_onu["description"]
            
        if ont_status == "online":
            raw_opt = conn.execute_command(f"show onu {ont_id} optical-info")
            optical_info = parse_optical_info(raw_opt)
            optical_info["raw"] = raw_opt
            
    elif brand in ('cdata', 'cdata_gpon'):
        raw_status = conn.execute_command(f"show ont info {gpon_port} {ont_id}")
        onus = parse_cdata_ont_status(raw_status)
        match_onu = next((o for o in onus if str(o["id"]) == str(ont_id)), None)
        if match_onu:
            ont_status = match_onu.get("status", "unknown")
            ont_sn = match_onu.get("sn", "N/A")
            ont_desc = match_onu.get("description", "N/A")
            
        if ont_status == "online":
            raw_opt = conn.execute_command(f"show ont optical-info {gpon_port} {ont_id}")
            optical_info = parse_optical_info(raw_opt)
            optical_info["raw"] = raw_opt
            
    elif brand == 'huawei_gpon':
        conn.execute_command(f"interface gpon 0/{gpon_port}")
        raw_status = conn.execute_command(f"show ont info {gpon_port} {ont_id}")
        onus = parse_generic_onu_status(raw_status)
        match_onu = next((o for o in onus if str(o["id"]) == str(ont_id)), None)
        if match_onu:
            ont_status = match_onu.get("status", "unknown")
            ont_sn = match_onu.get("sn", "N/A")
            ont_desc = match_onu.get("description", "N/A")
            
        if ont_status == "online":
            raw_opt = conn.execute_command(f"show ont optical-info {gpon_port} {ont_id}")
            optical_info = parse_optical_info(raw_opt)
            optical_info["raw"] = raw_opt
            
    elif brand == 'cdata_epon':
        raw_status = conn.execute_command(f"show olt {gpon_port} onu {ont_id} ctc attribute")
        onus = parse_generic_onu_status(raw_status)
        match_onu = next((o for o in onus if str(o["id"]) == str(ont_id)), None)
        if match_onu:
            ont_status = match_onu.get("status", "unknown")
            ont_sn = match_onu.get("sn", "N/A")
            ont_desc = match_onu.get("description", "N/A")
            
        if ont_status == "online":
            raw_opt = conn.execute_command(f"show olt {gpon_port} onu {ont_id} ctc optical")
            optical_info = parse_optical_info(raw_opt)
            optical_info["raw"] = raw_opt
            
    elif brand == 'fhnet_epon':
        raw_status = conn.execute_command("show onu-status")
        onus = parse_generic_onu_status(raw_status)
        match_onu = next((o for o in onus if str(o["id"]) == str(ont_id)), None)
        if match_onu:
            ont_status = match_onu.get("status", "unknown")
            ont_sn = match_onu.get("sn", "N/A")
            ont_desc = match_onu.get("description", "N/A")
            
        if ont_status == "online":
            conn.execute_command(f"onu 0/{gpon_port}/{ont_id}")
            raw_opt = conn.execute_command("show onu-opm-diagnosis")
            optical_info = parse_optical_info(raw_opt)
            optical_info["raw"] = raw_opt
            conn.execute_command("exit")
            
    elif brand == 'phyhome_epon':
        raw_status = conn.execute_command(f"display service info 2 {gpon_port} {ont_id}")
        onus = parse_generic_onu_status(raw_status)
        match_onu = next((o for o in onus if str(o["id"]) == str(ont_id)), None)
        if match_onu:
            ont_status = match_onu.get("status", "unknown")
            ont_sn = match_onu.get("sn", "N/A")
            ont_desc = match_onu.get("description", "N/A")
            
        if ont_status == "online":
            optical_info = parse_optical_info(raw_status)
            optical_info["raw"] = raw_status
            
    elif brand == 'utstarcom_epon':
        raw_status = conn.execute_command(f"show interface epon-olt {gpon_port} onu {ont_id} brief")
        onus = parse_generic_onu_status(raw_status)
        match_onu = next((o for o in onus if str(o["id"]) == str(ont_id)), None)
        if match_onu:
            ont_status = match_onu.get("status", "unknown")
            ont_sn = match_onu.get("sn", "N/A")
            ont_desc = match_onu.get("description", "N/A")
            
        if ont_status == "online":
            raw_opt = conn.execute_command(f"show interface epon-olt {gpon_port} onu {ont_id} opm-diagnisos")
            optical_info = parse_optical_info(raw_opt)
            optical_info["raw"] = raw_opt
            
    return ont_status, ont_sn, ont_desc, optical_info

# POST /api/query/search
@olt_bp.route('/query/search', methods=['POST'])
def search_olt():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password', 'brand', 'query')):
        return jsonify({"error": "Missing connection parameters or query"}), 400
        
    host, port, username, password, enable_password, brand = get_conn_params(data)
    query = data.get("query", "").strip()
    
    # Helper to normalize MAC address
    def clean_mac(m):
        return "".join(c.lower() for c in m if c.isalnum())
        
    is_vlan_search = query.isdigit() and 1 <= int(query) <= 4094
    
    try:
        conn = get_cached_connection(host, port, username, password, enable_password, brand)
        conn.session_log = ""
        
        if is_vlan_search:
            # VLAN Search
            vlan_id = int(query)
            raw_out, macs, vlan_info = execute_vlan_search(conn, brand, vlan_id)
            
            log = conn.session_log
            return jsonify({
                "success": True,
                "type": "vlan",
                "vlan": vlan_id,
                "vlan_info": vlan_info,
                "macs": macs,
                "raw": raw_out,
                "console_log": log
            })
            
        else:
            # MAC Address Search
            target_mac_clean = clean_mac(query)
            if len(target_mac_clean) != 12:
                log = conn.session_log
                return jsonify({"success": False, "message": "Invalid MAC address format. Must be a 12-digit hex string.", "console_log": log})
                
            # Fetch entire MAC table to search
            raw_out, macs = execute_mac_table_fetch(conn, brand)
                
            # Search for matching MAC entry
            matching_entry = None
            for entry in macs:
                if clean_mac(entry["mac"]) == target_mac_clean:
                    matching_entry = entry
                    break
                    
            if not matching_entry:
                log = conn.session_log
                return jsonify({
                    "success": True,
                    "found": False,
                    "type": "mac",
                    "mac": query,
                    "message": "MAC address not found in OLT MAC table.",
                    "raw": raw_out,
                    "console_log": log
                })
                
            # Matching entry found! Now fetch details for this port/ont_id
            gpon_port = matching_entry["port"]
            ont_id = matching_entry["ont_id"]
            vlan_id = matching_entry["vlan"]
            
            ont_status = "unknown"
            ont_sn = "N/A"
            ont_desc = "N/A"
            optical_info = {
                "rx_power": "N/A",
                "tx_power": "N/A",
                "olt_rx_power": "N/A",
                "temperature": "N/A",
                "voltage": "N/A",
                "bias_current": "N/A",
                "raw": ""
            }
            
            # If the entry was learned on a GPON/EPON interface (and has an ONT/ONU ID)
            if gpon_port and ont_id and ont_id != "-":
                ont_status, ont_sn, ont_desc, optical_info = execute_ont_diagnostics(conn, brand, gpon_port, ont_id)
            
            log = conn.session_log
            return jsonify({
                "success": True,
                "found": True,
                "type": "mac",
                "mac": matching_entry["mac"],
                "port": gpon_port,
                "ont_id": ont_id,
                "vlan": vlan_id,
                "mac_type": matching_entry.get("type", "dynamic"),
                "ont_status": ont_status,
                "ont_sn": ont_sn,
                "ont_desc": ont_desc,
                "optical": optical_info,
                "raw_mac_table": raw_out,
                "console_log": log
            })
            
    except Exception as e:
        log = conn.session_log if 'conn' in locals() else ""
        return jsonify({"error": str(e), "console_log": log}), 500

# ONT config and reboot helper functions
def execute_ont_config_fetch(conn, brand, gpon_port, ont_id):
    brand = brand.lower()
    if brand in ('vsol', 'vsol_gpon', 'atop'):
        return conn.execute_command(f"show running-config interface gpon 0/{gpon_port}:{ont_id}")
    elif brand in ('cdata', 'cdata_gpon'):
        return conn.execute_command(f"show ont info {gpon_port} {ont_id}")
    elif brand == 'huawei_gpon':
        return conn.execute_command(f"display current-configuration ont 0/{gpon_port}/{ont_id}")
    elif brand == 'cdata_epon':
        return conn.execute_command(f"show olt {gpon_port} onu {ont_id} ctc attribute")
    elif brand == 'fhnet_epon':
        return conn.execute_command(f"show running-config onumnt 0/{gpon_port}/{ont_id}")
    elif brand == 'phyhome_epon':
        return conn.execute_command(f"display service info 2 {gpon_port} {ont_id}")
    elif brand == 'utstarcom_epon':
        return conn.execute_command(f"show interface epon-olt {gpon_port} onu {ont_id} mac-address-table")
    else:
        return conn.execute_command(f"show ont info {gpon_port} {ont_id}")

def execute_ont_reboot(conn, brand, gpon_port, ont_id):
    brand = brand.lower()
    if brand in ('vsol', 'vsol_gpon', 'atop'):
        conn.execute_command(f"interface gpon {gpon_port}")
        return conn.execute_command(f"onu {ont_id} reboot")
    elif brand in ('cdata', 'cdata_gpon'):
        conn.execute_command(f"interface gpon {gpon_port}")
        return conn.execute_command(f"ont reset {gpon_port} {ont_id}")
    elif brand == 'huawei_gpon':
        conn.execute_command(f"interface gpon 0/{gpon_port}")
        return conn.execute_command(f"ont reboot {gpon_port} {ont_id}")
    elif brand == 'cdata_epon':
        conn.execute_command(f"olt {gpon_port}")
        conn.execute_command(f"onu {ont_id}")
        return conn.execute_command("ctc reboot")
    elif brand == 'fhnet_epon':
        conn.execute_command(f"onu 0/{gpon_port}/{ont_id}")
        return conn.execute_command("ctc reboot")
    elif brand == 'phyhome_epon':
        conn.execute_command("system")
        conn.execute_command("configure")
        return conn.execute_command(f"reset 2 {gpon_port} {ont_id}")
    elif brand == 'utstarcom_epon':
        conn.execute_command(f"interface epon-olt {gpon_port}")
        conn.execute_command(f"onu {ont_id}")
        return conn.execute_command("reset")
    else:
        return "Unsupported OLT reboot brand"

# POST /api/query/config
@olt_bp.route('/query/config', methods=['POST'])
def get_config():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password', 'brand', 'ont_id')):
        return jsonify({"error": "Missing connection parameters or ONT identifiers"}), 400
        
    host, port_telnet, username, password, enable_password, brand = get_conn_params(data)
    gpon_port = data.get("gpon_port") or data.get("port")
    ont_id = data.get("ont_id")
    
    try:
        conn = get_cached_connection(host, port_telnet, username, password, enable_password, brand)
        conn.session_log = ""
        raw_out = execute_ont_config_fetch(conn, brand, gpon_port, ont_id)
            
        log = conn.session_log
        return jsonify({"success": True, "config": raw_out, "console_log": log})
    except Exception as e:
        log = conn.session_log if 'conn' in locals() else ""
        return jsonify({"error": str(e), "console_log": log}), 500

# POST /api/action/reboot
# POST /api/action/reboot
@olt_bp.route('/action/reboot', methods=['POST'])
def reboot_ont():
    return jsonify({"error": "Reboot actions are currently disabled as per security configuration."}), 403

def format_mac_for_brand(mac, brand):
    clean = "".join(c for c in mac if c.isalnum())
    if len(clean) != 12:
        return mac
    parts = [clean[i:i+2] for i in range(0, 12, 2)]
    return ":".join(parts).upper()

# POST /api/action/static-mac
@olt_bp.route('/action/static-mac', methods=['POST'])
def add_static_mac():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password', 'brand', 'port_name', 'vlan', 'mac')):
        return jsonify({"error": "Missing connection parameters, port_name, vlan, or mac"}), 400
        
    host, port_telnet, username, password, enable_password, brand = get_conn_params(data)
    port_name = data.get("port_name").strip()
    vlan = data.get("vlan")
    raw_mac = data.get("mac").strip()
    mac = format_mac_for_brand(raw_mac, brand)
    
    try:
        conn = get_cached_connection(host, port_telnet, username, password, enable_password, brand)
        conn.session_log = ""
        
        brand_lower = brand.lower()
        if 'vsol' in brand_lower or 'atop' in brand_lower:
            clean_mac = "".join(c for c in raw_mac if c.isalnum()).lower()
            mac = f"{clean_mac[0:4]}:{clean_mac[4:8]}:{clean_mac[8:12]}"
            
            p_name_lower = port_name.lower().strip()
            num_part = re.sub(r'^[a-zA-Z]+', '', p_name_lower).strip()
            
            if p_name_lower.startswith('xge'):
                int_name = f"xgigabitethernet {num_part}"
            elif p_name_lower.startswith('ge'):
                int_name = f"gigabitethernet {num_part}"
            else:
                int_name = re.sub(r'([a-zA-Z]+)(\d+)', r'\1 \2', port_name)
                
            cmd = f"mac address-table static vlan {vlan} {mac} interface {int_name}"
        elif 'huawei' in brand_lower:
            formatted_port = re.sub(r'([a-zA-Z]+)(\d+)', r'\1 \2', port_name)
            cmd = f"mac-address static vlan {vlan} {mac} port {formatted_port}"
        else:
            formatted_port = re.sub(r'([a-zA-Z]+)(\d+)', r'\1 \2', port_name)
            cmd = f"mac-address static port {formatted_port} vlan {vlan} {mac}"
            
        output = conn.execute_command(cmd)
        log = conn.session_log
        return jsonify({"success": True, "output": output, "console_log": log, "formatted_mac": mac})
    except Exception as e:
        log = conn.session_log if 'conn' in locals() else ""
        return jsonify({"error": str(e), "console_log": log}), 500

# POST /api/action/delete-static
@olt_bp.route('/action/delete-static', methods=['POST'])
def delete_static_mac():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password', 'brand', 'port_name', 'vlan', 'mac')):
        return jsonify({"error": "Missing parameters"}), 400
        
    host, port_telnet, username, password, enable_password, brand = get_conn_params(data)
    port_name = data.get("port_name").strip()
    vlan = data.get("vlan")
    raw_mac = data.get("mac").strip()
    mac = format_mac_for_brand(raw_mac, brand)
    
    try:
        conn = get_cached_connection(host, port_telnet, username, password, enable_password, brand)
        conn.session_log = ""
        
        brand_lower = brand.lower()
        if 'vsol' in brand_lower or 'atop' in brand_lower:
            clean_mac = "".join(c for c in raw_mac if c.isalnum()).lower()
            mac = f"{clean_mac[0:4]}:{clean_mac[4:8]}:{clean_mac[8:12]}"
            
            p_name_lower = port_name.lower().strip()
            num_part = re.sub(r'^[a-zA-Z]+', '', p_name_lower).strip()
            
            if p_name_lower.startswith('xge'):
                int_name = f"xgigabitethernet {num_part}"
            elif p_name_lower.startswith('ge'):
                int_name = f"gigabitethernet {num_part}"
            else:
                int_name = re.sub(r'([a-zA-Z]+)(\d+)', r'\1 \2', port_name)
                
            candidates = [
                f"no mac address-table static vlan {vlan} {mac}",
                f"no mac address-table vlan {vlan} {mac}",
                f"no mac address-table static vlan {vlan} {mac} interface {int_name}",
                f"no mac address-table vlan {vlan} {mac} interface {int_name}"
            ]
            
            cmd = candidates[0]
            output = ""
            for candidate in candidates:
                cmd = candidate
                output = conn.execute_command(cmd)
                out_lower = output.lower()
                if not any(x in out_lower for x in ("invalid", "unrecognized", "parameter", "%", "error")):
                    break
        elif 'huawei' in brand_lower:
            formatted_port = re.sub(r'([a-zA-Z]+)(\d+)', r'\1 \2', port_name)
            cmd = f"undo mac-address static vlan {vlan} {mac} port {formatted_port}"
            output = conn.execute_command(cmd)
        else:
            formatted_port = re.sub(r'([a-zA-Z]+)(\d+)', r'\1 \2', port_name)
            cmd = f"no mac-address static port {formatted_port} vlan {vlan} {mac}"
            output = conn.execute_command(cmd)
        log = conn.session_log
        return jsonify({"success": True, "output": output, "console_log": log, "formatted_mac": mac})
    except Exception as e:
        log = conn.session_log if 'conn' in locals() else ""
        return jsonify({"error": str(e), "console_log": log}), 500

# POST /api/action/open-putty
@olt_bp.route('/action/open-putty', methods=['POST'])
def open_putty():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password')):
        return jsonify({"error": "Missing parameters"}), 400
        
    host = str(data.get("host", "")).strip()
    port_val = data.get("port")
    if not port_val or str(port_val).strip() == "":
        port = 23
    else:
        try:
            port = int(port_val)
        except Exception:
            port = 23
            
    username = data.get("username")
    password = data.get("password")
    enable_password = data.get("enable_password")
    
    # Escape special characters for VBScript SendKeys
    def escape_sendkeys(text):
        if not text:
            return ""
        escaped = []
        for char in text:
            if char in ('+', '^', '%', '~', '(', ')', '[', ']', '{', '}'):
                escaped.append(f"{{{char}}}")
            else:
                escaped.append(char)
        return "".join(escaped)
        
    esc_username = escape_sendkeys(username)
    esc_password = escape_sendkeys(password)
    esc_enable = escape_sendkeys(enable_password)
    
    import os
    import tempfile
    import subprocess
    
    putty_path = "putty.exe"
    for path in (
        r"C:\Program Files\PuTTY\putty.exe",
        r"C:\Program Files (x86)\PuTTY\putty.exe"
    ):
        if os.path.exists(path):
            putty_path = path
            break
            
    vbs_content = f'''Set WshShell = WScript.CreateObject("WScript.Shell")
WshShell.Run Chr(34) & "{putty_path}" & Chr(34) & " -telnet {host} {port}"
WScript.Sleep 1500
WshShell.SendKeys "{esc_username}~"
WScript.Sleep 800
WshShell.SendKeys "{esc_password}~"
WScript.Sleep 800
'''
    if enable_password:
        vbs_content += f'''WshShell.SendKeys "enable~"
WScript.Sleep 800
WshShell.SendKeys "{esc_enable}~"
WScript.Sleep 800
'''

    try:
        print(f"Launching PuTTY: {putty_path} -telnet {host} {port}")
        temp_dir = tempfile.gettempdir()
        vbs_path = os.path.join(temp_dir, "putty_login.vbs")
        with open(vbs_path, "w", encoding="utf-8") as f:
            f.write(vbs_content)
            
        print(f"Executing macro script at: {vbs_path}")
        subprocess.Popen(["wscript.exe", vbs_path], shell=True)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# POST /api/action/command
@olt_bp.route('/action/command', methods=['POST'])
def run_command_olt():
    data = request.json
    if not all(k in data for k in ('host', 'username', 'password', 'brand', 'command')):
        return jsonify({"error": "Missing connection parameters or command"}), 400
        
    host, port_telnet, username, password, enable_password, brand = get_conn_params(data)
    command = data.get("command", "").strip()
    cmd_lower = command.lower()
    # CLI Console acts as a standard unfiltered telnet interface (e.g. PuTTY)
        
    try:
        conn = get_cached_connection(host, port_telnet, username, password, enable_password, brand)
        conn.session_log = ""
        output = conn.execute_command(command)
        log = conn.session_log
        return jsonify({"success": True, "output": output, "console_log": log})
    except Exception as e:
        log = conn.session_log if 'conn' in locals() else ""
        return jsonify({"error": str(e), "console_log": log}), 500


if __name__ == '__main__':
    os.makedirs(os.path.join(os.path.dirname(__file__), '../frontend'), exist_ok=True)
    
    import webbrowser
    from threading import Timer
    
    def open_browser():
        webbrowser.open("http://127.0.0.1:5000")
        
    is_reloader = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    is_compiled = hasattr(sys, '_MEIPASS')
    
    if is_compiled or not is_reloader:
        Timer(1.2, open_browser).start()
        
    debug_mode = not is_compiled
