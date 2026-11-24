@echo off
chcp 65001 >nul
rem 听见校园：双击这个文件就能打开网页。窗口别关，关了网页就停。
cd /d "%~dp0"
if not exist node_modules (
  echo 第一次运行，正在安装依赖，大约一分钟……
  call npm install --no-audit --no-fund
)
if not exist dist\index.html (
  echo 正在构建页面……
  call npm run build
)
start "" http://127.0.0.1:8790/?screen=1
node server\serve.mjs --port 8790
pause
