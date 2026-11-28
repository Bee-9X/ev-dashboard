@echo off
rem Stops what start-dev.cmd started (API, admin portal, ngrok).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev.ps1"
if "%~1"=="" pause
