import socket
import time
import re

class TelnetClient:
    def __init__(self, host, port=23, timeout=10):
        self.host = host
        self.port = int(port)
        self.timeout = timeout
        self.sock = None
        self.buffer = bytearray()

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), timeout=self.timeout)
        self.sock.setblocking(False)
        self.buffer = bytearray()

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    def _recv_raw(self):
        if not self.sock:
            return False
        try:
            data = self.sock.recv(8192)
            if not data:
                return False
            
            # Process IAC commands
            i = 0
            cleaned = bytearray()
            response = bytearray()
            n = len(data)
            
            while i < n:
                byte = data[i]
                if byte == 255:  # IAC (Interpret As Command)
                    if i + 1 < n:
                        cmd = data[i+1]
                        if cmd in (251, 252, 253, 254):  # WILL, WONT, DO, DONT
                            if i + 2 < n:
                                opt = data[i+2]
                                # Respond to DO (253) -> WONT (252)
                                if cmd == 253:
                                    response.extend([255, 252, opt])
                                # Respond to WILL (251) -> DONT (254)
                                elif cmd == 251:
                                    response.extend([255, 254, opt])
                                i += 3
                                continue
                        elif cmd == 250:  # SB (Subnegotiation)
                            # Search for SE (240) preceded by IAC (255)
                            se_pos = -1
                            for j in range(i + 2, n - 1):
                                if data[j] == 255 and data[j+1] == 240:
                                    se_pos = j + 1
                                    break
                            if se_pos != -1:
                                i = se_pos + 1
                                continue
                            else:
                                i = n
                                continue
                        elif cmd == 255:  # Escaped 255
                            cleaned.append(255)
                            i += 2
                            continue
                        i += 2
                        continue
                    else:
                        i += 1
                        continue
                else:
                    cleaned.append(byte)
                    i += 1
            
            if response:
                try:
                    self.sock.setblocking(True)
                    self.sock.sendall(response)
                    self.sock.setblocking(False)
                except Exception:
                    pass
            
            self.buffer.extend(cleaned)
            return True
        except BlockingIOError:
            return True
        except Exception:
            return False

    def read_until(self, expected_list, read_timeout=5):
        if isinstance(expected_list, str):
            expected_list = [expected_list]
        
        expected_bytes = [exp.encode('utf-8', errors='ignore') for exp in expected_list]
        
        start_time = time.time()
        while time.time() - start_time < read_timeout:
            # Check if any expected pattern is in buffer
            for idx, exp in enumerate(expected_bytes):
                pos = self.buffer.find(exp)
                if pos != -1:
                    end_pos = pos + len(exp)
                    result = self.buffer[:end_pos].decode('utf-8', errors='ignore')
                    del self.buffer[:end_pos]
                    return result
            
            # Detect pagination prompt (e.g. "--More--", " ( Press 'Q' to quit )-- ")
            # Resolve backspaces and ANSI escape codes on a copy of the buffer to find prompts reliably
            cleaned_buf = re.sub(br'\x1b\[[0-9;]*[a-zA-Z]', b'', self.buffer)
            res_bytes = bytearray()
            for byte in cleaned_buf:
                if byte == 8:
                    if res_bytes:
                        res_bytes.pop()
                else:
                    res_bytes.append(byte)
            cleaned_text = bytes(res_bytes).lower()
            
            more_pos = -1
            for prompt in (b"more", b"press 'q' to quit", b"press any key"):
                pos = cleaned_text.find(prompt)
                if pos != -1:
                    more_pos = pos
                    break
                    
            if more_pos != -1:
                try:
                    self.sock.setblocking(True)
                    self.sock.sendall(b" ")
                    self.sock.setblocking(False)
                except Exception:
                    pass
                    
                # Find where the prompt starts in the original self.buffer and slice it out
                idx = -1
                for kw in (b"to quit", b"More", b"key to cont", b"Press 'Q'"):
                    pos = self.buffer.find(kw)
                    if pos != -1:
                        idx = pos
                        break
                
                if idx != -1:
                    # Keep everything before the prompt, discard the prompt and everything after it
                    del self.buffer[idx:]
                else:
                    # Fallback to clearing the whole buffer if prompt keyword position could not be found
                    self.buffer.clear()
                    
                start_time = time.time()
            
            success = self._recv_raw()
            if not success:
                break
            time.sleep(0.005)
            
        result = self.buffer.decode('utf-8', errors='ignore')
        self.buffer.clear()
        return result

    def flush(self):
        if not self.sock:
            return
        while True:
            try:
                data = self.sock.recv(8192)
                if not data:
                    break
            except BlockingIOError:
                break
            except Exception:
                break
        self.buffer.clear()

    def write(self, command, newline="\r\n"):
        if self.sock:
            data = command + newline
            self.sock.setblocking(True)
            self.sock.sendall(data.encode('utf-8'))
            self.sock.setblocking(False)


