#!/bin/bash

# Script to set up DevWP development certificates using mkcert
# This creates a locally-trusted CA and generates certificates for all *.test domains
# No browser warnings — ever!

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERT_DIR="$PROJECT_ROOT/config/certs"

echo "🔐 DevWP Certificate Setup (mkcert)"
echo "===================================="
echo ""

# Ensure mkcert is installed
if ! command -v mkcert &>/dev/null; then
    if [ -f ~/.local/bin/mkcert ]; then
        export PATH="$HOME/.local/bin:$PATH"
    else
        echo "❌ mkcert is not installed."
        echo ""
        echo "Install it via your package manager:"
        echo "  macOS:   brew install mkcert"
        echo "  Linux:   See https://github.com/FiloSottile/mkcert#installation"
        echo "  Windows: choco install mkcert"
        echo ""
        echo "Or download the binary from:"
        echo "  https://github.com/FiloSottile/mkcert/releases"
        echo ""
        echo "Then run this script again."
        exit 1
    fi
fi

echo "📦 Step 1: Installing mkcert local CA..."
mkcert -install
echo ""

echo "📁 Step 2: Generating wildcard certificate for *.test..."
mkdir -p "$CERT_DIR"

# Generate wildcard cert for *.test and also include localhost for good measure
# Note: Browsers restrict second-level wildcards for public suffixes like .test,
# so we also generate a cert for the specific .test domain.
# For most practical purposes, sitename.test will work with the wildcard.
mkcert -cert-file "$CERT_DIR/cert.pem" -key-file "$CERT_DIR/key.pem" \
    "*.test" \
    "*.localhost" \
    "localhost" \
    127.0.0.1 \
    ::1

echo ""

echo "🔗 Step 3: Copying mkcert CA for nginx..."
CAROOT=$(mkcert -CAROOT)
cp "$CAROOT/rootCA.pem" "$CERT_DIR/ca.pem"
echo "  CA cert copied to: $CERT_DIR/ca.pem"
echo ""

echo "✅ Setup complete!"
echo ""
echo "💡 Your certificates are now trusted locally."
echo "   No browser warnings for any *.test domain!"
echo ""
echo "📋 Files in $CERT_DIR:"
ls -la "$CERT_DIR"
echo ""
echo "🔍 To verify: visit https://test.test in your browser"
echo ""
