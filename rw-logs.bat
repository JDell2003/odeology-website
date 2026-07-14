@echo off
cd /d "%~dp0"
node railway-ctl.js logs > rw-out.txt 2>&1
