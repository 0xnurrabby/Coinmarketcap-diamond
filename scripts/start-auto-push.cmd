@echo off
cd /d "%~dp0.."
start "DiamondClaim auto-push" /min node scripts\auto-push.mjs
