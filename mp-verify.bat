@echo off
cd /d "%~dp0"
echo === Phase 0: assemble dataset from parts === > mp-verify-output.txt
node mp-assemble.js >> mp-verify-output.txt 2>&1
echo === Module load === >> mp-verify-output.txt
node -e "const c=require('./core/mealProgramConstants');const e=require('./core/mealProgramEngine');console.log('modules load OK, constants v'+c.version);" >> mp-verify-output.txt 2>&1
echo === Phase 5: node --test === >> mp-verify-output.txt
node --test tests\mealProgram.engine.test.js >> mp-verify-output.txt 2>&1
echo EXITCODE=%ERRORLEVEL% >> mp-verify-output.txt
