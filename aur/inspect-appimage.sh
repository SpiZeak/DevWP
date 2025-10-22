#!/bin/bash
# Helper script to inspect AppImage structure for PKGBUILD debugging

if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-appimage>"
    echo "Example: $0 devwp-0.0.26.AppImage"
    exit 1
fi

APPIMAGE="$1"

if [ ! -f "$APPIMAGE" ]; then
    echo "Error: AppImage file not found: $APPIMAGE"
    exit 1
fi

echo "=================================================="
echo "Inspecting AppImage: $APPIMAGE"
echo "=================================================="
echo ""

# Make executable and extract
chmod +x "$APPIMAGE"
./"$APPIMAGE" --appimage-extract >/dev/null 2>&1

if [ ! -d "squashfs-root" ]; then
    echo "Error: Failed to extract AppImage"
    exit 1
fi

echo "✓ AppImage extracted to squashfs-root/"
echo ""

# Show structure
echo "Directory structure:"
echo "-------------------"
tree squashfs-root -L 2 2>/dev/null || find squashfs-root -maxdepth 2 -print

echo ""
echo "Desktop file locations:"
echo "----------------------"
find squashfs-root -name "*.desktop" -type f

echo ""
echo "Icon locations:"
echo "---------------"
find squashfs-root -name "*.png" -type f | grep -i icon | head -10

echo ""
echo "License file locations:"
echo "----------------------"
find squashfs-root -name "LICENSE*" -type f

echo ""
echo "AppRun location:"
echo "----------------"
find squashfs-root -name "AppRun" -type f

echo ""
echo "Desktop file content (if found):"
echo "--------------------------------"
local desktop=$(find squashfs-root -name "*.desktop" -type f | head -1)
if [ -n "$desktop" ]; then
    cat "$desktop"
else
    echo "No desktop file found!"
fi

echo ""
echo "=================================================="
echo "Inspection complete!"
echo "=================================================="
echo ""
echo "To clean up: rm -rf squashfs-root"
