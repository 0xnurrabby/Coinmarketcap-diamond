@echo off
cd /d "%~dp0"
if exist "DiamondClaim-CookieTool.exe" (
  start "" "DiamondClaim-CookieTool.exe"
) else if exist "dist\DiamondClaim-CookieTool.exe" (
  start "" "dist\DiamondClaim-CookieTool.exe"
) else (
  echo EXE not built yet. Run: build.ps1
  pause
)
