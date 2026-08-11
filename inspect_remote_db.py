import paramiko

host = '203.76.96.218'
port = 30222
username = 'subrata'
password = 'Ai@Link3@2050'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port=port, username=username, password=password, timeout=15)

script = """
import openpyxl
import os
import glob

print("Checking /home/subrata/task-manager/tasks.xlsx:")
if os.path.exists('/home/subrata/task-manager/tasks.xlsx'):
    wb = openpyxl.load_workbook('/home/subrata/task-manager/tasks.xlsx')
    print("Sheets:", wb.sheetnames)
    for s in wb.sheetnames:
        print(f"Sheet {s}: {wb[s].max_row - 1} rows")
else:
    print("tasks.xlsx does not exist!")

print("\\nLooking for backup files in /home/subrata/task-manager:")
backups = glob.glob('/home/subrata/task-manager/*.xlsx') + glob.glob('/home/subrata/task-manager/*.bak*') + glob.glob('/home/subrata/*.xlsx')
for b in backups:
    print(f"Found: {b} ({os.path.getsize(b)} bytes)")
"""

sftp = ssh.open_sftp()
with sftp.file("/home/subrata/task-manager/inspect_db.py", "w") as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("python3 /home/subrata/task-manager/inspect_db.py")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
