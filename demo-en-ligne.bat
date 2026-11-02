@echo off
title LaJocondeJumelle - Demonstration en ligne
cd /d "%~dp0"
REM Publie l'application de ce poste en HTTPS via un Quick Tunnel Cloudflare (gratuit, sans compte).
REM Le poste doit rester allume ; l'adresse change a chaque lancement. Ctrl+C pour arreter.
call npm run -w backend demo:en-ligne
pause
