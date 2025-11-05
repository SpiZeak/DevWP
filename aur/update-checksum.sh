#!/bin/bash
# Script to automatically update the checksum in PKGBUILD after a new release

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 0.0.31"
    exit 1
fi

VERSION=$1
APPIMAGE_URL="https://github.com/SpiZeak/DevWP/releases/download/v${VERSION}/devwp-${VERSION}.AppImage"
PKGBUILD_FILE="$(dirname "$0")/PKGBUILD"

echo "Downloading AppImage to calculate checksum..."
wget -q --show-progress "$APPIMAGE_URL" -O "/tmp/devwp-${VERSION}.AppImage"

echo "Calculating SHA256 checksum..."
CHECKSUM=$(sha256sum "/tmp/devwp-${VERSION}.AppImage" | awk '{print $1}')

echo "Checksum: $CHECKSUM"

# Update PKGBUILD
echo "Updating PKGBUILD..."
sed -i "s/^pkgver=.*/pkgver=${VERSION}/" "$PKGBUILD_FILE"
sed -i "s/^pkgrel=.*/pkgrel=1/" "$PKGBUILD_FILE"
sed -i "s/^sha256sums=('[^']*'/sha256sums=('${CHECKSUM}'/" "$PKGBUILD_FILE"

# Generate .SRCINFO
echo "Generating .SRCINFO..."
cd "$(dirname "$0")"
makepkg --printsrcinfo > .SRCINFO

echo "✅ PKGBUILD and .SRCINFO updated successfully!"
echo ""
echo "Next steps:"
echo "1. Review the changes: git diff"
echo "2. Test the build: cd aur && makepkg -si"
echo "3. Commit: git add PKGBUILD .SRCINFO && git commit -m 'Update to version ${VERSION}'"
echo "4. Push to AUR: git push"

# Cleanup
rm "/tmp/devwp-${VERSION}.AppImage"
