@echo off
cd /d "%~dp0"
node railway-ctl.js apply > rw-out.txt 2>&1
