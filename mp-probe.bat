@echo off
cd /d "%~dp0"
echo === search AppData for the dataset === > mp-probe-output.txt
dir /b /s "C:\Users\jason\AppData\*riseforit_meal_data*" >> mp-probe-output.txt 2>&1
echo --- by upload hash --- >> mp-probe-output.txt
dir /b /s "C:\Users\jason\AppData\*3516492f*" >> mp-probe-output.txt 2>&1
echo --- claude-ish dirs --- >> mp-probe-output.txt
dir /b "C:\Users\jason\AppData\Local" ^| findstr /i "claude anthropic" >> mp-probe-output.txt 2>&1
dir /b "C:\Users\jason\AppData\Roaming" ^| findstr /i "claude anthropic" >> mp-probe-output.txt 2>&1
echo DONE >> mp-probe-output.txt
