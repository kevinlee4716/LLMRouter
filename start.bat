@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

rem ============================================================
rem  LLMRouter — 一键启动脚本 (Windows)
rem  用法:
rem    start.bat              → 交互菜单
rem    start.bat start        → 直接启动
rem    start.bat stop         → 停止服务
rem    start.bat restart      → 重启服务
rem    start.bat status       → 查看状态
rem ============================================================

set "SCRIPT_DIR=%~dp0"
set "PID_FILE=%SCRIPT_DIR%.llmrouter.pid"
set "LOG_FILE=%SCRIPT_DIR%llmrouter.log"

title LLMRouter 启动器

rem --- 查找 Node.js ---
set "NODE_BIN="
set "NPM_BIN="

where node >nul 2>&1
if %errorlevel% neq 0 (
    rem 尝试常见路径
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
        set "NPM_BIN=%ProgramFiles%\nodejs\npm.cmd"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
        set "NPM_BIN=%ProgramFiles(x86)%\nodejs\npm.cmd"
    ) else (
        echo [X] 未找到 Node.js。请先安装 Node.js ^(^>= 20.18.0^)
        echo     下载地址: https://nodejs.org ^(选择 LTS 版本^)
        pause
        exit /b 1
    )
) else (
    for /f "delims=" %%i in ('where node') do set "NODE_BIN=%%i"
    for /f "delims=" %%i in ('where npm') do set "NPM_BIN=%%i"
)

rem 检查版本
for /f "tokens=1 delims=v." %%a in ('"%NODE_BIN%" -v') do set "NODE_MAJOR=%%a"
if %NODE_MAJOR% lss 18 (
    echo [X] Node.js 版本过低 (需要 ^>= 20.18.0)
    echo     下载地址: https://nodejs.org
    pause
    exit /b 1
)

rem ============================================================
rem  Banner
rem ============================================================
:banner
echo.
echo   ╔══════════════════════════════════════╗
echo   ║         LLMRouter 启动器             ║
echo   ║   AI 模型网关 — 一键管理多厂商 API   ║
echo   ╚══════════════════════════════════════╝
echo.
goto :%1 2>nul || goto :menu

rem ============================================================
rem  交互菜单
rem ============================================================
:menu
echo   Node.js: "%NODE_BIN%" -v 2^>nul
echo.
echo   请选择操作:
echo.
echo   [1] 启动服务
echo   [2] 停止服务
echo   [3] 重启服务
echo   [4] 查看状态
echo   [5] 重新安装依赖
echo   [0] 退出
echo.
set /p "choice=  输入选项 [1]: "
if "%choice%"=="" set "choice=1"

if "%choice%"=="1" goto :start
if "%choice%"=="2" goto :stop
if "%choice%"=="3" goto :restart
if "%choice%"=="4" goto :status
if "%choice%"=="5" goto :reinstall
if "%choice%"=="0" goto :quit
echo   无效选项
pause
goto :menu

rem ============================================================
rem  安装依赖
rem ============================================================
:install_deps
if exist "%SCRIPT_DIR%node_modules\" (
    echo   [√] 依赖已就绪
    goto :eof
)

echo.
echo   [!] 首次运行 — 正在安装依赖 (约需 1-3 分钟，仅此一次)...
echo.
cd /d "%SCRIPT_DIR%"
call "%NPM_BIN%" install --prefer-offline --no-audit --no-fund
if %errorlevel% neq 0 (
    echo.
    echo   [X] 依赖安装失败，请检查网络连接后重试。
    pause
    exit /b 1
)
echo.
echo   [√] 依赖安装完成！
echo.
goto :eof

rem ============================================================
rem  生成 .env
rem ============================================================
:ensure_env
if exist "%SCRIPT_DIR%.env" (
    echo   [√] .env 已存在
    goto :eof
)

