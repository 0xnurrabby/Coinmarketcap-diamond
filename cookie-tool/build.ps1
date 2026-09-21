$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Installing cookie-tool deps..."
npm install

Write-Host "Building portable EXE..."
npx pkg . --compress GZip -o dist/DiamondClaim-CookieTool.exe

# Portable folder
$portable = Join-Path $PSScriptRoot "portable"
New-Item -ItemType Directory -Force -Path $portable | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $portable "public") | Out-Null
Copy-Item "dist\DiamondClaim-CookieTool.exe" $portable -Force
Copy-Item "public\index.html" (Join-Path $portable "public\index.html") -Force

@"
DiamondClaim Cookie Tool (Portable)
===================================

1. Double-click DiamondClaim-CookieTool.exe
2. Chrome/Edge must be installed on the PC
3. Enter account name -> Login (browser opens)
4. Complete CMC login (2FA/captcha OK)
5. Click Capture session
6. Copy cookies OR Upload to website

Cookies saved under:
%LOCALAPPDATA%\DiamondClaimCookieTool\cookies\

No install needed. Copy this whole folder to any Windows PC.
"@ | Set-Content -Path (Join-Path $portable "README.txt") -Encoding UTF8

Write-Host ""
Write-Host "DONE: $portable\DiamondClaim-CookieTool.exe"
