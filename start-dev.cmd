@echo off
rem Starts PLUG EV (API, ngrok, admin portal). Options: -NoNgrok -NoBrowser -ChargerId c1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" %*
if "%~1"=="" pause
