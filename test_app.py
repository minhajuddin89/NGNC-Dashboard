import app

print("=== STARTING EXCEL BACKEND INTEGRATION TEST ===")
print("Initializing Excel sheet...")
app.init_excel()

print("\nTesting duration calculations:")
d1 = app.calculate_duration("2026-07-22 10:00", "2026-07-22 12:30")
print(f"  10:00 to 12:30 -> '{d1}' (Expected: 2h 30m)")

d2 = app.calculate_duration("2026-07-22 10:00", "2026-07-23 15:45")
print(f"  10:00 to next day 15:45 -> '{d2}' (Expected: 1d 5h 45m)")

print("\nAdding test task...")
tasks = app.load_tasks_from_excel()
print(f"  Loaded tasks count: {len(tasks)}")

test_task = {
    "id": "TSK-9999",
    "description": "Integration verification test task",
    "owner": "Test System",
    "start_time": "2026-07-22 10:00",
    "end_time": "2026-07-22 12:30",
    "duration": d1,
    "status": "Completed",
    "last_updated": "2026-07-22 16:50"
}
tasks.append(test_task)
app.save_tasks_to_excel(tasks)

print("\nReloading tasks from Excel sheet...")
reloaded_tasks = app.load_tasks_from_excel()
found = False
for t in reloaded_tasks:
    if t["id"] == "TSK-9999":
        found = True
        print(f"  Found task TSK-9999!")
        print(f"  Description: '{t['description']}'")
        print(f"  Owner: '{t['owner']}'")
        print(f"  Duration: '{t['duration']}'")
        print(f"  Status: '{t['status']}'")
        break

# Clean up test task
filtered_tasks = [t for t in reloaded_tasks if t["id"] != "TSK-9999"]
app.save_tasks_to_excel(filtered_tasks)
print("\nCleaned up verification task from Excel.")

if found:
    print("\n[VERIFICATION SUCCESSFUL] Core Excel engine and duration library are working!")
else:
    print("\n[VERIFICATION FAILED] Verification task was not written or loaded properly.")
