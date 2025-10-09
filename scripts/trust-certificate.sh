#!/bin/bash

# Script to trust DevWP self-signed certificates
# This eliminates browser warnings for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERT_DIR="$PROJECT_ROOT/config/certs"
CA_CERT="$CERT_DIR/ca.pem"

echo "🔒 DevWP Certificate Trust Setup"
echo "=================================="
echo ""

# Check if CA certificate exists
if [ ! -f "$CA_CERT" ]; then
    echo "❌ Error: CA certificate not found at $CA_CERT"
    echo "Please generate certificates first."
    exit 1
fi

# Detect the operating system
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "📋 Detected: Linux"
    echo ""

    # Detect Linux distribution
    if [ -f /etc/debian_version ]; then
        echo "Installing certificate for Debian/Ubuntu..."
        sudo cp "$CA_CERT" /usr/local/share/ca-certificates/devwp-ca.crt
        sudo update-ca-certificates
        echo "✅ System certificate store updated"

    elif [ -f /etc/redhat-release ]; then
        echo "Installing certificate for RedHat/CentOS/Fedora..."
        sudo cp "$CA_CERT" /etc/pki/ca-trust/source/anchors/devwp-ca.pem
        sudo update-ca-trust
        echo "✅ System certificate store updated"

    elif [ -f /etc/arch-release ]; then
        echo "Installing certificate for Arch Linux..."
        sudo cp "$CA_CERT" /etc/ca-certificates/trust-source/anchors/devwp-ca.pem
        sudo trust extract-compat
        echo "✅ System certificate store updated"

    else
        echo "⚠️  Unknown Linux distribution"
        echo "Please manually add $CA_CERT to your system's trust store"
    fi

    echo ""
    echo "📱 Browser-specific setup:"
    echo ""

    # Chrome/Chromium
    echo "For Chrome/Chromium:"
    echo "  The system certificate should work automatically."
    echo "  If not, go to: chrome://settings/certificates"
    echo "  → Authorities → Import → Select $CA_CERT"
    echo ""

    # Firefox
    echo "For Firefox:"
    echo "  1. Open Firefox and go to: about:preferences#privacy"
    echo "  2. Scroll to 'Certificates' → Click 'View Certificates'"
    echo "  3. Go to 'Authorities' tab → Click 'Import'"
    echo "  4. Select: $CA_CERT"
    echo "  5. Check 'Trust this CA to identify websites'"
    echo ""

elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📋 Detected: macOS"
    echo ""
    echo "Adding certificate to macOS Keychain..."
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_CERT"
    echo "✅ Certificate added to System Keychain"
    echo ""
    echo "Note: Chrome and Safari will use the system keychain automatically."
    echo "Firefox requires manual import (see instructions above)."
    echo ""

elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    echo "📋 Detected: Windows"
    echo ""
    echo "Please run this script in an Administrator PowerShell:"
    echo ""
    echo "  certutil -addstore -f \"ROOT\" \"$CA_CERT\""
    echo ""
    echo "Or manually:"
    echo "  1. Double-click: $CA_CERT"
    echo "  2. Click 'Install Certificate'"
    echo "  3. Select 'Local Machine'"
    echo "  4. Place in 'Trusted Root Certification Authorities'"
    echo ""
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "💡 Tips:"
echo "  - Restart your browser to ensure changes take effect"
echo "  - Visit https://test.test or any .test domain"
echo "  - You should no longer see certificate warnings"
echo ""
