#!/bin/bash
# ============================================================
#  LLMRouter — 一键启动脚本 (macOS / Linux)
#  用法:
#    ./start.sh              → 交互菜单
#    ./start.sh start        → 直接启动
#    ./start.sh stop         → 停止服务
#    ./start.sh restart      → 重启服务
#    ./start.sh status       → 查看状态
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.llmrouter.pid"
LOG_FILE="$SCRIPT_DIR/llmrouter.log"
NODE_BIN=""
NPM_BIN=""

# --- 颜色 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Banner ---
banner() {
  echo ""
  echo -e "${CYAN}${BOLD}  ╔══════════════════════════════════════╗${NC}"
  echo -e "${CYAN}${BOLD}  ║         LLMRouter 启动器             ║${NC}"
  echo -e "${CYAN}${BOLD}  ║   AI 模型网关 — 一键管理多厂商 API   ║${NC}"
  echo -e "${CYAN}${BOLD}  ╚══════════════════════════════════════╝${NC}"
  echo ""
}

# --- 查找 Node.js ---
find_node() {
  # 优先找 nvm / fnm 管理的版本
  if [ -n "$NVM_DIR" ] && [ -f "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh" 2>/dev/null || true
  fi
  NODE_BIN=$(command -v node 2>/dev/null || echo "")
  NPM_BIN=$(command -v npm 2>/dev/null || echo "")

  if [ -z "$NODE_BIN" ]; then
    echo -e "${RED}✗ 未找到 Node.js。请先安装 Node.js (>= 20.18.0)${NC}"
    echo -e "${YELLOW}  下载地址: https://nodejs.org (选择 LTS 版本)${NC}"
    exit 1
  fi

  # 检查版本
  local version=$("$NODE_BIN" -v | sed 's/v//' | cut -d. -f1)
  if [ "$version" -lt 20 ]; then
    echo -e "${RED}✗ Node.js 版本过低 (当前: $("$NODE_BIN" -v))，需要 >= 20.18.0${NC}"
    echo -e "${YELLOW}  下载地址: https://nodejs.org${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} Node.js $("$NODE_BIN" -v) | npm $("$NPM_BIN" -v)"
}

# --- 检查/安装依赖 ---
install_deps() {
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo ""
    echo -e "${YELLOW}${BOLD}  ⏳ 首次运行 — 正在安装依赖（约需 1-3 分钟，仅此一次）...${NC}"
    echo ""
    cd "$SCRIPT_DIR"
    "$NPM_BIN" install --prefer-offline --no-audit --no-fund 2>&1 | while IFS= read -r line; do
      echo "    $line"
    done
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
      echo -e "${RED}✗ 依赖安装失败，请检查网络连接后重试。${NC}"
      exit 1
    fi
    echo ""
    echo -e "${GREEN}  ✓ 依赖安装完成！${NC}"
    echo ""
  else
    echo -e "${GREEN}  ✓${NC} 依赖已就绪"
  fi
}

# --- 检查/生成 .env ---
ensure_env() {
  if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo ""
    echo -e "${YELLOW}  ⏳ 未找到 .env 文件，正在自动生成...${NC}"
    local enc_key=$("$NODE_BIN" -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    cat > "$SCRIPT_DIR/.env" <<EOF
# LLMRouter 环境配置
PORT=2210
ENCRYPTION_KEY=$enc_key
EOF
    echo -e "${GREEN}  ✓ .env 已自动生成${NC}"
  else
    echo -e "${GREEN}  ✓${NC} .env 已存在"
  fi
}

# --- 停止服务 ---
stop_service() {
  echo ""
  echo -e "${YELLOW}  ⏳ 正在停止 LLMRouter...${NC}"

  # 按 PID 文件杀
  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      # 发 SIGTERM 给进程组
      kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 -"$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi

  # 兜底：按端口杀
  for port in 2210 10130; do
    local pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done

  echo -e "${GREEN}  ✓ LLMRouter 已停止${NC}"
  echo ""
}

# --- 查看状态 ---
show_status() {
  echo ""
  echo -e "${BOLD}  LLMRouter 运行状态${NC}"
  echo "  ────────────────────"

  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "  状态: ${GREEN}运行中${NC} (PID: $pid)"
      # 检测端口
      for port in 2210 10130; do
        if lsof -ti :$port >/dev/null 2>&1; then
          echo -e "  端口 $port: ${GREEN}监听中${NC}"
        else
          echo -e "  端口 $port: ${RED}未监听${NC}"
        fi
      done
    else
      echo -e "  状态: ${RED}已停止${NC} (PID 文件残留)"
    fi
  else
    # 没有 PID 文件，检查端口
    local found=false
    for port in 2210 10130; do
      if lsof -ti :$port >/dev/null 2>&1; then
        echo -e "  状态: ${YELLOW}部分运行${NC} (端口 $port 被占用)"
        found=true
      fi
    done
    if [ "$found" = false ]; then
      echo -e "  状态: ${RED}未运行${NC}"
    fi
  fi

  show_urls
  echo ""
}

# --- 显示访问地址 ---
show_urls() {
  local port="${PORT:-2210}"
  echo ""
  echo -e "  ${BOLD}访问地址:${NC}"
  echo -e "    管理面板（前端）: ${BLUE}http://localhost:10130${NC}"
  echo -e "    后端 API 服务:    ${BLUE}http://localhost:$port${NC}"
  echo -e "    API 端点:         ${BLUE}http://localhost:$port/v1/chat/completions${NC}"
}

# --- 启动服务 ---
start_service() {
  echo ""
  echo -e "${BLUE}${BOLD}  🚀 正在启动 LLMRouter...${NC}"
  echo ""

  cd "$SCRIPT_DIR"

  # 读取端口
  if [ -f "$SCRIPT_DIR/.env" ]; then
    PORT=$(grep -E '^PORT=' "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo "2210")
  fi
  PORT="${PORT:-2210}"

  # 端口冲突检测
  for p in "$PORT" 10130; do
    if lsof -ti :$p >/dev/null 2>&1; then
      echo -e "${YELLOW}  ⚠ 端口 $p 已被占用，尝试释放...${NC}"
      lsof -ti :$p | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
  done

  # 启动（前台运行，Ctrl+C 退出）
  echo -e "  ${CYAN}提示: 按 Ctrl+C 可安全退出${NC}"
  echo ""

  # 启动进程组，方便 Ctrl+C 时全部退出
  set +e
  "$NPM_BIN" run dev 2>&1 | while IFS= read -r line; do
    echo "  $line"
    # 检测 setup code
    if echo "$line" | grep -q "Setup code:"; then
      echo ""
      echo -e "${YELLOW}${BOLD}  ⚡ 首次设置码已显示在上方${NC}"
    fi
    # 检测服务启动完成
    if echo "$line" | grep -q "server.*ready\|listening on\|Local:"; then
      echo ""
      show_urls
    fi
  done &
  local main_pid=$!

  # 记录 PID
  echo $main_pid > "$PID_FILE"

  # 等待进程结束（用户 Ctrl+C 或异常退出）
  wait $main_pid 2>/dev/null
  local exit_code=$?

  rm -f "$PID_FILE"

  if [ $exit_code -ne 0 ] && [ $exit_code -ne 130 ]; then
    echo ""
    echo -e "${RED}✗ 服务异常退出 (code: $exit_code)${NC}"
  fi

  echo ""
  echo -e "${YELLOW}  👋 LLMRouter 已退出${NC}"
}

# --- 交互菜单 ---
interactive_menu() {
  banner

  echo -e "  ${BOLD}请选择操作:${NC}"
  echo ""
  echo -e "  ${GREEN}[1]${NC} 启动服务"
  echo -e "  ${GREEN}[2]${NC} 停止服务"
  echo -e "  ${GREEN}[3]${NC} 重启服务"
  echo -e "  ${GREEN}[4]${NC} 查看状态"
  echo -e "  ${GREEN}[5]${NC} 重新安装依赖"
  echo -e "  ${GREEN}[0]${NC} 退出"
  echo ""
  read -r -p "  输入选项 [1]: " choice
  choice="${choice:-1}"

  case $choice in
    1) start_service ;;
    2) stop_service ;;
    3)
      stop_service
      sleep 1
      start_service
      ;;
    4) show_status ;;
    5)
      echo ""
      echo -e "${YELLOW}  正在清理并重新安装依赖...${NC}"
      rm -rf "$SCRIPT_DIR/node_modules"
      install_deps
      ;;
    0)
      echo ""
      echo -e "${YELLOW}  👋 再见！${NC}"
      exit 0
      ;;
    *)
      echo -e "${RED}  无效选项${NC}"
      exit 1
      ;;
  esac
}

# ============================================================
#  主入口
# ============================================================

# 确保在项目根目录
cd "$SCRIPT_DIR"

# 查找 node
find_node

# 处理命令行参数
CMD="${1:-menu}"

case "$CMD" in
  start)
    banner
    install_deps
    ensure_env
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service
    sleep 1
    install_deps
    ensure_env
    start_service
    ;;
  status)
    show_status
    ;;
  menu|"")
    interactive_menu
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status}"
    echo ""
    echo "  start    启动服务"
    echo "  stop     停止服务"
    echo "  restart  重启服务"
    echo "  status   查看状态"
    echo "  (无参数) 交互菜单"
    exit 1
    ;;
esac
