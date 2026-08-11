import openpyxl
import os
import paramiko

new_datasheet_links = [
    ("Data-sheet > B2B Temporary Stop- CR Config Backup", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B41D4D021-F90F-4CA1-AFF3-C8E16FECDCA7%7D&file=B2B%20Temporary%20Stop-%20Config%20Backup.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1"),
    ("Data-sheet > B2B Termination- CR Backup Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B40B50934-3602-4B5E-9733-F488187EE1A9%7D&file=B2B%20Link%20Termination-%20Config%20Backup.xlsx&action=default&mobileredirect=true"),
    ("Data-sheet > Client_Peering_IP and ASN info", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7BFE668B86-4B3A-46B9-9A62-78DA7A43B0D9%7D&file=Client_Peering_IP%20and%20ASN.xlsx&action=default&mobileredirect=true"),
    ("Data-sheet > Public IP Free Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B29CA13A7-3199-43D0-A450-901C2AF737B4%7D&file=BANDWIDTH%20ALLOCATION(ALLOT).xlsx&action=default&mobileredirect=true&CID=7A769A90-0A5A-4F4F-A77D-3C119AB03432&wdLOR=c6D3F4E89-180A-4121-88F5-BE3994886638"),
    ("Data-sheet > Lock_Unlock_Log Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B105EE30F-A529-4D31-8F60-AB86685762F6%7D&file=Lock_Unlock_Log.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1"),
    ("Data-sheet > Temporary BW Upgradation Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B35B41F0A-766C-4DF6-92A8-A0DDD8954C05%7D&file=Allot%20Entry%2C%20Graph%20Details.xlsx&action=default&mobileredirect=true"),
    ("Data-sheet > NGNC SLA Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B862C8FA9-E1B3-4960-BF84-43E37B36F975%7D&file=NGNC%20SLA%20V1.xlsx&action=default&mobileredirect=true")
]

def update_local_excel():
    excel_path = "tasks.xlsx"
    wb = openpyxl.load_workbook(excel_path)
    if "QuickLinks" not in wb.sheetnames:
        ws = wb.create_sheet("QuickLinks")
        ws.append(["Name", "URL"])
    else:
        ws = wb["QuickLinks"]

    existing = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row and row[0] and row[1]:
            existing.append((str(row[0]).strip(), str(row[1]).strip()))

    # Remove any old Data-sheet links if re-running
    cleaned = [link for link in existing if not link[0].startswith("Data-sheet >")]
    
    # Add new datasheet links
    all_links = cleaned + new_datasheet_links

    # Rewrite sheet
    del wb["QuickLinks"]
    ws_new = wb.create_sheet("QuickLinks")
    ws_new.append(["Name", "URL"])
    for name, url in all_links:
        ws_new.append([name, url])

    wb.save(excel_path)
    print(f"Local tasks.xlsx updated with {len(all_links)} total quick links ({len(new_datasheet_links)} Data-sheet links).")

def update_remote_excel():
    host = '203.76.96.218'
    port = 30222
    username = 'subrata'
    password = 'Ai@Link3@2050'

    print("Connecting to remote server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=username, password=password, timeout=15)

    # Remote script to update tasks.xlsx on server
    remote_py = f"""
import openpyxl

new_datasheet_links = {new_datasheet_links}
excel_path = '/home/subrata/task-manager/tasks.xlsx'

wb = openpyxl.load_workbook(excel_path)
if 'QuickLinks' not in wb.sheetnames:
    ws = wb.create_sheet('QuickLinks')
    ws.append(['Name', 'URL'])
else:
    ws = wb['QuickLinks']

existing = []
for row in ws.iter_rows(min_row=2, values_only=True):
    if row and row[0] and row[1]:
        existing.append((str(row[0]).strip(), str(row[1]).strip()))

cleaned = [link for link in existing if not link[0].startswith('Data-sheet >')]
all_links = cleaned + new_datasheet_links

del wb['QuickLinks']
ws_new = wb.create_sheet('QuickLinks')
ws_new.append(['Name', 'URL'])
for name, url in all_links:
    ws_new.append([name, url])

wb.save(excel_path)
print(f'Remote tasks.xlsx successfully updated with {{len(all_links)}} quick links!')
"""
    sftp = ssh.open_sftp()
    with sftp.file("/home/subrata/task-manager/update_remote_datasheet.py", "w") as f:
        f.write(remote_py)
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command("cd /home/subrata/task-manager && python3 update_remote_datasheet.py")
    print(stdout.read().decode())
    print(stderr.read().decode())
    ssh.close()
    print("Remote sync completed successfully!")

if __name__ == '__main__':
    update_local_excel()
    update_remote_excel()
