# DevWP AUR Package

This directory contains the files needed to maintain the DevWP package in the Arch User Repository (AUR).

## Package Information

- **Package Name**: `devwp-bin`
- **Type**: Binary package (uses pre-built AppImage from GitHub releases)
- **AUR URL**: https://aur.archlinux.org/packages/devwp-bin (once submitted)

## Prerequisites

Before submitting to AUR, you need:

1. An AUR account at https://aur.archlinux.org/register
2. SSH key added to your AUR account
3. Basic familiarity with PKGBUILD and makepkg

## Initial Setup

### 1. Create AUR Repository

```bash
# Clone the initial empty AUR repository
git clone ssh://aur@aur.archlinux.org/devwp-bin.git aur-repo
cd aur-repo

# Copy the package files
cp ../aur/PKGBUILD .
cp ../aur/.SRCINFO .

# Add and commit
git add PKGBUILD .SRCINFO
git commit -m "Initial commit: devwp-bin 0.0.34"

# Push to AUR
git push origin master
```

### 2. Update Package Metadata

Before the first submission, update these fields in `PKGBUILD`:

```bash
# Update maintainer information
# Maintainer: Your Real Name <your.email@example.com>

# Calculate and update the SHA256 checksum
sha256sum devwp-0.0.34.AppImage
# Update sha256sums=('...') in PKGBUILD
```

## Updating the Package

When releasing a new version:

### 1. Update Version Numbers

Edit `PKGBUILD`:

```bash
pkgver=0.0.34  # New version
pkgrel=1       # Reset to 1 for new version
```

Update the source URL to match the new version.

### 2. Update Checksums

```bash
# Download the new AppImage
wget https://github.com/SpiZeak/DevWP/releases/download/v0.0.34/devwp-0.0.34.AppImage

# Calculate SHA256
sha256sum devwp-0.0.34.AppImage

# Update sha256sums in PKGBUILD
sha256sums=('NEW_CHECKSUM_HERE')
```

### 3. Test the Package

```bash
# Build and test locally
makepkg -si

# Test that the application works
devwp

# Clean build artifacts
makepkg --clean
```

### 4. Generate .SRCINFO

```bash
# Generate the .SRCINFO file
makepkg --printsrcinfo > .SRCINFO
```

### 5. Commit and Push

```bash
# In the AUR repository directory
git add PKGBUILD .SRCINFO
git commit -m "Update to version 0.0.34"
git push
```

## Automated Updates

You can automate AUR updates in the GitHub Actions workflow:

### Option 1: Manual Trigger After Release

Keep the current manual process but document it in the release checklist.

### Option 2: GitHub Action (Advanced)

Create `.github/workflows/aur-update.yml`:

```yaml
name: Update AUR Package

on:
  release:
    types: [published]
  workflow_dispatch:

jobs:
  update-aur:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Update AUR package
        uses: KSXGitHub/github-actions-deploy-aur@v2.7.0
        with:
          pkgname: devwp-bin
          pkgbuild: aur/PKGBUILD
          commit_username: ${{ secrets.AUR_USERNAME }}
          commit_email: ${{ secrets.AUR_EMAIL }}
          ssh_private_key: ${{ secrets.AUR_SSH_PRIVATE_KEY }}
          commit_message: 'Update to version ${{ github.event.release.tag_name }}'
```

## Testing Locally

Users can test the package before submission:

```bash
cd aur/
makepkg -si
```

## Package Structure

The package uses a hybrid approach:

**System Files** (read-only in `/opt/devwp-bin/`):

- Electron application binaries
- Docker configuration templates
- Nginx, PHP, and service configurations

**User Files**:

- `~/www/` - WordPress site installations
- `~/.config/devwp/` - Configuration and SSL certificates
  - `compose.yml` - Generated Docker Compose file with user paths
  - `certs/` - SSL certificates
  - `config/` - Symlink to system config

On first launch, DevWP automatically creates these directories and generates the necessary configuration files.

### Directory Structure

```
/opt/devwp-bin/              # System (read-only)
├── DevWP                    # Electron binary
├── compose.yml              # Template only
├── config/                  # Configurations
│   ├── nginx/
│   ├── php/
│   └── seonaut/
└── resources/

~/.config/devwp/             # User configuration
├── compose.yml              # Generated with user paths
├── config -> /opt/devwp-bin/config/  # Symlink
└── certs/                   # SSL certificates

~/www/                       # WordPress sites
├── example.test/
│   ├── wp-admin/
│   ├── wp-content/
│   └── wp-config.php
└── another.test/
```

## Troubleshooting

### Application Doesn't Launch (No Output)

If DevWP installs but doesn't launch when you run `devwp`, this is usually due to permission issues with the extracted AppImage resources.

**Symptoms:**

- Running `devwp` shows no output
- Application icon appears briefly but nothing happens
- No error messages in terminal

**Cause:**
AppImage extraction creates the `resources/` directory with restrictive permissions (700), preventing normal users from accessing the app.asar file.

**Solution:**
The PKGBUILD now automatically fixes these permissions during installation. If you installed an older version (pkgrel=1), reinstall:

```bash
yay -S devwp-bin --rebuild
# or
sudo pacman -R devwp-bin
yay -S devwp-bin
```

**Manual Fix:**
If needed, you can fix permissions manually:

```bash
sudo chmod 755 /opt/devwp-bin/resources
sudo find /opt/devwp-bin/resources/app.asar.unpacked -type d -exec chmod 755 {} \;
sudo find /opt/devwp-bin/resources/app.asar.unpacked -type f -exec chmod 644 {} \;
```

**Debug:**
To see detailed error output:

```bash
cd /opt/devwp-bin
ELECTRON_ENABLE_LOGGING=1 ./DevWP --no-sandbox
```

### Docker Compose Not Found

If you see `no configuration file provided: not found` or `Error checking containers`:

**Cause:**
The `compose.yml` file is missing from the installation directory.

**Solution:**
Reinstall the package (fixed in pkgrel=3):

```bash
yay -S devwp-bin --rebuild
# or
sudo pacman -R devwp-bin && yay -S devwp-bin
```

**Verify:**

```bash
ls -la ~/.config/devwp/
ls -la ~/www/
cat ~/.config/devwp/compose.yml | grep www
```

### Permission Errors Creating Sites

If you see `EACCES: permission denied` when creating WordPress sites:

**Cause:**
The ~/www directory isn't writable or doesn't exist.

**Solution:**

```bash
# Ensure directories exist and are writable
mkdir -p ~/www ~/.config/devwp
chmod u+w ~/www

# Or reset and let DevWP recreate
rm -rf ~/.config/devwp
devwp  # Will recreate on launch
```

The PKGBUILD will now:

1. Try to find the desktop file in multiple locations
2. Create a desktop file if none is found
3. Search for icons in various standard locations

### AppImage Extraction Fails

If the AppImage extraction fails, ensure:

- The AppImage is executable: `chmod +x *.AppImage`
- FUSE is available: `pacman -S fuse2`

### Missing Dependencies

Add any missing runtime dependencies to the `depends` array in PKGBUILD.

### Desktop File Not Working

Verify the desktop file paths match the actual extracted AppImage structure.

## Support

For AUR-specific issues:

- AUR Wiki: https://wiki.archlinux.org/title/AUR
- AUR Submission Guidelines: https://wiki.archlinux.org/title/AUR_submission_guidelines

For DevWP issues:

- GitHub Issues: https://github.com/SpiZeak/DevWP/issues
