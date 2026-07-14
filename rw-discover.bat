@echo off
cd /d "%~dp0"
node railway-ctl.js discover > rw-out.txt 2>&1
