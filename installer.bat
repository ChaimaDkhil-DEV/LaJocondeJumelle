```bat
@echo off
setlocal
title Installation - LaJocondeJumelle

cd /d "%~dp0"

echo ==========================================
echo   Installation de LaJocondeJumelle
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERREUR : Installez Node.js avant de continuer.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo ERREUR : package.json introuvable.
    echo Placez ce fichier a la racine du projet.
    pause
    exit /b 1
)

echo [1/4] Installation des dependances...
call npm install
if errorlevel 1 goto erreur

echo.
echo [2/4] Verification de la configuration...
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo Fichier backend\.env cree.
        echo Configurez SESSION_SECRET et DATABASE_URL.
        notepad "backend\.env"
        echo.
        echo Relancez installer.bat apres configuration.
        pause
        exit /b 0
    ) else (
        echo ERREUR : backend\.env.example introuvable.
        goto erreur
    )
)

echo.
echo [3/4] Demarrage de PostgreSQL embarque...
start "LaJocondeJumelle - PostgreSQL" cmd /k "cd /d ""%~dp0"" && npm run -w backend db:dev"

echo Attente du demarrage de la base...
timeout /t 8 /nobreak >nul

echo.
echo [4/4] Application des migrations...
call npm run -w backend prisma:migrate
if errorlevel 1 goto erreur

echo.
echo Installation terminee.
echo.
echo Pour lancer l'application, executez votre fichier
echo de demarrage habituel.
echo.
echo Sur une base neuve, lancez aussi une seule fois :
echo npm run -w backend prisma:seed
echo.
pause
exit /b 0

:erreur
echo.
echo Une erreur est survenue pendant l'installation.
echo Consultez les messages precedents.
pause
exit /b 1
```