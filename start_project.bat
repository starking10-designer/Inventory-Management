@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"
set "BACKEND_VENV=%BACKEND_DIR%\venv"
if exist "%BACKEND_DIR%\.codex-venv\Scripts\activate.bat" (
  set "BACKEND_VENV=%BACKEND_DIR%\.codex-venv"
)
set "BACKEND_ACTIVATE=%BACKEND_VENV%\Scripts\activate.bat"

if not exist "%BACKEND_ACTIVATE%" (
  echo Backend virtual environment activation file was not found:
  echo %BACKEND_ACTIVATE%
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo Frontend package file was not found:
  echo %FRONTEND_DIR%\package.json
  pause
  exit /b 1
)

echo Starting Inventory Management...
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
echo.
echo Keep the Backend and Frontend windows open while using the app.

start "Inventory Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && call ""%BACKEND_ACTIVATE%"" && uvicorn app.main:app --reload"
start "Inventory Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev"

endlocal
