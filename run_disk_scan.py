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
import subprocess
import re
import os

print("--- 1. Mounting Info ---")
p = subprocess.run(["mount"], capture_output=True, text=True)
home_dev = None
for line in p.stdout.splitlines():
    if " /home " in line:
        home_dev = line.split()[0]
        print("Home device:", home_dev)

if not home_dev:
    print("Could not find home device from mount")
else:
    print("--- 2. Scanning for deleted xlsx or zip PK signatures on " + home_dev + " ---")
    # Scan journal or raw device with strings/grep
    # Look for TSK- or recent task descriptions
    cmd = f"sudo grep -a -b -E 'TSK-[0-9]{{4}}' {home_dev} | head -n 50"
    print("Running command:", cmd)
    p2 = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors='ignore')
    print("Output lines:", len(p2.stdout.splitlines()))
    for line in p2.stdout.splitlines()[:30]:
        print("Found:", line[:200])
"""

sftp = ssh.open_sftp()
with sftp.file("/home/subrata/task-manager/disk_scan.py", "w") as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("echo 'Ai@Link3@2050' | sudo -S python3 /home/subrata/task-manager/disk_scan.py")
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
