import os
import glob
import re
import json
import openpyxl
import datetime

print("=== Starting Deep Multi-Source Browser Recovery (LevelDB, Sessions, Cache, Temp) ===")

search_roots = [
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data"),
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data"),
    os.path.expanduser(r"~\AppData\Local\Mozilla\Firefox"),
    os.path.expanduser(r"~\AppData\Local\Temp"),
    os.path.expanduser(r"~\Downloads")
]

all_found_tasks = {}

# Match any task object structure
task_patterns = [
    # JSON-like: {"id": "TSK-...", "description": "..."}
    re.compile(rb'\{[^{}]*?"id"\s*:\s*"(TSK-[0-9]+)"[^{}]*?\}', re.DOTALL),
    # Flexible field order
    re.compile(rb'\{[^{}]*?"description"\s*:\s*"([^"]+)"[^{}]*?"id"\s*:\s*"(TSK-[0-9]+)"[^{}]*?\}', re.DOTALL),
    re.compile(rb'\{[^{}]*?"owner"\s*:\s*"([^"]+)"[^{}]*?"id"\s*:\s*"(TSK-[0-9]+)"[^{}]*?\}', re.DOTALL),
]

scanned_files = 0
found_files = 0

for root_dir in search_roots:
    if not os.path.exists(root_dir):
        continue
    print(f"Scanning directory tree: {root_dir}...")
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            filepath = os.path.join(root, file)
            # Skip huge videos/installers
            try:
                sz = os.path.getsize(filepath)
                if 50 < sz < 30 * 1024 * 1024:
                    scanned_files += 1
                    with open(filepath, 'rb') as fp:
                        raw = fp.read()
                        
                    if b'TSK-' in raw:
                        found_files += 1
                        # 1. Try finding complete JSON arrays
                        # Find any bracketed array containing TSK-
                        pos = 0
                        while True:
                            idx = raw.find(b'[', pos)
                            if idx == -1:
                                break
                            # Look for closing bracket within 2MB
                            end_idx = raw.find(b']', idx)
                            if end_idx != -1 and (end_idx - idx) < 2 * 1024 * 1024:
                                slice_bytes = raw[idx:end_idx+1]
                                if b'TSK-' in slice_bytes and (b'"description"' in slice_bytes or b'"owner"' in slice_bytes):
                                    try:
                                        arr = json.loads(slice_bytes.decode('utf-8', errors='ignore'))
                                        if isinstance(arr, list):
                                            for item in arr:
                                                if isinstance(item, dict) and 'id' in item and str(item['id']).startswith('TSK-'):
                                                    tid = str(item['id']).strip()
                                                    if tid not in all_found_tasks or len(str(item)) > len(str(all_found_tasks[tid])):
                                                        all_found_tasks[tid] = item
                                    except Exception:
                                        pass
                            pos = idx + 1
                            if pos >= len(raw) - 10:
                                break
                                
                        # 2. Extract every single JSON object
                        for pat in task_patterns:
                            for m in pat.finditer(raw):
                                try:
                                    obj_str = m.group(0).decode('utf-8', errors='ignore')
                                    item = json.loads(obj_str)
                                    if isinstance(item, dict) and 'id' in item and str(item['id']).startswith('TSK-'):
                                        tid = str(item['id']).strip()
                                        if tid not in all_found_tasks or len(str(item)) > len(str(all_found_tasks[tid])):
                                            all_found_tasks[tid] = item
                                except Exception:
                                    pass
            except Exception:
                pass

print(f"\nScanned {scanned_files} files across browser & temp storages. Found {found_files} files containing task traces.")
print(f"Total unique tasks extracted: {len(all_found_tasks)}")

# Filter and display all extracted tasks
today_tasks = []
for tid in sorted(all_found_tasks.keys(), key=lambda x: int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 9999):
    t = all_found_tasks[tid]
    is_today = '2026-08-11' in str(t)
    if is_today:
        today_tasks.append(t)
    print(f"{tid}: {t.get('description', '')[:50]} | Owner: {t.get('owner', '')} | Status: {t.get('status', '')} | Start: {t.get('start_time', '')} | Updated: {t.get('last_updated', '')}")

print(f"\n=== TODAY'S (2026-08-11) EXTRACTED TASKS: {len(today_tasks)} ===")
for t in today_tasks:
    print(f"-> {t.get('id')}: {t.get('description')} | Owner: {t.get('owner')} | Status: {t.get('status')} | Start: {t.get('start_time')}")
