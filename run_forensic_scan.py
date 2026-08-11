import paramiko
import sys

# Ensure UTF-8 output
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

forensic_script = """
import os
import glob
import subprocess
import re

print("=== 1. Searching for any temporary or swap files across the entire filesystem ===")
cmd_temp = "sudo find / -name '*tasks*' -o -name '*openpyxl*' -o -name '*gunicorn*' -o -name '*excel*' 2>/dev/null | grep -v '/proc' | grep -v '/sys'"
p = subprocess.run(cmd_temp, shell=True, capture_output=True, text=True, errors='ignore')
print(p.stdout)

print("=== 2. Searching Linux journal / syslog for task references ===")
cmd_log = "sudo grep -a -i -E 'TSK-[0-9]{4}|task|escalat' /var/log/syslog* /var/log/messages* /var/log/daemon* /var/log/nginx/* /var/log/apache2/* 2>/dev/null | head -n 40"
p_log = subprocess.run(cmd_log, shell=True, capture_output=True, text=True, errors='ignore')
print("Logs match count:", len(p_log.stdout.splitlines()))
if p_log.stdout:
    print(p_log.stdout[:1000])

print("=== 3. Checking for ext4 block devices & debugfs ===")
p_mount = subprocess.run("mount | grep ' / ' ; mount | grep ' /home '", shell=True, capture_output=True, text=True, errors='ignore')
print("Mounts:", p_mount.stdout)

p_lsblk = subprocess.run("lsblk -a 2>/dev/null || df -h", shell=True, capture_output=True, text=True, errors='ignore')
print("Storage devices:\\n", p_lsblk.stdout)

print("=== 4. Checking Python / Gunicorn process core / deleted files ===")
p_deleted = subprocess.run("sudo lsof +L1 2>/dev/null || true", shell=True, capture_output=True, text=True, errors='ignore')
print("Deleted open files:\\n", p_deleted.stdout)

print("=== 5. Scanning /home/subrata/.cache, /tmp, and /var/tmp ===")
for root, dirs, files in os.walk('/tmp'):
    for f in files:
        full = os.path.join(root, f)
        try:
            sz = os.path.getsize(full)
            if sz > 100:
                with open(full, 'rb') as fp:
                    hdr = fp.read(4)
                    if hdr == b'\\x50\\x4b\\x03\\x04':
                        print(f"Found ZIP/XLSX file in tmp: {full} ({sz} bytes)")
        except Exception:
            pass

for root, dirs, files in os.walk('/home/subrata/.cache'):
    for f in files:
        full = os.path.join(root, f)
        try:
            sz = os.path.getsize(full)
            if sz > 100:
                with open(full, 'rb') as fp:
                    hdr = fp.read(4)
                    if hdr == b'\\x50\\x4b\\x03\\x04':
                        print(f"Found ZIP/XLSX file in cache: {full} ({sz} bytes)")
        except Exception:
            pass
"""

sftp = ssh.open_sftp()
with sftp.file("/home/subrata/task-manager/forensic_scan.py", "w") as f:
    f.write(forensic_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("echo 'Ai@Link3@2050' | sudo -S python3 /home/subrata/task-manager/forensic_scan.py")
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
