import paramiko
import sys

# UTF-8 stdout
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

host = '203.76.96.218'
port = 30222
username = 'subrata'
password = 'Ai@Link3@2050'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port=port, username=username, password=password, timeout=15)

script = """
import io
import zipfile
import xml.etree.ElementTree as ET
import os
import sys

PK_HEADER = b'\\x50\\x4b\\x03\\x04'
CHUNK_SIZE = 20 * 1024 * 1024  # 20MB chunk
OVERLAP = 2 * 1024 * 1024       # 2MB overlap

dev_path = '/dev/sda4'
recovered_dir = '/home/subrata/task-manager/recovered_xlsx'
os.makedirs(recovered_dir, exist_ok=True)

print(f"Scanning {dev_path} for Excel ZIP archives using built-in zip parser...")

found_count = 0
best_task_count = 0
best_wb_path = None

with open(dev_path, 'rb') as f:
    offset = 0
    buffer = b''
    
    # Read up to 25GB of /dev/sda4 (entire used space)
    max_scan = 25 * 1024 * 1024 * 1024
    
    while offset < max_scan:
        chunk = f.read(CHUNK_SIZE)
        if not chunk:
            break
            
        data = buffer + chunk
        idx = 0
        
        while True:
            idx = data.find(PK_HEADER, idx)
            if idx == -1:
                break
                
            zip_slice = data[idx:idx + 4 * 1024 * 1024]
            if b'xl/workbook.xml' in zip_slice or b'[Content_Types].xml' in zip_slice:
                try:
                    # Find End of Central Directory signature (PK\\x05\\x06)
                    eocd_idx = zip_slice.rfind(b'\\x50\\x4b\\x05\\x06')
                    if eocd_idx != -1:
                        exact_zip = zip_slice[:eocd_idx + 22]
                        try:
                            zf = zipfile.ZipFile(io.BytesIO(exact_zip))
                            names = zf.namelist()
                            if 'xl/workbook.xml' in names and 'xl/worksheets/sheet1.xml' in names:
                                found_count += 1
                                save_path = f"{recovered_dir}/recovered_{found_count}.xlsx"
                                with open(save_path, 'wb') as sf:
                                    sf.write(exact_zip)
                                
                                # Count rows in sheet1.xml
                                s1 = zf.read('xl/worksheets/sheet1.xml')
                                root = ET.fromstring(s1)
                                rows = root.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                                task_rows = max(0, len(rows) - 1)
                                
                                # Check shared strings for dates
                                ss_content = zf.read('xl/sharedStrings.xml').decode('utf-8', errors='ignore') if 'xl/sharedStrings.xml' in names else ''
                                
                                has_aug11 = '2026-08-11' in ss_content or '2026-08-10' in ss_content or '2026-08-09' in ss_content
                                
                                print(f"[+] Recovered #{found_count} at {offset+idx} bytes: Tasks={task_rows} rows (Has Aug 9-11: {has_aug11})")
                                
                                if task_rows > best_task_count:
                                    best_task_count = task_rows
                                    best_wb_path = save_path
                        except Exception:
                            pass
                except Exception:
                    pass
            idx += 4
            
        buffer = data[-OVERLAP:]
        offset += len(chunk)
        if offset % (1024 * 1024 * 1024) == 0:
            print(f"Scanned {offset // (1024*1024*1024)} GB... (Found {found_count} xlsx archives, max tasks: {best_task_count})")

print(f"\\nScan finished! Total recovered archives: {found_count}. Best version: {best_wb_path} with {best_task_count} tasks.")
"""

sftp = ssh.open_sftp()
with sftp.file("/home/subrata/task-manager/scan_blocks.py", "w") as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("echo 'Ai@Link3@2050' | sudo -S python3 /home/subrata/task-manager/scan_blocks.py")
while not stdout.channel.exit_status_ready():
    if stdout.channel.recv_ready():
        sys.stdout.write(stdout.channel.recv(1024).decode('utf-8', errors='ignore'))
        sys.stdout.flush()
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
