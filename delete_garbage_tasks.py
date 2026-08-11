import openpyxl
import paramiko
import os

print("=== Removing Garbage & Test Tasks from Database ===")

wb = openpyxl.load_workbook('tasks.xlsx')
ws = wb['Tasks']

headers = [cell.value for cell in ws[1]]

# Target task IDs / descriptions to remove
garbage_ids = [
    'TSK-1006', # Tki-Test-2
    'TSK-1007', # task-test-3
    'TSK-1011', # escalation test
    'TSK-1012', # task-22222222222 [Blocked: due to cus]
    'TSK-1013', # notun ekta task kori
    'TSK-1014', # new task to check
    'TSK-1015', # another for pending
    'TSK-1017', # working with tki4094094
    'TSK-1018', # working with CR120203
    'TSK-1035', # working with CR120203 duplicate
]

kept_rows = []
removed_count = 0

for row in ws.iter_rows(min_row=2, values_only=True):
    t_id = str(row[0] or '').strip()
    desc = str(row[1] or '').strip()
    
    if t_id in garbage_ids or desc.lower() in [
        'tki-test-2', 'task-test-3', 'escalation  test', 'escalation test',
        'task-22222222222 [blocked: due to cus]', 'notun ekta task kori',
        'new task to check', 'another for pending', 'working with tki4094094',
        'working with cr120203'
    ]:
        print(f"Removing task: {t_id} | {desc} | {row[2]}")
        removed_count += 1
    else:
        kept_rows.append(row)

# Clear and re-populate Tasks sheet
del wb['Tasks']
ws_new = wb.create_sheet(title='Tasks', index=0)
ws_new.append(headers)

for row in kept_rows:
    ws_new.append(row)

wb.save('tasks.xlsx')
print(f"\n[LOCAL] Successfully removed {removed_count} garbage tasks! Total remaining tasks: {len(kept_rows)}")

# Sync with Production Server
print("\nDeploying clean database to remote production server (203.76.96.218)...")
try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('203.76.96.218', port=30222, username='subrata', password='Ai@Link3@2050')

    sftp = ssh.open_sftp()
    sftp.put('tasks.xlsx', '/home/subrata/task-manager/tasks.xlsx')
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command("/home/subrata/task-manager/start.sh")
    print(stdout.read().decode())
    ssh.close()
    print("[PRODUCTION] Successfully updated remote production database!")
except Exception as e:
    print(f"[WARNING] Remote sync error: {e}")

print("=== CLEANUP OPERATION COMPLETE ===")
