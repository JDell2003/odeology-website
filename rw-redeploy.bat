@echo off
cd /d "%~dp0"
node railway-ctl.js redeploy > rw-out.txt 2>&1
