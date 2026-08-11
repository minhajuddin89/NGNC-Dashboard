import openpyxl
import os
import datetime
import paramiko

print("=== Importing Complete August 2026 Roster from Official Schedule ===")

source_file = os.path.expanduser("~/Downloads/NGNC Duty Schedule August'26.xlsx")
if not os.path.exists(source_file):
    source_file = "NGNC Duty Schedule August'26.xlsx"

wb_src = openpyxl.load_workbook(source_file, data_only=True)
ws_src = wb_src['Roster']

shift_times = {
    'M': ('09:30', '18:30', 'Morning Shift'),
    'E': ('14:00', '22:00', 'Evening Shift'),
    'EE': ('11:00', '20:00', 'Early Evening Shift'),
    'LE': ('16:00', '00:00', 'Late Evening Shift'),
    'D/O': (None, None, 'Day off'),
    'LEAVE': (None, None, 'Leave'),
    'Leave': (None, None, 'Leave')
}

roster_entries = []

# Row 1 has day numbers (1 to 31) starting at col 2
day_cols = {}
for col in range(2, 35):
    val = ws_src.cell(row=1, column=col).value
    if isinstance(val, int) and 1 <= val <= 31:
        day_cols[col] = val

print(f"Found {len(day_cols)} day columns (1 to 31)")

# Iterate through engineer rows (from row 3 downwards)
for row in range(3, 30):
    eng_name = ws_src.cell(row=row, column=1).value
    if not eng_name:
        continue
    eng_name = str(eng_name).strip()
    
    for col, day_num in day_cols.items():
        code = ws_src.cell(row=row, column=col).value
        code_str = str(code).strip() if code else 'D/O'
        if code_str.upper() in ['DO', 'DUTY OFF', 'D / O']:
            code_str = 'D/O'
        elif code_str.upper() == 'LEAVE':
            code_str = 'LEAVE'
            
        date_str = f"2026-08-{str(day_num).padStart(2, '0') if hasattr(str(day_num), 'padStart') else str(day_num).zfill(2)}"
        
        info = shift_times.get(code_str, shift_times.get(code_str.upper(), (None, None, 'Day off')))
        start_t, end_t, shift_n = info
        
        roster_entries.append([
            eng_name,
            date_str,
            code_str,
            start_t,
            end_t,
            shift_n
        ])

print(f"Total parsed official roster entries: {len(roster_entries)}")

# Update tasks.xlsx Roster sheet
wb_dst = openpyxl.load_workbook('tasks.xlsx')
if 'Roster' in wb_dst.sheetnames:
    del wb_dst['Roster']

ws_ros = wb_dst.create_sheet(title='Roster')
ws_ros.append(["Operator Name", "Date", "Shift Code", "Start Time", "End Time", "Shift Name"])

for entry in roster_entries:
    ws_ros.append(entry)

wb_dst.save('tasks.xlsx')
print("Successfully saved official August roster into tasks.xlsx!")

# Upload to production server
print("Deploying updated roster database to production server...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('203.76.96.218', port=30222, username='subrata', password='Ai@Link3@2050')

sftp = ssh.open_sftp()
sftp.put('tasks.xlsx', '/home/subrata/task-manager/tasks.xlsx')
sftp.close()

stdin, stdout, stderr = ssh.exec_command("/home/subrata/task-manager/start.sh")
print(stdout.read().decode())
ssh.close()
print("=== ROSTER UPDATE & PRODUCTION SYNC COMPLETE ===")
