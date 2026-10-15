@echo off
setlocal
title LaJocondeJumelle - Demarrage

cd /d "%~dp0"

echo.
echo ==========================================
echo       LaJocondeJumelle
echo ==========================================
echo.

REM Charger le port attendu par le projet
REM Ne pas heriter du PORT du terminal parent
set "PORT="
set "DEV_DB_PORT=5433"

echo [1/3] Verification de PostgreSQL...

powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 5433 -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1

if not errorlevel 1 (
    echo PostgreSQL est deja disponible sur le port 5433.
) else (
    echo Demarrage de PostgreSQL embarque...
    start "LaJocondeJumelle - PostgreSQL" cmd /k "cd /d ""%~dp0"" && npm run -w backend db:dev"

    set "DB_READY="
    for /L %%i in (1,1,30) do (
        powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 5433 -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1
        if not errorlevel 1 (
            set "DB_READY=1"
            goto DB_CHECK
        )
        timeout /t 2 /nobreak >nul
    )

    echo ERREUR : PostgreSQL ne repond pas sur le port 5433.
    echo Consultez la fenetre PostgreSQL avant de reessayer.
    pause
    exit /b 1
)

:DB_CHECK
echo PostgreSQL est pret.
echo.

echo [2/3] Verification du backend...

powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 3002 -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1

if not errorlevel 1 (
    echo Le port 3002 est deja utilise.
    echo Verifiez si le backend fonctionne deja.
    pause
    exit /b 1
)

echo [3/3] Demarrage du backend et du frontend...
call npm run dev

echo.
echo L'application est arretee.
pause
