@echo off
cd /d "%~dp0"
set "SRCDIR=C:\Users\jason\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\94d6046a-9a9c-4ea7-8be8-2865fad029bb\449d160c-21cd-463d-9367-0f9d2046d3f5\local_5a72d750-34e9-44a0-b45f-6311b62d01a9\uploads"
echo === attempt A: robocopy === > mp-copy2-output.txt
robocopy "%SRCDIR%" "D:\Jasons Web\data" "3516492f-riseforit_meal_data.json" /NJH /NJS >> mp-copy2-output.txt 2>&1
echo robocopy exit %ERRORLEVEL% >> mp-copy2-output.txt
echo === attempt B: powershell Copy-Item === >> mp-copy2-output.txt
powershell -NoProfile -Command "Copy-Item -LiteralPath '%SRCDIR%\3516492f-riseforit_meal_data.json' -Destination 'D:\Jasons Web\data\riseforit_meal_data.json' -Force" >> mp-copy2-output.txt 2>&1
echo === attempt C: long-path prefix === >> mp-copy2-output.txt
copy /Y "\\?\%SRCDIR%\3516492f-riseforit_meal_data.json" "D:\Jasons Web\data\riseforit_meal_data.json" >> mp-copy2-output.txt 2>&1
echo === attempt D: dir /x listing === >> mp-copy2-output.txt
dir /x "%SRCDIR%" >> mp-copy2-output.txt 2>&1
echo === result check === >> mp-copy2-output.txt
if exist "data\riseforit_meal_data.json" (
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('data/riseforit_meal_data.json','utf8'));console.log('PARSED OK: meals='+d.meals.length,'ingredient_prices='+d.ingredient_prices.length,'states='+Object.keys(d.location_multipliers.states).length);" >> mp-copy2-output.txt 2>&1
) else (
  echo dest still missing >> mp-copy2-output.txt
)
echo DONE >> mp-copy2-output.txt
