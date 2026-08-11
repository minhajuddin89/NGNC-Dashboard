# Ping Monitor Installer Script
$AppName = "Ping Monitor"
$InstallDir = Join-Path $env:LOCALAPPDATA "PingMonitor"
$ExeName = "ping-monitor.exe"
$SourceExe = Join-Path $PSScriptRoot $ExeName

# 1. Create Installation Directory
if (-not (Test-Path $InstallDir)) {
    New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
}

# 1.5 Terminate any running instances of ping-monitor to release file locks
Stop-Process -Name "ping-monitor" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# 2. Copy Executable
if (Test-Path $SourceExe) {
    try {
        Copy-Item -Path $SourceExe -Destination $InstallDir -Force -ErrorAction Stop
    } catch {
        [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null
        [System.Windows.Forms.MessageBox]::Show("Installation failed because the file is locked by another process.`n`nPlease close any running instances of Ping Monitor and try again.", "Installation Failed", 0, 16)
        Exit
    }
} else {
    [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null
    [System.Windows.Forms.MessageBox]::Show("Error: ping-monitor.exe not found in the installer directory.`n`nPlease make sure both install.bat and ping-monitor.exe are in the same folder.", "Installation Failed", 0, 16)
    Exit
}

$TargetExe = Join-Path $InstallDir $ExeName

# 2.5 Create run.vbs wrapper for silent execution (no console window)
$VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "$TargetExe" & chr(34), 0, False
"@
Set-Content -Path (Join-Path $InstallDir "run.vbs") -Value $VbsContent -Force

# 3. Create Desktop Shortcut (runs via wscript.exe to hide console, using the .exe icon)
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$Shortcut = $WshShell.CreateShortcut((Join-Path $DesktopPath "$AppName.lnk"))
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$InstallDir\run.vbs`""
$Shortcut.IconLocation = "$TargetExe,0"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Description = "Real-time Network Diagnostics & Ping Monitor"
$Shortcut.Save()

# 4. Create Start Menu Shortcut
$StartMenuPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)
$StartMenuShortcut = $WshShell.CreateShortcut((Join-Path $StartMenuPath "$AppName.lnk"))
$StartMenuShortcut.TargetPath = "wscript.exe"
$StartMenuShortcut.Arguments = "`"$InstallDir\run.vbs`""
$StartMenuShortcut.IconLocation = "$TargetExe,0"
$StartMenuShortcut.WorkingDirectory = $InstallDir
$StartMenuShortcut.Description = "Real-time Network Diagnostics & Ping Monitor"
$StartMenuShortcut.Save()

# 5. Create Uninstaller in Registry (HKCU - no Admin rights needed!)
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PingMonitor"
if (-not (Test-Path $UninstallKey)) {
    New-Item -Path $UninstallKey -Force | Out-Null
}
Set-ItemProperty -Path $UninstallKey -Name "DisplayName" -Value $AppName
Set-ItemProperty -Path $UninstallKey -Name "DisplayVersion" -Value "1.0.0"
Set-ItemProperty -Path $UninstallKey -Name "Publisher" -Value "Antigravity Team"
Set-ItemProperty -Path $UninstallKey -Name "DisplayIcon" -Value $TargetExe

# Create a clean uninstall command
$UninstallCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"Remove-Item -Path '$InstallDir' -Recurse -Force; Remove-Item -Path (Join-Path ([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)) '$AppName.lnk') -Force; Remove-Item -Path (Join-Path ([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)) '$AppName.lnk') -Force; Remove-Item -Path '$UninstallKey' -Force; [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Ping Monitor has been successfully uninstalled.', 'Uninstall Complete', 0, 64)`""

Set-ItemProperty -Path $UninstallKey -Name "UninstallString" -Value $UninstallCmd

# Show success message box
[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null
[System.Windows.Forms.MessageBox]::Show("Ping Monitor has been installed successfully!`n`nShortcuts have been created on your Desktop and Start Menu.", "Installation Complete", 0, 64)
