#!/bin/bash
# Quick start script for EUDI VP Debugger

echo "🚀 EUDI VP Debugger - Starting development environment"
echo ""
echo "Building core..."
npm run build:core

echo ""
echo "Starting API server on http://localhost:3001"
echo "Starting Web UI on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Run API and web in parallel
(cd api && npm run dev) &
API_PID=$!

(cd web && npm run dev) &
WEB_PID=$!

# Wait for both
wait $API_PID $WEB_PID
