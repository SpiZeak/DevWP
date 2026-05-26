#!/bin/bash

# Script to trust DevWP development certificates
# This uses mkcert to create and install a locally-trusted CA
# No browser warnings for *.test domains!

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERT_DIR="$PROJECT_ROOT/config/certs"

echo "🔒 DevWP Certificate Trust Setup"
echo "=================================="
echo ""

# Ensure mkcert is installed
if ! command -v mkcert &>/dev/null; then
    if [ -f ~/.local/bin/mkcert ]; then
        export PATH="$HOME/.local/bin:$PATH"
    else
        echo "❌ mkcert is not installed."
        echo ""
        echo "Install it via:"
        echo "  macOS:   brew install mkcert"
        echo "  Linux:   See https://github.com/FiloSottile/mkcert#installation"
        echo "  Windows: choco install mkcert"
        echo ""
        echo "Then run this script again."
        exit 1
    fi
fi

echo "📦 Installing mkcert local CA system-wide..."
mkcert -install
echo ""

echo "📁 Generating certificates..."
mkdir -p "$CERT_DIR"

mkcert -cert-file "$CERT_DIR/cert.pem" -key-file "$CERT_DIR/key.pem" \
    "*.test" \
    "*.localhost" \
    "localhost" \
    127.0.0.1 \
    ::1

echo ""

# Copy the CA cert for nginx
CAROOT=$(mkcert -CAROOT)
cp "$CAROOT/rootCA.pem" "$CERT_DIR/ca.pem"

echo "✅ Certificates generated and trusted!"

echo ""
echo "💡 Tips:"
echo "  - Restart your browser to ensure changes take effect"
echo "  - Visit https://test.test or any .test domain"
echo "  - You should no longer see certificate warnings"
echo ""
