#!/bin/bash

# FinanceFlow Landing - Deploy Script

echo "🚀 Desplegando FinanceFlow Landing..."
echo ""

cd "$(dirname "$0")"

if [ "$1" == "--preview" ]; then
    echo "📋 Modo: Preview"
    vercel
else
    echo "🌐 Modo: Produccion"
    vercel --prod
fi

echo ""
echo "✅ Listo!"
