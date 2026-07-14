@echo off
cd /d "%~dp0"
echo === compare assembled vs original === > mp-restore-output.txt
fc /b "data\3516492f-riseforit_meal_data.json" "data\riseforit_meal_data.json" >> mp-restore-output.txt 2>&1
echo --- restoring original bytes --- >> mp-restore-output.txt
copy /Y "data\3516492f-riseforit_meal_data.json" "data\riseforit_meal_data.json" >> mp-restore-output.txt 2>&1
fc /b "data\3516492f-riseforit_meal_data.json" "data\riseforit_meal_data.json" > nul 2>&1
if %ERRORLEVEL%==0 (echo BYTE-EXACT: OK >> mp-restore-output.txt) else (echo BYTE-EXACT: FAILED >> mp-restore-output.txt)
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('data/riseforit_meal_data.json','utf8'));console.log('PARSED OK: meals='+d.meals.length,'ingredient_prices='+d.ingredient_prices.length,'states='+Object.keys(d.location_multipliers.states).length);" >> mp-restore-output.txt 2>&1
echo === re-run tests === >> mp-restore-output.txt
node --test tests\mealProgram.engine.test.js >> mp-restore-output.txt 2>&1
echo TEST_EXITCODE=%ERRORLEVEL% >> mp-restore-output.txt
del "data\3516492f-riseforit_meal_data.json" >> mp-restore-output.txt 2>&1
echo DONE >> mp-restore-output.txt
