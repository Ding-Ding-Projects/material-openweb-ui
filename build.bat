@echo off
REM ============================================================================
REM  Material Open WebUI - one-click build.
REM
REM  Takes a checkout on a machine with nothing installed and gets it to a built,
REM  runnable program. It obtains its own toolchain; it never asks you to install
REM  something by hand and come back.
REM
REM    build.bat            interactive: builds, then asks whether to run
REM    build.bat /s         silent: no prompts, no pauses, non-zero on failure
REM    build.bat --silent   same
REM    set SILENT=1         same
REM
REM  The work happens in scripts\build.ps1. cmd's parser processes a caret twice
REM  inside a parenthesised block, and the "Unbalanced parenthesis" it produces
REM  reorders control flow instead of stopping - which is how a build script ends
REM  up running its install step before the toolchain it needs is ready.
REM
REM  -ExecutionPolicy Bypass applies to this process only. The machine's
REM  persistent execution policy is never changed, and no secret, credential or
REM  code-signing certificate is ever installed: releases here are permanently
REM  unsigned by policy.
REM ============================================================================

setlocal
set "SILENT_FLAG="
if /i "%~1"=="/s" set "SILENT_FLAG=-Silent"
if /i "%~1"=="-s" set "SILENT_FLAG=-Silent"
if /i "%~1"=="--silent" set "SILENT_FLAG=-Silent"

where pwsh >nul 2>&1
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" %SILENT_FLAG%
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" %SILENT_FLAG%
)
exit /b %ERRORLEVEL%
