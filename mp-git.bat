@echo off
cd /d "%~dp0"
rmdir /s /q "data\_parts" 2>nul
echo === pre-state === > mp-git-output.txt
git log --oneline -5 >> mp-git-output.txt 2>&1
git status --short >> mp-git-output.txt 2>&1

echo === phase 0 === >> mp-git-output.txt
git add "docs/RiseForIt_MealProgram_WorkOrder.md" "docs/RiseForIt_MealProgram_Discovery_ANSWERED.md" "data/riseforit_meal_data.json" "js/meal-program-data.js" "MEALPROGRAM_CHANGELOG.md" >> mp-git-output.txt 2>&1
git commit -m "feat(mealprogram): phase 0 data wiring" >> mp-git-output.txt 2>&1

echo === phase 1 === >> mp-git-output.txt
git add "meal-program.html" "css/meal-program.css" "js/meal-program.js" >> mp-git-output.txt 2>&1
git commit -m "feat(mealprogram): phase 1 picture picker" >> mp-git-output.txt 2>&1

echo === phase 2 === >> mp-git-output.txt
git add "js/meal-program-questions.js" >> mp-git-output.txt 2>&1
git commit -m "feat(mealprogram): phase 2 questions" >> mp-git-output.txt 2>&1

echo === phase 3 === >> mp-git-output.txt
git add "core/mealProgramConstants.js" "core/mealProgramEngine.js" >> mp-git-output.txt 2>&1
git commit -m "feat(mealprogram): phase 3 engine + constants" >> mp-git-output.txt 2>&1

echo === phase 4 === >> mp-git-output.txt
git add "js/meal-program-plan.js" >> mp-git-output.txt 2>&1
git commit -m "feat(mealprogram): phase 4 output" >> mp-git-output.txt 2>&1

echo === phase 5 === >> mp-git-output.txt
git add "tests/mealProgram.engine.test.js" >> mp-git-output.txt 2>&1
git commit -m "test(mealprogram): engine coverage" >> mp-git-output.txt 2>&1

echo === result === >> mp-git-output.txt
git log --oneline -8 >> mp-git-output.txt 2>&1
git push origin main >> mp-git-output.txt 2>&1
echo PUSH_EXITCODE=%ERRORLEVEL% >> mp-git-output.txt
git status --short >> mp-git-output.txt 2>&1
