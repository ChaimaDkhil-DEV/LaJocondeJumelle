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

    REM La fenetre PostgreSQL herite de DEV_DB_PORT=5433 (defini plus haut).
    start "LaJocondeJumelle - PostgreSQL" cmd /k "cd /d ""%~dp0"" && npm run -w backend db:dev"

    echo Attente du demarrage de PostgreSQL...
)

:WAIT_POSTGRES

REM Attendre que le port 5433 accepte les connexions (essai d'une seconde)
powershell -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { if ($c.ConnectAsync('127.0.0.1', 5433).Wait(1000)) { exit 0 } else { exit 1 } } catch { exit 1 } finally { $c.Dispose() }" >nul 2>&1

if not errorlevel 1 goto DB_READY

set /a RETRY_COUNT+=1

if !RETRY_COUNT! GEQ %MAX_RETRIES% (
    echo.
    echo ERREUR : PostgreSQL ne repond pas sur le port 5433 apres %MAX_RETRIES% tentatives.
    echo Verifiez la fenetre PostgreSQL et les logs.
    pause
    exit /b 1
)

echo Attente de PostgreSQL... tentative !RETRY_COUNT!/%MAX_RETRIES%
timeout /t 2 /nobreak >nul
goto WAIT_POSTGRES

:DB_READY

echo PostgreSQL repond. Application des migrations...

REM Une seule tentative, sortie visible : une migration en echec doit etre lisible.
call npm run -w backend prisma:deploy

if errorlevel 1 (
    echo.
    echo ERREUR : echec des migrations Prisma ^(voir le message ci-dessus^).
    pause
    exit /b 1
)

echo Migrations appliquees.

echo.
echo [2/3] Verification du backend...

powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 3002 -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1

if not errorlevel 1 (
    echo Le port 3002 est deja utilise.
    echo Verifiez si le backend fonctionne deja.
    pause
    exit /b 1
)

echo Port 3002 libre.

echo.
echo [3/3] Demarrage du backend et du frontend...

call npm run dev

echo.
echo L'application est arretee.
pause
