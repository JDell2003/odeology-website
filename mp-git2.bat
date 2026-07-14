@echo off
cd /d "%~dp0"
echo === fix commit === > mp-git-output.txt
git add "data/riseforit_meal_data.json" "MEALPROGRAM_CHANGELOG.md" >> mp-git-output.txt 2>&1
git commit -m "fix(mealprogram): restore dataset byte-exact from source upload" >> mp-git-output.txt 2>&1
git push origin main >> mp-git-output.txt 2>&1
echo PUSH_EXITCODE=%ERRORLEVEL% >> mp-git-output.txt
git log --oneline -3 >> mp-git-output.txt 2>&1
echo === railway deploy status === >> mp-git-output.txt
node railway-ctl.js logs >> mp-git-output.txt 2>&1
echo DONE >> mp-git-output.txt
