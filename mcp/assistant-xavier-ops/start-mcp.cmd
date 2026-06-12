@echo off
setlocal

set "PROJECT_DIR=%~dp0..\.."
set "SERVER=%~dp0server.js"
set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%CODEX_NODE%" (
  "%CODEX_NODE%" "%SERVER%"
  exit /b %ERRORLEVEL%
)

node "%SERVER%"
