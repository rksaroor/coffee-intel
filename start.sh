#!/bin/bash
# Coffee Intelligence — start all services
# Usage: ./start.sh

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="/Users/postgres/local/node/bin"
export PATH="$NODE_BIN:/Library/Frameworks/Python.framework/Versions/3.13/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

echo "=== Coffee Intelligence Karnataka ==="
echo ""
echo "Starting backend (FastAPI)..."
cd "$PROJECT_DIR/backend"
source venv/bin/activate
uvicorn main:app --reload &
BACKEND_PID=$!

echo "Starting frontend (Next.js)..."
cd "$PROJECT_DIR/frontend"
"$NODE_BIN/npm" run dev &
FRONTEND_PID=$!

echo ""
echo "Services started:"
echo "  Backend  → http://127.0.0.1:8000/prices"
echo "  Frontend → http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services."
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
