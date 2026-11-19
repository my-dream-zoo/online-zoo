@echo off
"C:\Users\User\tools\python\cpython-3.12.16-windows-x86_64-none\python.exe" "%~dp0export_content.py"
set "export_result=%errorlevel%"
pause
exit /b %export_result%
