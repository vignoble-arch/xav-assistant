@echo off
setlocal

cd /d "%~dp0"

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js est introuvable. Installe Node.js ou lance depuis Codex.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

echo Assistant Xavier : http://127.0.0.1:4173
echo Garde cette fenetre ouverte pendant que tu utilises l'app.
"%NODE_EXE%" server.js

echo.
echo Le serveur s'est arrete.
pause
