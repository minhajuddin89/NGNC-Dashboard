import struct
import zlib
import os

exe = 'VLAN Search.exe'
with open(exe, 'rb') as f:
    data = f.read()

magic = b'MEI\x0c\x0b\x0a\x0b'
pos = data.find(magic)
if pos == -1:
    print("MEI magic not found")
    exit(1)

# PyInstaller header unpacking
# In PyInstaller, the header is at pos
magic, pkg_len, toc_offset, toc_len, pyver, pylib = struct.unpack('!8siiii64s', data[pos:pos+88])
print(f"Header: pkg_len={pkg_len}, toc_offset={toc_offset}, toc_len={toc_len}, pyver={pyver}")

# In PyInstaller, cookie is at the end, base of archive is (pos - pkg_len)
base = pos - pkg_len
toc_start = base + toc_offset
toc_data = data[toc_start : toc_start + toc_len]

out_dir = "extracted_vlan_search"
os.makedirs(out_dir, exist_ok=True)

# Parse TOC entries:
# Entry format: entry_len (4), dpos (4), dlen (4), ulen (4), cmflag (1), typeflag (1), name (null-terminated)
cur = 0
entries = []
while cur < len(toc_data):
    entry_len, = struct.unpack('!i', toc_data[cur:cur+4])
    dpos, dlen, ulen, cmflag, typeflag = struct.unpack('!iiiBB', toc_data[cur+4:cur+18])
    name = toc_data[cur+18 : cur+entry_len].rstrip(b'\x00').decode('utf-8', errors='ignore')
    entries.append({
        'name': name,
        'dpos': dpos,
        'dlen': dlen,
        'ulen': ulen,
        'cmflag': cmflag,
        'typeflag': typeflag
    })
    cur += entry_len

print(f"Total TOC entries found: {len(entries)}")
for entry in entries:
    name = entry['name']
    # If not a standard library .pyd or dll, print it
    if not (name.endswith('.pyd') or name.endswith('.dll') or name.startswith('tcl') or name.startswith('tk')):
        print(f"Entry: {name} (type: {entry['typeflag']}, len: {entry['dlen']})")
    
    # Extract file
    raw = data[base + entry['dpos'] : base + entry['dpos'] + entry['dlen']]
    if entry['cmflag'] == 1:
        try:
            content = zlib.decompress(raw)
        except Exception:
            content = raw
    else:
        content = raw
        
    out_path = os.path.join(out_dir, name.replace('/', os.sep).replace('\\', os.sep))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'wb') as out_f:
        out_f.write(content)

print(f"Extraction complete to {out_dir}/")
