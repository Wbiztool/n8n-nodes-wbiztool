#!/bin/bash

# WbizTool n8n Nodes - Development Startup Script
# This script starts n8n with your custom WbizTool nodes loaded

echo "🚀 Starting n8n with WbizTool custom nodes..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Clean and rebuild
echo "🧹 Cleaning previous build..."
rm -rf dist/*.tsbuildinfo

# Build the nodes first
echo "📦 Building nodes..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    
    # Verify files exist
    if [ -f "dist/credentials/WbizToolApi.credentials.js" ] && [ -f "dist/nodes/WbizTool/WbizToolSendMessage.node.js" ]; then
        echo "✅ Node files verified"
    else
        echo "❌ Node files missing - build may have failed"
        exit 1
    fi
    
    echo "🔧 Starting n8n with custom extensions..."
    echo "📍 Custom nodes path: $SCRIPT_DIR"
    echo "🌐 n8n will be available at: http://localhost:5678"
    echo ""
    echo "🔍 Look for 'WbizTool' in the node panel on the left"
    echo "💡 To stop n8n, press Ctrl+C"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Export and start n8n with better error handling
    export N8N_CUSTOM_EXTENSIONS="$SCRIPT_DIR"
    echo "🔑 N8N_CUSTOM_EXTENSIONS set to: $N8N_CUSTOM_EXTENSIONS"
    echo ""
    
    n8n start
else
    echo "❌ Build failed! Please check the errors above."
    exit 1
fi 