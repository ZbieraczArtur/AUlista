@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  start "Krzywa — lokalny serwer" /min py -m http.server 8000
  goto open_page
)
where python >nul 2>nul
if not errorlevel 1 (
  start "Krzywa — lokalny serwer" /min python -m http.server 8000
  goto open_page
)
echo Nie znaleziono Python 3.
echo Zainstaluj Python 3 albo uruchom Live Server z Visual Studio Code.
pause
exit /b 1

:open_page
timeout /t 2 /nobreak >nul
start "" http://localhost:8000/
echo Serwer dziala pod adresem http://localhost:8000/
echo Zatrzymaj go, zamykajac okno serwera Python.
