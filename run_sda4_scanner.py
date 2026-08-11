import paramiko
import sys

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
CHUNK_SIZE = 32 * 1024 * 1024  # 32MB chunk
OVERLAP = 2 * 1024 * 1024       # 2MB overlap

dev_path = '/tmp/sda4'
recovered_dir = '/home/subrata/task-manager/recovered_xlsx'
os.makedirs(recovered_dir, exist_ok=True)

print(f"=== Deep Scanning {dev_path} for Deleted Excel Databases ===")

found_count = 0
best_task_count = 0
best_wb_path = None
all_recovered_info = []

try:
    with open(dev_path, 'rb') as f:
        offset = 0
        buffer = b''
        
        # Scan first 20GB of /home partition
        max_scan = 20 * 1024 * 1024 * 1024
        
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
                if b'xl/workbook.xml' in zip_slice and b'xl/worksheets/sheet1.xml' in zip_slice:
                    try:
                        eocd_idx = zip_slice.rfind(b'\\x50\\x4b\\x05\\x06')
                        if eocd_idx != -1:
                            exact_zip = zip_slice[:eocd_idx + 22]
                            try:
                                zf = zipfile.ZipFile(io.BytesIO(exact_zip))
                                names = zf.namelist()
                                if 'xl/workbook.xml' in names and 'xl/worksheets/sheet1.xml' in names:
                                    # Count rows in sheet1.xml
                                    s1 = zf.read('xl/worksheets/sheet1.xml')
                                    root = ET.fromstring(s1)
                                    rows = root.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                                    task_rows = max(0, len(rows) - 1)
                                    
                                    # Check shared strings for task content
                                    ss_content = zf.read('xl/sharedStrings.xml').decode('utf-8', errors='ignore') if 'xl/sharedStrings.xml' in names else ''
                                    
                                    # Check if it has 'TSK-' or 'Tasks' sheet
                                    if 'TSK-' in ss_content or task_rows > 0:
                                        found_count += 1
                                        save_path = f"{recovered_dir}/recovered_{found_count}.xlsx"
                                        with open(save_path, 'wb') as sf:
                                            sf.write(exact_zip)
                                            
                                        info = {
                                            "file": save_path,
                                            "tasks": task_rows,
                                            "offset": offset + idx,
                                            "has_aug": ('2026-08-11' in ss_content or '2026-08-10' in ss_content or '2026-08-09' in ss_content or '2026-08-08' in ss_content or '2026-08-07' in ss_content)
                                        }
                                        all_recovered_info.append(info)
                                        print(f"[FOUND #{found_count}] {save_path} | Rows: {task_rows} | Recent Aug Dates: {info['has_aug']}")
                                        
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
                print(f"Scanned {offset // (1024*1024*1024)} GB / 20 GB... (Found {found_count} xlsx archives)")

except Exception as e:
    print("Error reading disk:", e)

print(f"\\n=== Scan Complete ===")
print(f"Total Excel archives found: {found_count}")
print(f"Best file: {best_wb_path} with {best_task_count} task rows")
for item in all_recovered_info:
    print(item)
"""

sftp = ssh.open_sftp()
with sftp.file("/home/subrata/task-manager/scan_sda4.py", "w") as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("echo 'Ai@Link3@2050' | sudo -S python3 /home/subrata/task-manager/scan_sda4.py")
while not stdout.channel.exit_status_ready():
    if stdout.channel.recv_ready():
        sys.stdout.write(stdout.channel.recv(1024).decode('utf-8', errors='ignore'))
        sys.stdout.flush()

print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
