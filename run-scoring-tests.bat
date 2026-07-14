@echo off
cd /d "%~dp0"
node --test tests\scoringEngine.strength.test.js tests\scoringEngine.decayTrust.test.js tests\scoringEngine.ranksIntegrity.test.js tests\scoringEngine.axes.test.js > scoring-test-output.txt 2>&1
echo EXITCODE=%ERRORLEVEL% >> scoring-test-output.txt
