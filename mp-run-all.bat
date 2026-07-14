@echo off
rem One-click runner: verify (dataset copy + re-parse + node --test), then commit+push only if tests pass.
cd /d "%~dp0"
call mp-verify.bat
findstr /C:"EXITCODE=0" mp-verify-output.txt > nul
if %ERRORLEVEL%==0 (
    echo Tests green - committing...
    call mp-git.bat
) else (
    echo Tests FAILED or did not run - skipping git. See mp-verify-output.txt.
)
