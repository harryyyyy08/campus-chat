@echo off
:: Start Apache and MySQL as Windows Services
net start Apache2.4
net start mysql

:: Wait for services to initialize
timeout /t 3 /nobreak > nul

:: Restore PM2 processes (campus-chat)
call "C:\Users\carlh\AppData\Roaming\npm\pm2.cmd" resurrect
