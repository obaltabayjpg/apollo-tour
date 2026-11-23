@echo off
chcp 65001 >nul
cd /d "%~dp0site"
echo Сайт: http://localhost:8000
echo 3D-тур: http://localhost:8000/tour/
echo Редактор тура: http://localhost:8000/tour/?edit=1
echo Закройте это окно, чтобы остановить сервер.
start "" "http://localhost:8000/"
python -m http.server 8000 || py -3 -m http.server 8000
