import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
import os

EXCEL_FILE = "tasks.xlsx"

def migrate():
    if not os.path.exists(EXCEL_FILE):
        print("tasks.xlsx does not exist yet. It will be created by app.py.")
        return
        
    wb = openpyxl.load_workbook(EXCEL_FILE)
    if "QuickLinks" in wb.sheetnames:
        del wb["QuickLinks"]
        
    ws = wb.create_sheet(title="QuickLinks")
    headers = ["Portal Name", "URL"]
    ws.append(headers)
    
    header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    center_align = Alignment(horizontal="center", vertical="center")
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
        
    default_links = [
        ["IPAM", "http://phpipam.link3.net/index.php?page=login"],
        ["Longhaul capacity", "https://docs.google.com/spreadsheets/d/1ii_9zVD8h4jnpmLDmY9YVFCwyKI1bjik6rfdieHuxaQ/edit?pli=1&gid=601623573#gid=601623573"],
        ["support portal", "https://supportnew.link3.net/login"],
        ["NCE-IP", "https://100.64.174.2:31943/unisso/login.action?service=%2Funisess%2Fv1%2Fauth%3Fservice%3D%252Fncecommonwebsite%252Fv1%252Fnewportal%252Fportal%252Floading%252Floading.html&decision=1"],
        ["FastnetMON", "http://203.76.96.135:81/d/Pafh6WcMz/fastnetmon-advanced-traffic-for-specified-network-ngnc?orgId=1&var-Network=27.147.206.0%2F24&from=now-12h&to=now"],
        ["Solarwind", "https://10.49.38.35/Orion/Login.aspx?ReturnUrl=%2f"],
        ["rConfig", "https://203.76.96.72/login.php"],
        ["CCB", "https://forms.office.com/Pages/ResponsePage.aspx?id=2vmlvc2470e6P5FkUmmiSCCNmyl2Yt9CmK2oHwTSyQFUMFFMSlk0TzAyWlJVWklYQUo2ODkyTFQ0Sy4u"],
        ["Weather Map > Backbone", "http://traffic.link3.net/"],
        ["Weather Map > IIG", "http://203.76.96.178/cacti/plugins/weathermap/weathermap-cacti-plugin.php?newtheme=1"],
        ["Whatsupgold > BTS", "http://nms.link3.net:4343/"],
        ["Whatsupgold > Client", "http://10.65.2.110:8080/"],
        ["Observium > Huawei RT-SW", "http://203.76.96.39/"],
        ["Observium > Mikrotik", "http://203.76.96.170/"],
        ["Observium > Other RT-SW", "http://203.76.96.37/"],
        ["Data-sheet > B2B Temporary Stop- CR Config Backup", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B41D4D021-F90F-4CA1-AFF3-C8E16FECDCA7%7D&file=B2B%20Temporary%20Stop-%20Config%20Backup.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1"],
        ["Data-sheet > B2B Termination- CR Backup Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B40B50934-3602-4B5E-9733-F488187EE1A9%7D&file=B2B%20Link%20Termination-%20Config%20Backup.xlsx&action=default&mobileredirect=true"],
        ["Data-sheet > Client_Peering_IP and ASN info", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7BFE668B86-4B3A-46B9-9A62-78DA7A43B0D9%7D&file=Client_Peering_IP%20and%20ASN.xlsx&action=default&mobileredirect=true"],
        ["Data-sheet > Public IP Free Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B29CA13A7-3199-43D0-A450-901C2AF737B4%7D&file=BANDWIDTH%20ALLOCATION(ALLOT).xlsx&action=default&mobileredirect=true&CID=7A769A90-0A5A-4F4F-A77D-3C119AB03432&wdLOR=c6D3F4E89-180A-4121-88F5-BE3994886638"],
        ["Data-sheet > Lock_Unlock_Log Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B105EE30F-A529-4D31-8F60-AB86685762F6%7D&file=Lock_Unlock_Log.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1"],
        ["Data-sheet > Temporary BW Upgradation Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B35B41F0A-766C-4DF6-92A8-A0DDD8954C05%7D&file=Allot%20Entry%2C%20Graph%20Details.xlsx&action=default&mobileredirect=true"],
        ["Data-sheet > NGNC SLA Sheet", "https://link3365-my.sharepoint.com/:x:/r/personal/ujjal_biswas_link3_net/_layouts/15/Doc.aspx?sourcedoc=%7B862C8FA9-E1B3-4960-BF84-43E37B36F975%7D&file=NGNC%20SLA%20V1.xlsx&action=default&mobileredirect=true"]
    ]
    
    for item in default_links:
        ws.append(item)
        
    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 50
    
    wb.save(EXCEL_FILE)
    wb.close()
    print("Migration successful! Portal list updated in Excel.")

if __name__ == "__main__":
    migrate()
