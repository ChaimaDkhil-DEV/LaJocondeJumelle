
@echo off
setlocal EnableExtensions EnableDelayedExpansion
title LaJocondeJumelle - Demarrage

cd /d "%~dp0"
if errorlevel 1 (
    echo ERREUR : impossible d'acceder au dossier du projet.
    exit /b 1
)

echo.
echo ==========================================
echo       LaJocondeJumelle
echo ==========================================
echo.

REM Configuration des ports
REM Ne pas heriter du PORT du terminal parent
set "PORT="
set "DEV_DB_PORT=5433"

REM Configuration de l'attente PostgreSQL
set "MAX_RETRIES=60"
set "RETRY_COUNT=0"

echo [1/3] Verification de PostgreSQL...

REM Verification TCP initiale
powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 5433 -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1

if not errorlevel 1 (
    echo PostgreSQL repond deja sur le port 5433.
) else (
    echo Demarrage de PostgreSQL embarque...

    start "LaJocondeJumelle - PostgreSQL" cmd /k "cd /d ""%~dp0"" && set DEV_DB_PORT=5433 && npm run -w backend db:dev"

    echo Attente du demarrage de PostgreSQL...
)

:WAIT_POSTGRES

REM Verifier que PostgreSQL accepte reellement les connexions
call npm run -w backend prisma:deploy >nul 2>&1

if not errorlevel 1 (
    echo PostgreSQL est pret et les migrations sont appliquees.
    goto DB_READY
)

set /a RETRY_COUNT+=1

if !RETRY_COUNT! GEQ %MAX_RETRIES% (
    echo.
    echo ERREUR : PostgreSQL n'est pas pret apres %MAX_RETRIES% tentatives.
    echo Verifiez la fenetre PostgreSQL et les logs.
    pause
    exit /b 1
)

echo Attente de PostgreSQL... tentative !RETRY_COUNT!/%MAX_RETRIES%
timeout /t 2 /nobreak >nul
goto WAIT_POSTGRES

:DB_READY

echo.
echo [2/3] Verification du backend...

powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 3002 -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1

if not errorlevel 1 (
    echo Le port 3002 est deja utilise.
    echo Verifiez si le backend fonctionne deja.
    pause
    exit /b 1
)

echo Backend disponible pour le demarrage.

echo.
echo [3/3] Demarrage du backend et du frontend...

call npm run dev

echo.
echo L'application est arretee.
pause
