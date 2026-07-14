@echo off
cd /d "%~dp0"
echo === onboarding mapping tests === > mp-e2e-run.txt
node --test tests\mealProgram.onboarding.test.js tests\mealProgram.engine.test.js >> mp-e2e-run.txt 2>&1
echo UNIT_EXITCODE=%ERRORLEVEL% >> mp-e2e-run.txt
echo === e2e === >> mp-e2e-run.txt
node mp-e2e.js >> mp-e2e-run.txt 2>&1
echo E2E_EXITCODE=%ERRORLEVEL% >> mp-e2e-run.txt
echo DONE >> mp-e2e-run.txt
