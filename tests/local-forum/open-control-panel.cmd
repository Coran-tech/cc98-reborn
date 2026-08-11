@echo off
start "" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0control-panel.ps1"