class OLTConnection:
    def __init__(self, host, port, username, password, enable_password, brand):
        self.host = host
        self.port = int(port)
        self.username = username
        self.password = password
        self.enable_password = enable_password
        self.brand = brand.lower()  # 'vsol' or 'cdata'
        self.client = None
        self.prompt = "#"
        self.session_log = ""

    def log_write(self, cmd):
        self.session_log += f"{cmd}\r\n"

    def log_read(self, output):
        self.session_log += output

    def connect(self):
        self.client = TelnetClient(self.host, self.port)
        self.client.connect()
        
        # Login sequence
        res = self.client.read_until(["User name:", "Username:", "login:", "User Name:", "login Name:"], read_timeout=5)
        self.log_read(res)
        
        self.client.write(self.username)
        self.log_write(self.username)
        
        res = self.client.read_until(["Password:", "password:"], read_timeout=5)
        self.log_read(res)
        
        self.client.write(self.password)
        self.log_write("********")
        
        res = self.client.read_until([">", "#"], read_timeout=5)
        self.log_read(res)
        
        # If we landed directly in config mode, exit to EXEC mode first
        if "(config)" in res:
            self.client.write("exit")
            self.log_write("exit")
            res = self.client.read_until([">", "#"], read_timeout=5)
            self.log_read(res)
            
        # Privilege mode (enable)
        if ">" in res:
            self.client.write("enable")
            self.log_write("enable")
            res_en = self.client.read_until(["Password:", "password:", "#"], read_timeout=5)
            self.log_read(res_en)
            
            if "Password" in res_en or "password" in res_en:
                self.client.write(self.enable_password or "")
                self.log_write("********" if self.enable_password else "")
                res_en = self.client.read_until(["#"], read_timeout=5)
                self.log_read(res_en)
                
        # Try to disable command paging in EXEC mode
        for cmd in ("terminal length 0", "no clipaging"):
            try:
                self.client.write(cmd)
                self.log_write(cmd)
                res_t = self.client.read_until(["#"], read_timeout=3)
                self.log_read(res_t)
            except Exception:
                pass
            
        # Brand-specific configuration mode command
        config_cmd = "config"
        if self.brand == "huawei_gpon":
            config_cmd = "system-view"
        elif self.brand in ("fhnet_epon", "phyhome_epon", "utstarcom_epon", "vsol", "vsol_gpon"):
            config_cmd = "configure terminal"
            
        self.client.write(config_cmd)
        self.log_write(config_cmd)
        res_cfg = self.client.read_until(["#"], read_timeout=5)
        self.log_read(res_cfg)
        
        # Try to disable command paging in config mode (for all brands, especially VSOL/Atop/Huawei)
        for cmd in ("no clipaging", "terminal length 0", "do terminal length 0", "do no clipaging"):
            try:
                self.client.write(cmd)
                self.log_write(cmd)
                res_p = self.client.read_until(["#"], read_timeout=3)
                self.log_read(res_p)
            except Exception:
                pass
                
        return True

    def execute_command(self, cmd, expected_prompt="#", timeout=10):
        if not self.client:
            raise Exception("Not connected to OLT")
        self.client.flush()
        self.client.write(cmd)
        self.log_write(cmd)
        
        output = self.client.read_until([expected_prompt], read_timeout=timeout)
        self.log_read(output)
        
        # Process output to clean echo and prompt
        lines = output.splitlines()
        if lines:
            if cmd in lines[0] or lines[0].strip() == cmd:
                lines = lines[1:]
            if lines and expected_prompt in lines[-1]:
                lines = lines[:-1]
        return "\n".join(lines)

    def close(self):
        if self.client:
            try:
                self.client.write("exit")
                self.log_write("exit")
            except Exception:
                pass
            self.client.close()
            self.client = None
