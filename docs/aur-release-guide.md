# AUR Release Guide for DevWP

This guide explains how to publish and maintain DevWP on the Arch User Repository (AUR).

## Overview

DevWP is distributed on AUR as a binary package (`devwp`) that uses the pre-built AppImage from GitHub releases. This approach is simpler than building from source and provides faster installation for users.

## One-Time Setup

### 1. Create AUR Account

1. Register at https://aur.archlinux.org/register
2. Add your SSH public key in your account settings
3. Read the AUR submission guidelines

### 2. Clone AUR Repository

```bash
# Initial clone (first time only)
git clone ssh://aur@aur.archlinux.org/devwp.git aur-publish
cd aur-publish

# Copy initial files from the project
cp ../aur/PKGBUILD .
cp ../aur/.SRCINFO .
```

### 3. Update Maintainer Info

Edit `PKGBUILD` and replace the maintainer line:

```bash
# Maintainer: Your Name <your.email@example.com>
```

### 4. Calculate Initial Checksum

```bash
# Download the latest release AppImage
VERSION=0.1.0
wget "https://github.com/SpiZeak/DevWP/releases/download/v${VERSION}/devwp-${VERSION}.AppImage"

# Calculate checksum
sha256sum "devwp-${VERSION}.AppImage"

# Update the checksum in PKGBUILD
# sha256sums=('your_calculated_checksum_here')
```

### 5. Test Build

```bash
# Test the package builds correctly
makepkg -si

# Test the application runs
devwp

# Clean up
rm -rf src/ pkg/ *.AppImage
```

### 6. Initial Commit

```bash
# Generate .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# Commit and push
git add PKGBUILD .SRCINFO
git commit -m "Initial commit: devwp 0.1.0"
git push origin master
```

## Regular Release Process

For each new DevWP release, follow these steps:

### Step 1: GitHub Release

First, create the GitHub release as usual:

```bash
# Tag and push the release
git tag v0.1.0
git push origin v0.1.0

# Wait for GitHub Actions to build and publish the release
# Verify the AppImage is available in the GitHub release
```

### Step 2: Update AUR Package

#### Automated Method (Recommended)

Use the provided script:

```bash
cd aur/
./update-checksum.sh 0.1.0
```

This script will:

- Download the new AppImage
- Calculate the SHA256 checksum
- Update `PKGBUILD` version and checksum
- Generate new `.SRCINFO`

#### Manual Method

```bash
# 1. Download the new AppImage
VERSION=0.1.0
wget "https://github.com/SpiZeak/DevWP/releases/download/v${VERSION}/devwp-${VERSION}.AppImage"

# 2. Calculate checksum
sha256sum "devwp-${VERSION}.AppImage"

# 3. Edit PKGBUILD
# Update: pkgver=0.1.0
# Update: pkgrel=1
# Update: sha256sums=('new_checksum')

# 4. Generate .SRCINFO
makepkg --printsrcinfo > .SRCINFO
```

### Step 3: Test the Update

```bash
# Test build
makepkg -si

# Verify the application works
devwp --version

# Clean up test artifacts
rm -rf src/ pkg/ *.AppImage
```

### Step 4: Publish to AUR

```bash
# Navigate to AUR repository
cd /path/to/aur-publish

# Copy updated files
cp ../DevWP/aur/PKGBUILD .
cp ../DevWP/aur/.SRCINFO .

# Commit and push
git add PKGBUILD .SRCINFO
git commit -m "Update to version 0.1.0"
git push origin master
```

## Release Checklist

Use this checklist for each release:

- [ ] GitHub release is published with AppImage
- [ ] AppImage URL is accessible
- [ ] PKGBUILD version updated
- [ ] PKGBUILD pkgrel reset to 1
- [ ] SHA256 checksum updated
- [ ] .SRCINFO regenerated
- [ ] Package builds successfully (`makepkg -si`)
- [ ] Application launches and works
- [ ] Changes committed to AUR repository
- [ ] Package visible on AUR website
- [ ] Test installation from AUR (`yay -S devwp`)

## Troubleshooting

### Permission Denied When Pushing

Ensure your SSH key is added to your AUR account:

```bash
ssh -T aur@aur.archlinux.org
# Should show: "Hi username! You've successfully authenticated..."
```

### Checksum Mismatch

If users report checksum mismatches:

1. Verify the AppImage wasn't re-uploaded to GitHub
2. Re-download and recalculate the checksum
3. Update the PKGBUILD and push

### Package Not Building

Check the build logs:

```bash
makepkg -si 2>&1 | tee build.log
```

Common issues:

- Missing dependencies
- Incorrect AppImage URL
- Extraction issues (FUSE requirements)

### Desktop File Not Appearing

Verify the desktop file installation:

```bash
# After building, check the package contents
tar -tzf devwp-*.pkg.tar.zst | grep desktop
```

## Alternative: Source-Based Package

If you want to create a source-based package (`devwp`) instead of binary:

1. Create new `PKGBUILD` that builds from source
2. Clone from GitHub in the `source` array
3. Run `bun install --frozen-lockfile` and `bun run build:linux:verified`
4. Package the built files

The `build:linux:verified` script runs a post-build check against `dist/linux-unpacked/resources/app.asar` to ensure transitive runtime dependencies are present. This prevents “Cannot find module …” errors after installation.

See `aur/PKGBUILD-source` template (to be created if needed).

## Maintenance

### Monitoring

- Watch for comments on the AUR package page
- Respond to user issues and questions
- Check for orphaned dependencies

### Marking Out of Date

If the GitHub release is newer than AUR:

```bash
# Users or you can mark the package out-of-date
# This notifies you to update
```

### Transferring Ownership

To transfer package maintainership:

1. Add new maintainer as co-maintainer
2. They can adopt the package via AUR website
3. Remove yourself as maintainer

## Resources

- **AUR Package**: https://aur.archlinux.org/packages/devwp
- **AUR Guidelines**: https://wiki.archlinux.org/title/AUR_submission_guidelines
- **PKGBUILD Guide**: https://wiki.archlinux.org/title/PKGBUILD
- **Arch Packaging Standards**: https://wiki.archlinux.org/title/Arch_package_guidelines

## Support

For help with AUR packaging:

- AUR mailing list
- #archlinux-aur on Libera.Chat
- Arch Linux forums

For DevWP-specific issues:

- GitHub Issues: https://github.com/SpiZeak/DevWP/issues
