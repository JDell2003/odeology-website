@echo off
cd /d "%~dp0"
echo === npm install === > mp-npm-output.txt
call npm install --no-audit --no-fund >> mp-npm-output.txt 2>&1
echo NPM_EXITCODE=%ERRORLEVEL% >> mp-npm-output.txt
node -e "console.log('puppeteer resolvable:', !!require.resolve('puppeteer'))" >> mp-npm-output.txt 2>&1
echo DONE >> mp-npm-output.txt