echo.
echo   [!] 未找到 .env 文件，正在自动生成...
rem 用 Node 生成随机密钥
for /f "delims=" %%k in ('"%NODE_BIN%" -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set "ENC_KEY=%%k"

(
echo # LLMRouter 环境配置
echo PORT=2210
echo ENCRYPTION_KEY=!ENC_KEY!
) > "%SCRIPT_DIR%.env"

echo   [√] .env 已自动生成
goto :eof

rem ============================================================
rem  显示地址
rem ============================================================
:show_urls
set "PORT=2210"
if exist "%SCRIPT_DIR%.env" (
    for /f "tokens=2 delims==" %%a in ('findstr "^PORT=" "%SCRIPT_DIR%.env" 2^>nul') do set "PORT=%%a"
)
if "%PORT%"=="" set "PORT=2210"
echo.
echo   访问地址:
echo     管理面板（前端）: http://localhost:10130
echo     后端 API 服务:    http://localhost:%PORT%
echo     API 端点:         http://localhost:%PORT%/v1/chat/completions
goto :eof

rem ============================================================
rem  停止服务
rem ============================================================
:stop
echo.
echo   [!] 正在停止 LLMRouter...

if exist "%PID_FILE%" (
    set /p "PID=" < "%PID_FILE%"
    taskkill /PID !PID! /F /T >nul 2>&1
    del "%PID_FILE%" >nul 2>&1
)

rem 兜底：按端口杀
for %%p in (2210 10130) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        taskkill /PID %%a /F >nul 2>&1
    )
)

echo   [√] LLMRouter 已停止
if "%1"=="stop" pause
goto :eof

rem ============================================================
rem  查看状态
rem ============================================================
:status
echo.
echo   LLMRouter 运行状态
echo   ────────────────────

set "found=0"
for %%p in (2210 10130) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        echo   端口 %%p: [运行中] PID: %%a
        set "found=1"
    )
)

if %found% equ 0 (
    echo   状态: [未运行]
)

call :show_urls
echo.
if "%1"=="status" pause
goto :eof

rem ============================================================
rem  启动服务
rem ============================================================
:start
call :install_deps
call :ensure_env

echo.
echo   [>] 正在启动 LLMRouter...

cd /d "%SCRIPT_DIR%"

rem 读取端口
for /f "tokens=2 delims==" %%a in ('findstr "^PORT=" "%SCRIPT_DIR%.env" 2^>nul') do set "PORT=%%a"
if "%PORT%"=="" set "PORT=2210"

rem 释放端口
for %%p in (%PORT% 10130) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        echo   [!] 端口 %%p 被占用 (PID: %%a^)，释放中...
        taskkill /PID %%a /F >nul 2>&1
    )
)

rem 用 start 打开新窗口运行
echo   [√] 服务将在新窗口中启动
echo   [√] 关闭新窗口即可停止服务
echo.

rem 打开浏览器（等待几秒，打开前端管理面板）
start "" cmd /c "timeout /t 2 >nul && start http://localhost:10130"

rem 在新 CMD 窗口中运行
start "LLMRouter" cmd /c "title LLMRouter - 运行中 ^(关闭此窗口停止服务^) && cd /d "%SCRIPT_DIR%" && "%NPM_BIN%" run dev"

echo   [√] 已启动！等待几秒后浏览器会自动打开管理面板。
echo.
echo   提示:
echo     - 关闭弹出的命令行窗口即可停止服务
echo     - 或运行: start.bat stop
echo.
pause
goto :eof

rem ============================================================
rem  重启
rem ============================================================
:restart
call :stop
timeout /t 2 >nul
call :start
goto :eof

rem ============================================================
rem  重新安装依赖
rem ============================================================
:reinstall
echo.
echo   [!] 正在清理并重新安装依赖...
if exist "%SCRIPT_DIR%node_modules" (
    rmdir /s /q "%SCRIPT_DIR%node_modules"
)
call :install_deps
echo   [√] 完成！
pause
goto :menu

rem ============================================================
rem  退出
rem ============================================================
:quit
echo.
echo   再见！
timeout /t 1 >nul
exit /b 0
