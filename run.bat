@echo off
title Excel Task Manager
echo ===================================================
echo               EXCEL TASK MANAGER
echo ===================================================
echo.
echo [1/3] Checking dependencies...
python -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [WARNING] Some dependencies failed to install. Running server anyway...
) else (
    echo [SUCCESS] Dependencies checked and installed.
)
echo.
echo [2/3] Starting backend Flask server...
start "Task Manager Flask Server" /b python app.py
echo.
echo [3/3] Opening application in default browser...
ping 127.0.0.1 -n 3 > nul
start http://127.0.0.1:5050
echo.
echo ===================================================
echo  Server is running at http://127.0.0.1:5050
echo ===================================================
