import os
import re
import json
import openpyxl
import paramiko

print("=== Starting Full Browser Cache Extraction & Database Restoration ===")

cache_dirs = [
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data\Default\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data\Profile 1\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data\Profile 2\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data\Default\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data\Profile 1\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data\Profile 2\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Mozilla\Firefox\Profiles")
]

all_extracted_tasks = {}

for c_dir in cache_dirs:
    if os.path.exists(c_dir):
        for root, dirs, files in os.walk(c_dir):
            for file in files:
                filepath = os.path.join(root, file)
                try:
                    sz = os.path.getsize(filepath)
                    if 100 < sz < 15 * 1024 * 1024:
                        with open(filepath, 'rb') as fp:
                            content = fp.read()
                            if b'TSK-' in content and (b'"description"' in content or b'"owner"' in content):
                                # 1. Extract JSON arrays
                                array_matches = re.findall(rb'(\[\s*\{.*?"id":\s*"TSK-[0-9]{4}".*?\}\s*\])', content, re.DOTALL)
                                for m in array_matches:
                                    try:
                                        parsed = json.loads(m.decode('utf-8', errors='ignore'))
                                        for t in parsed:
                                            if isinstance(t, dict) and 'id' in t:
                                                tid = t['id']
                                                # Keep most complete / updated version
                                                if tid not in all_extracted_tasks or len(str(t)) > len(str(all_extracted_tasks[tid])):
                                                    all_extracted_tasks[tid] = t
                                    except Exception:
                                        pass
                                        
                                # 2. Extract JSON single objects
                                single_matches = re.findall(rb'(\{\s*"id":\s*"TSK-[0-9]{4}".*?\})', content, re.DOTALL)
                                for sm in single_matches:
                                    try:
                                        t = json.loads(sm.decode('utf-8', errors='ignore'))
                                        if isinstance(t, dict) and 'id' in t:
                                            tid = t['id']
                                            if tid not in all_extracted_tasks or len(str(t)) > len(str(all_extracted_tasks[tid])):
                                                all_extracted_tasks[tid] = t
                                    except Exception:
                                        pass
                except Exception:
                    pass

print(f"Extracted {len(all_extracted_tasks)} unique task records from browser caches!")

# Load existing tasks from tasks.xlsx
wb = openpyxl.load_workbook('tasks.xlsx')
ws_tasks = wb['Tasks']

existing_tasks = {}
for row in ws_tasks.iter_rows(min_row=2, values_only=True):
    if row and row[0]:
        tid = str(row[0]).strip()
        existing_tasks[tid] = {
            "id": tid,
            "description": row[1],
            "owner": row[2],
            "start_time": row[3],
            "end_time": row[4],
            "duration": row[5],
            "status": row[6],
            "last_updated": row[7],
            "pending_reason": row[8],
            "escalation_history": row[9],
            "config_status": row[10],
            "mis_status": row[11],
            "assigned_time": row[12] if len(row) > 12 else None,
            "assignment_history": row[13] if len(row) > 13 else None
        }

print(f"Existing tasks in Excel before merge: {len(existing_tasks)}")

# Merge extracted tasks into existing tasks
merged_tasks = dict(existing_tasks)
for tid, t in all_extracted_tasks.items():
    if tid not in merged_tasks:
        merged_tasks[tid] = t
    else:
        # If cache has more updated / newer info, update fields
        for k, v in t.items():
            if v and not merged_tasks[tid].get(k):
                merged_tasks[tid][k] = v

print(f"Total merged tasks after restoration: {len(merged_tasks)}")

# Rebuild Tasks worksheet in tasks.xlsx
del wb['Tasks']
ws_new = wb.create_sheet(title='Tasks', index=0)
headers = [
    "Task ID", "Description", "Owner", "Start Time", "End Time", "Duration",
    "Status", "Last Updated", "Pending Reason", "Escalation History",
    "Config Status", "MIS Status", "Assigned Time", "Assignment History"
]
ws_new.append(headers)

# Sort tasks by Task ID numerical order (TSK-1001, TSK-1002, ...)
def sort_key(k):
    try:
        return int(k.replace("TSK-", ""))
    except Exception:
        return 999999

for tid in sorted(merged_tasks.keys(), key=sort_key):
    t = merged_tasks[tid]
    ws_new.append([
        t.get("id", tid),
        t.get("description", ""),
        t.get("owner", ""),
        t.get("start_time", ""),
        t.get("end_time", ""),
        t.get("duration", ""),
        t.get("status", "Pending"),
        t.get("last_updated", ""),
        t.get("pending_reason", ""),
        t.get("escalation_history", ""),
        t.get("config_status", ""),
        t.get("mis_status", "Not Closed"),
        t.get("assigned_time", ""),
        t.get("assignment_history", "")
    ])

wb.save('tasks.xlsx')
print("Successfully saved all merged tasks to local tasks.xlsx!")

# Create automatic backup folder and timestamped backup
os.makedirs('backups', exist_ok=True)
import datetime
ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
wb.save(f"backups/tasks_recovered_{ts}.xlsx")
print(f"Created local backup: backups/tasks_recovered_{ts}.xlsx")

# Upload and apply to remote production server
print("Uploading restored tasks database to remote server 203.76.96.218...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('203.76.96.218', port=30222, username='subrata', password='Ai@Link3@2050')

sftp = ssh.open_sftp()
sftp.put('tasks.xlsx', '/home/subrata/task-manager/tasks.xlsx')
sftp.close()

# Restart server to refresh cache
stdin, stdout, stderr = ssh.exec_command("/home/subrata/task-manager/start.sh")
print(stdout.read().decode())
ssh.close()
print("=== DATABASE RESTORATION COMPLETE! ALL TASKS ARE LIVE ON PRODUCTION ===")
