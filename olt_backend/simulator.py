import socket
import threading
import time

PORT = 9923
HOST = '0.0.0.0'

def clean_iacs(data):
    cleaned = bytearray()
    i = 0
    n = len(data)
    while i < n:
        if data[i] == 255: # IAC
            if i + 1 < n:
                cmd = data[i+1]
                if cmd in (251, 252, 253, 254):
                    i += 3
                else:
                    i += 2
            else:
                i += 1
        else:
            cleaned.append(data[i])
            i += 1
    return bytes(cleaned)

def log_message(msg):
    try:
        with open("C:\\Users\\minhaj.uddin\\.gemini\\antigravity\\scratch\\OLT-T-Shoot\\backend\\sim_log.txt", "a") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
            f.flush()
    except Exception:
        pass

def handle_client(client_socket, addr):
    log_message(f"New connection from {addr}")
    try:
        # Send some standard Telnet negotiations (IAC WILL ECHO, IAC DO SGA)
        # IAC WILL ECHO = \xff\xfb\x01
        # IAC DO SGA = \xff\xfd\x03
        client_socket.sendall(b'\xff\xfb\x01\xff\xfd\x03')
        time.sleep(0.1)
        
        # 1. Username prompt
        client_socket.sendall(b"Username: ")
        username = b""
        while b"\n" not in username:
            char = client_socket.recv(1)
            if not char:
                return
            if char == b'\xff': # IAC
                client_socket.recv(2) # discard options
                continue
            # Handle backspaces or IAC if any
            if char == b'\x7f' or char == b'\x08':
                username = username[:-1]
            elif char[0] < 240: # Ignore IACs
                username += char
        
        # 2. Password prompt
        client_socket.sendall(b"Password: ")
        password = b""
        while b"\n" not in password:
            char = client_socket.recv(1)
            if not char:
                return
            if char == b'\xff': # IAC
                client_socket.recv(2) # discard options
                continue
            if char == b'\x7f' or char == b'\x08':
                password = password[:-1]
            elif char[0] < 240:
                password += char
                
        # 3. Welcome and basic prompt
        client_socket.sendall(b"\r\nWelcome to GPON OLT Simulator\r\nOLT> ")
        
        mode = "user" # user, enable, config, gpon_interface
        gpon_port = None
        
        buffer = bytearray()
        while True:
            char_raw = client_socket.recv(1024)
            if not char_raw:
                break
            char = clean_iacs(char_raw)
            if not char:
                continue
            
            # Simple buffer check
            buffer.extend(char)
            if b"\r" in buffer or b"\n" in buffer:
                # Find command
                raw_cmd = buffer.decode('utf-8', errors='ignore').strip()
                buffer.clear()
                
                if not raw_cmd:
                    prompt = "\r\nOLT> " if mode == "user" else "\r\nOLT# " if mode == "enable" else "\r\nOLT(config)# " if mode == "config" else f"\r\nOLT(config-if-gpon-0/{gpon_port})# "
                    client_socket.sendall(prompt.encode('utf-8'))
                    continue
                
                log_message(f"Command received from {addr}: '{raw_cmd}'")
                
                response = ""
                # Simple OLT router logic
                cmd = raw_cmd.lower()
                
                if cmd == "exit":
                    if mode == "gpon_interface":
                        mode = "config"
                        response = "\r\nExit GPON interface mode."
                    elif mode == "config":
                        mode = "enable"
                        response = "\r\nExit configuration mode."
                    elif mode == "enable":
                        mode = "user"
                        response = "\r\nLogged out from privilege mode."
                    else:
                        client_socket.sendall(b"\r\nGoodbye!\r\n")
                        break
                elif cmd == "enable":
                    if mode == "user":
                        client_socket.sendall(b"\r\nPassword: ")
                        # wait for enable password
                        en_pass = b""
                        while b"\n" not in en_pass:
                            c = client_socket.recv(1)
                            if not c: return
                            if c[0] < 240: en_pass += c
                        mode = "enable"
                        response = "\r\nOLT privilege mode enabled."
                    else:
                        response = "\r\nAlready in enable mode."
                elif cmd in ("config", "configure terminal", "conf t"):
                    if mode == "enable":
                        mode = "config"
                        response = "\r\nConfigure terminal mode. Input 'exit' to return."
                    else:
                        response = "\r\nError: Please enter enable mode first."
                elif cmd.startswith("interface gpon"):
                    if mode == "config":
                        parts = cmd.split()
                        if len(parts) >= 3:
                            gpon_port = parts[2].replace("0/", "") # e.g. 0/1 -> 1
                            mode = "gpon_interface"
                            response = f"\r\nEntered GPON GPON 0/{gpon_port} interface."
                        else:
                            response = "\r\nError: Missing port parameter."
                    else:
                        response = "\r\nError: Please enter config mode first."
                elif cmd == "terminal length 0":
                    response = "\r\nTerminal length set to 0. Paging disabled."
                # ----------------
                # VSOL commands
                # ----------------
                elif cmd.startswith("show onu status port"):
                    parts = cmd.split()
                    port_id = parts[-1]
                    response = f"""
OnuID  State       Mac             Mode       LastDyingGaspTime
-------------------------------------------------------------
1      online      VSOL00000001    gpon       N/A
2      online      VSOL00000002    gpon       N/A
3      offline     VSOL00000003    gpon       2026-07-06 09:21:40
4      online      VSOL00000004    gpon       N/A
10     online      VSOL00000010    gpon       N/A
"""
                elif cmd.startswith("show onu") and "optical-info" in cmd:
                    # VSOL: show onu <id> optical-info
                    parts = cmd.split()
                    onu_id = parts[2]
                    response = f"""
ONU ID                      : {onu_id}
Rx optical power(dBm)       : -19.45
Tx optical power(dBm)       : 2.15
OLT Rx optical power(dBm)   : -20.10
Working temperature(C)      : 42.5
Working voltage(V)          : 3.3
Bias current(mA)            : 12
"""
                elif cmd.startswith("onu") and cmd.endswith("reboot"):
                    # VSOL: onu <onu_id> reboot
                    parts = cmd.split()
                    onu_id = parts[1]
                    response = f"\r\nONU {onu_id} reboot command initiated successfully."
                # ----------------
                # CDATA commands
                # ----------------
                elif cmd.startswith("show ont info") and cmd.endswith("all"):
                    parts = cmd.split()
                    port_id = parts[3]
                    response = f"""
Index   ONT-ID  Control-Flag  Run-State  Config-State  Match-State  SN
--------------------------------------------------------------------------
1       1       Active        Online     Normal        Match        CDAT00000001
2       2       Active        Offline    Normal        Match        CDAT00000002
3       3       Active        Online     Normal        Match        CDAT00000003
"""
                elif cmd.startswith("show ont optical-info"):
                    # CDATA: show ont optical-info <port> <ont-id>
                    parts = cmd.split()
                    if len(parts) >= 5:
                        port_id = parts[3]
                        ont_id = parts[4]
                        response = f"""
ONT Rx Power    : -17.80 dBm
ONT Tx Power    : 1.50 dBm
OLT Rx Power    : -18.90 dBm
Temperature     : 44 C
Voltage         : 3.31 V
Bias Current    : 11 mA
"""
                    else:
                        response = "\r\nError: Missing parameters."
                elif cmd.startswith("ont reset"):
                    parts = cmd.split()
                    if len(parts) >= 4:
                        port_id = parts[2]
                        ont_id = parts[3]
                        response = f"\r\nONT reset command executed on GPON {port_id}:{ont_id} successfully."
                    else:
                        response = "\r\nError: Missing parameters."
                elif cmd == "show onu auto-find":
                    response = """
GPON port  ONU Mac/SN  RSSI  Distance
-------------------------------------------
1          VSOL000000A1 -21.40 1250m
2          VSOL000000A2 -23.50 1420m
"""
                elif cmd.startswith("show ont autofind"):
                    response = """
Index   ONT-SN          RSSI    Distance
-------------------------------------------
1       CDAT000000B2    -22.10  1340m
2       CDAT000000B3    -24.80  1620m
"""
                elif cmd.startswith("show mac address-table"):
                    # VSOL MAC Address Table
                    parts = cmd.split()
                    vlan_filter = None
                    if "vlan" in parts:
                        vlan_idx = parts.index("vlan")
                        if vlan_idx + 1 < len(parts):
                            vlan_filter = parts[vlan_idx + 1]
                    
                    if vlan_filter:
                        response = f"""
VlanId     MacAddress       Type      Port
--------------------------------------------------
{vlan_filter}        00e0-fc12-3456   dynamic   gpon0/1:10
{vlan_filter}        00e0-fc99-8877   dynamic   gpon0/1:2
"""
                    else:
                        response = """
VlanId     MacAddress       Type      Port
--------------------------------------------------
100        00e0-fc12-3456   dynamic   gpon0/1:10
100        00e0-fc99-8877   dynamic   gpon0/1:2
200        00e0-fc22-3344   dynamic   gpon0/2:1
300        00e0-fc55-6677   dynamic   ge0/1
"""
                # ----------------
                # HUAWEI / General Display Commands
                # ----------------
                elif cmd.startswith("display mac-address"):
                    parts = cmd.split()
                    vlan_filter = None
                    if "vlan" in parts:
                        vlan_filter = parts[parts.index("vlan") + 1]
                    
                    if not vlan_filter:
                        vlan_filter = "100"
                    response = f"""
Vlan-ID  MAC-Address       Type      Port      ONT-ID
-----------------------------------------------------
{vlan_filter}      00:e0:fc:12:34:56  dynamic   0/1       10
{vlan_filter}      00:e0:fc:99:88:77  dynamic   0/1       2
"""
                elif cmd.startswith("display current-configuration ont"):
                    parts = cmd.split()
                    port_ont = parts[-1].split('/')
                    port_id = port_ont[1] if len(port_ont) > 1 else "1"
                    ont_id = port_ont[2] if len(port_ont) > 2 else "1"
                    response = f"""
ont-lineprofile gpon profile-id 10
  tcont 1 dba-profile-id 10
  gem add 1 tcont 1
  gem mapping 1 1 vlan 100
ont-srvprofile gpon profile-id 20
  port eth 1
interface gpon 0/{port_id}
  ont add {port_id} {ont_id} sn-auth CDAT0000000{ont_id} desc Customer_ONT_{ont_id}
"""
                elif cmd.startswith("display service info 2"):
                    # PHYHOME EPON status/opt check
                    parts = cmd.split()
                    port_id = parts[4] if len(parts) > 4 else "1"
                    ont_id = parts[5] if len(parts) > 5 else "10"
                    response = f"""
Onu-ID                : {ont_id}
State                 : online
Mac-Address           : 00e0-fc12-3456
Work Temperature      : 43 C
Supply Voltage(Vcc)   : 3.26 V
TX Bias Current       : 12 mA
TX Power(Output)      : 1.5 mW (1.8 dBm)
RX Power(Input)       : 0.01 mW (-20.1 dBm)
"""
                elif cmd.startswith("show vlan") or cmd.startswith("display vlan") or cmd.startswith("display vlan-database"):
                    parts = cmd.split()
                    vlan_num = parts[-1] if len(parts) > 1 else "100"
                    
                    if vlan_num in ("all", "database") or "vlan-database" in cmd:
                        if "display vlan" in cmd or "vlan-database" in cmd:
                            if "database" in cmd or "vlan-database" in cmd:
                                response = """Vlan-ID    Name             Type        Ports
----------------------------------------------------------------
100        VLAN_100         static      ge0/5(T)
143        VLAN_143         static      ge0/6(T)
200        VLAN_200         static      ge0/7(T)
"""
                            else:
                                response = """-------------------------------------------------------------------------
VLAN ID  VLAN Type  Broadcast  Router-MAC          Tagged-Ports/Untagged-Ports
-------------------------------------------------------------------------
100      common     enable     1c:ef:03:1f:8b:2f   tagged: ge0/5, gpon0/8
143      common     enable     1c:ef:03:1f:8b:30   tagged: ge0/6
200      common     enable     1c:ef:03:1f:8b:31   tagged: ge0/7
-------------------------------------------------------------------------
"""
                        else:
                            response = """
Vlan ID      : 100
Name         : VLAN_100
Mac Address  : 1c:ef:03:1f:8b:2f
Tagged Ports : ge0/5
               gpon0/8
Untagged Ports :

Vlan ID      : 143
Name         : VLAN_143
Mac Address  : 1c:ef:03:1f:8b:30
Tagged Ports : ge0/6
Untagged Ports :

Vlan ID      : 200
Name         : VLAN_200
Mac Address  : 1c:ef:03:1f:8b:31
Tagged Ports : ge0/7
Untagged Ports :
"""
                    else:
                        if vlan_num.isdigit():
                            vlan_id_val = vlan_num
                        else:
                            vlan_id_val = "100"
                        response = f"""
Vlan ID      : {vlan_id_val}
Name         : ONU_Sec
Mac Address  : 1c:ef:03:1f:8b:2f
Tagged Ports : ge0/5
               gpon0/8
Untagged Ports :
"""
                elif cmd.startswith("display mac-table"):
                    # PHYHOME EPON MAC table
                    response = """
Mac-Address         Vlan-ID   Onu-ID   Type
-----------------------------------------------
00e0-fc12-3456      100       10       dynamic
00e0-fc99-8877      100       2        dynamic
"""
                elif cmd.startswith("show olt ") and "mac-address-table" in cmd:
                    # CDATA EPON MAC table
                    response = """
Onu-ID   Mac-Address         Type      Port
-----------------------------------------------
10       00e0-fc12-3456      dynamic   uni 1
2        00e0-fc99-8877      dynamic   uni 1
"""
                elif cmd.startswith("show olt ") and "ctc attribute" in cmd:
                    # CDATA EPON status info
                    parts = cmd.split()
                    port_id = parts[2]
                    ont_id = parts[4]
                    response = f"""
Onu-ID                : {ont_id}
State                 : online
Mac-Address           : 00e0-fc12-3456
Description           : Customer_ONU_{ont_id}
"""
                elif cmd.startswith("show olt ") and "ctc optical" in cmd:
                    # CDATA EPON optical info
                    parts = cmd.split()
                    port_id = parts[2]
                    ont_id = parts[4]
                    response = f"""
ONT Rx Power    : -18.25 dBm
ONT Tx Power    : 1.50 dBm
OLT Rx Power    : -19.10 dBm
Temperature     : 45 C
Voltage         : 3.3 V
Bias Current    : 12 mA
"""
                elif cmd == "show onu-status":
                    # FH-Net EPON status
                    response = """
ONU     Mac Address       DIS(m) RegisterTime      Type  Software        State
0/1/10  00:e0:fc:12:34:56 2961   21/12/24 16:08:44 other V1.2.8          Up
0/1/2   00:e0:fc:99:88:77 2755   21/12/16 15:29:55 other 2.1.0           Up
"""
                elif cmd.startswith("show onu-opm-diagnosis"):
                    # FH-Net EPON optical (inside onu mode)
                    response = """
Work Temperature    :  43 C
Supply Voltage(Vcc) : 3.26 V
TX Bias Current     :  12 mA
TX Power(Output)    : 1.5260 mW (1.8355 dBm)
RX Power(Input)     : 0.0096 mW (-20.1773 dBm)
"""
                elif cmd.startswith("show interface epon-olt") and "brief" in cmd:
                    # UTStarcom EPON brief list
                    parts = cmd.split()
                    onu_id = None
                    if "onu" in parts:
                        onu_idx = parts.index("onu")
                        if onu_idx + 1 < len(parts) and parts[onu_idx + 1].isdigit():
                            onu_id = parts[onu_idx + 1]
                    
                    if onu_id:
                        response = f"""
Onu-ID   Mac-Address         Type      Port          State
-----------------------------------------------------------
{onu_id}       00e0-fc12-3456      dynamic   epon-olt 1/1  up
"""
                    else:
                        response = """
Onu-ID   Mac-Address         Type      Port          State
-----------------------------------------------------------
10       00e0-fc12-3456      dynamic   epon-olt 1/1  up
2        00e0-fc99-8877      dynamic   epon-olt 1/1  up
"""
                elif cmd.startswith("show interface epon-olt") and "opm-diagnisos" in cmd:
                    # UTStarcom EPON optical
                    response = """
ONT Rx Power    : -18.25 dBm
ONT Tx Power    : 1.50 dBm
OLT Rx Power    : -19.10 dBm
Temperature     : 45 C
Voltage         : 3.3 V
Bias Current    : 12 mA
"""
                elif cmd.startswith("show interface epon-olt") and "mac-address-table" in cmd:
                    # UTStarcom EPON MAC table
                    response = """
Mac-Address         Vlan-ID   Onu-ID   Type
-----------------------------------------------
00e0-fc12-3456      100       10       dynamic
"""
                elif cmd == "ctc reboot" or cmd == "reset":
                    response = "\r\nONU reboot/reset initiated successfully."
                elif cmd.startswith("reset 2 "):
                    # PHYHOME reset
                    parts = cmd.split()
                    port_id = parts[2]
                    ont_id = parts[3]
                    response = f"\r\nONU 2/{port_id}/{ont_id} reset initiated successfully."
                elif cmd.startswith("mac-address static"):
                    response = "\r\nStatic MAC address entry added successfully."
                elif cmd.startswith("show mac-address-table") or cmd.startswith("show mac-address"):
                    # CDATA MAC Address Table
                    parts = cmd.split()
                    vlan_filter = None
                    if "vlan" in parts:
                        vlan_idx = parts.index("vlan")
                        if vlan_idx + 1 < len(parts):
                            vlan_filter = parts[vlan_idx + 1]
                    
                    if vlan_filter:
                        response = f"""
Vlan-ID    MAC-Address         Type        Port        ONT-ID
-------------------------------------------------------------
{vlan_filter}        00:e0:fc:12:34:56   dynamic     gpon 0/1    10
{vlan_filter}        00:e0:fc:99:88:77   dynamic     gpon 0/1    2
"""
                    else:
                        response = """
Vlan-ID    MAC-Address         Type        Port        ONT-ID
-------------------------------------------------------------
100        00:e0:fc:12:34:56   dynamic     gpon 0/1    10
100        00:e0:fc:99:88:77   dynamic     gpon 0/1    2
200        00:e0:fc:22:33:44   dynamic     gpon 0/2    1
300        00:e0:fc:55:66:77   dynamic     ge 0/1      -
"""
                elif cmd.startswith("show running-config interface gpon 0/"):
                    # VSOL running config for specific ONU
                    # E.g. show running-config interface gpon 0/1:1
                    parts = cmd.split(":")
                    onu_id = parts[1] if len(parts) > 1 else "1"
                    gpon_port = parts[0].split("/")[-1] if "/" in parts[0] else "1"
                    response = f"""
interface gpon 0/{gpon_port}
  onu {onu_id} sn VSOL0000000{onu_id} profile default-profile desc Customer_ONU_{onu_id}
  onu {onu_id} lineprofile 10 srvprofile 20
  onu {onu_id} vlan port 1 mode tag 100
  onu {onu_id} optical-receiver-control disable
"""
                elif cmd.startswith("show interface brief") or cmd.startswith("show interface status") or cmd.startswith("show port state all"):
                    response = """
Interface            Status   Speed      Duplex
ge1                  up       1000M      full
ge2                  down     auto       auto
ge3                  down     auto       auto
ge4                  down     auto       auto
xge1                 up       10G        full
xge2                 down     auto       auto
"""
                elif cmd.startswith("display interface brief") or cmd.startswith("display interface"):
                    response = """
Interface                   PHY   Protocol  InUti OutUti
GE0/19/0                    up    up           0%     0%
GE0/19/1                    down  down         0%     0%
10GE0/20/0                  up    up           0%     0%
10GE0/20/1                  down  down         0%     0%
"""
                elif cmd.startswith("show ont info") and not cmd.endswith("all"):
                    # CDATA show ont info <port> <ont-id>
                    # E.g. show ont info 1 1
                    parts = cmd.split()
                    port_id = parts[3] if len(parts) > 3 else "1"
                    ont_id = parts[4] if len(parts) > 4 else "1"
                    response = f"""
ONT-ID                : {ont_id}
Control Flag          : Active
Run State             : Online
Config State          : Success
Match State           : Match
Lineprofile ID        : 10
Srvprofile ID         : 20
Serial Number         : CDAT0000000{ont_id}
Description           : Customer_ONT_{ont_id}
GPON Port             : 0/0/{port_id}
"""
                elif cmd.startswith("onu ") and " sn " in cmd:
                    # VSOL ONU registration
                    # E.g. onu 1 sn VSOL000000A1 profile default-profile desc ...
                    parts = cmd.split()
                    onu_id = parts[1]
                    sn = parts[3]
                    response = f"\r\nONU {onu_id} registered with SN {sn} successfully."
                elif cmd.startswith("ont add") or cmd.startswith("ont confirm"):
                    # CDATA ONT registration
                    # E.g. ont add 1 1 sn-auth CDAT000000B2 ...
                    parts = cmd.split()
                    port_id = parts[2]
                    ont_id = parts[3]
                    sn = parts[5]
                    response = f"\r\nONT {port_id}/{ont_id} added with SN {sn} successfully."
                elif cmd.startswith("ont autofind ") and cmd.endswith("enable"):
                    parts = cmd.split()
                    port_id = parts[2]
                    response = f"\r\nAutofind enabled on port {port_id} successfully."
                else:
                    # Echo raw command execution
                    response = f"\r\nExecuted custom OLT command: {raw_cmd}"
                
                # Format prompt based on mode
                prompt = "\r\nOLT> " if mode == "user" else "\r\nOLT# " if mode == "enable" else "\r\nOLT(config)# " if mode == "config" else f"\r\nOLT(config-if-gpon-0/{gpon_port})# "
                
                client_socket.sendall(response.encode('utf-8') + prompt.encode('utf-8'))
                
    except Exception as e:
        log_message(f"Client disconnected {addr}: {e}")
    finally:
        client_socket.close()

def main():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind((HOST, PORT))
        server.listen(5)
        log_message(f"OLT Telnet Simulator running on {HOST}:{PORT}...")
        while True:
            client_sock, addr = server.accept()
            t = threading.Thread(target=handle_client, args=(client_sock, addr))
            t.daemon = True
            t.start()
    except Exception as e:
        log_message(f"Server failed: {e}")
    finally:
        server.close()

if __name__ == '__main__':
    main()
