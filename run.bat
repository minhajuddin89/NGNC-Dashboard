@echo off
title Excel Task Manager
echo ===================================================
echo               EXCEL TASK MANAGER
echo ===================================================
echo.

:: Ensure Python 3.12 and Scripts are in PATH
set "PATH=%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%PATH%"

:: Resolve Python executable
set "PYTHON_EXE=python"
if exist "%LocalAppData%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python312\python.exe"
)

echo [1/3] Checking dependencies...
"%PYTHON_EXE%" -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [WARNING] Some dependencies had warnings. Proceeding with launch...
) else (
    echo [SUCCESS] Dependencies verified.
)
echo.
echo [2/3] Starting backend Flask server on port 5050...
start "Task Manager Flask Server" /b "%PYTHON_EXE%" app.py
echo.
echo [3/3] Opening application in default browser...
ping 127.0.0.1 -n 4 > nul
start http://127.0.0.1:5050
echo.
echo ===================================================
echo  Server is running at http://127.0.0.1:5050
echo  Press Ctrl+C in this window or close it to stop.
echo ===================================================

