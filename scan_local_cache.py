import os
import glob
import re
import json

print("=== 1. Searching Downloads folder for any exported task spreadsheets ===")
downloads_path = os.path.expanduser("~/Downloads")
found_xlsx = glob.glob(os.path.join(downloads_path, "*.xlsx")) + glob.glob(os.path.join(downloads_path, "*task*"))
for f in found_xlsx:
    print(f"Found in Downloads: {f} ({os.path.getsize(f)} bytes)")

print("\n=== 2. Searching Chrome & Edge Browser Cache on Windows ===")
cache_dirs = [
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data\Default\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data\Profile 1\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\User Data\Profile 2\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data\Default\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data\Profile 1\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\User Data\Profile 2\Cache\Cache_Data"),
    os.path.expanduser(r"~\AppData\Local\Mozilla\Firefox\Profiles")
]

recovered_tasks = {}

for c_dir in cache_dirs:
    if os.path.exists(c_dir):
        print(f"Scanning browser cache: {c_dir}...")
        for root, dirs, files in os.walk(c_dir):
            for file in files:
                filepath = os.path.join(root, file)
                try:
                    sz = os.path.getsize(filepath)
                    if 100 < sz < 10 * 1024 * 1024:
                        with open(filepath, 'rb') as fp:
                            content = fp.read()
                            # Look for TSK- or dashboard-state JSON
                            if b'TSK-' in content and (b'"description"' in content or b'tasks' in content or b'"owner"' in content):
                                print(f"[+] Found matching cache file: {filepath} ({sz} bytes)")
                                # Try to extract JSON strings
                                matches = re.findall(rb'(\[\s*\{.*?"id":\s*"TSK-[0-9]{4}".*?\}\s*\])', content, re.DOTALL)
                                for m in matches:
                                    try:
                                        parsed = json.loads(m.decode('utf-8', errors='ignore'))
                                        for t in parsed:
                                            if isinstance(t, dict) and 'id' in t:
                                                recovered_tasks[t['id']] = t
                                                print(f"    Recovered Task: {t['id']} - {t.get('description', '')[:40]} ({t.get('owner', '')})")
                                    except Exception:
                                        pass
                                        
                                # Also check for individual task objects
                                single_matches = re.findall(rb'(\{\s*"id":\s*"TSK-[0-9]{4}".*?\})', content, re.DOTALL)
                                for sm in single_matches:
                                    try:
                                        t = json.loads(sm.decode('utf-8', errors='ignore'))
                                        if isinstance(t, dict) and 'id' in t:
                                            recovered_tasks[t['id']] = t
                                            print(f"    Recovered Single Task: {t['id']} - {t.get('description', '')[:40]} ({t.get('owner', '')})")
                                    except Exception:
                                        pass
                except Exception:
                    pass

print(f"\n=== RECOVERY SUMMARY ===")
print(f"Total unique tasks recovered from browser cache: {len(recovered_tasks)}")
for tid in sorted(recovered_tasks.keys()):
    t = recovered_tasks[tid]
    print(f"-> {tid}: {t.get('description', '')[:50]} | Owner: {t.get('owner', '')} | Status: {t.get('status', '')} | Start: {t.get('start_time', '')} | End: {t.get('end_time', '')}")
