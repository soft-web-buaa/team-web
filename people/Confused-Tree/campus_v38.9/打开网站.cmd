@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:8901/
node serve.mjs 8901
pause
