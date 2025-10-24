# AUR Deployment Automation Setup

This document explains how to set up automated deployment to the Arch User Repository (AUR) using GitHub Actions.

## Overview

The workflow `.github/workflows/aur-deploy.yml` automatically updates the AUR package whenever a new release is published on GitHub. It:

1. Downloads the AppImage from the GitHub release
2. Calculates the SHA256 checksum
3. Updates the PKGBUILD with the new version and checksum
4. Generates the `.SRCINFO` file
5. Commits and pushes changes to the AUR repository

## Prerequisites

### 1. Create AUR Account

If you don't already have one:

1. Go to https://aur.archlinux.org/register
2. Create an account
3. Configure your SSH key in your AUR account settings

### 2. Generate SSH Key for AUR

Create a dedicated SSH key for GitHub Actions:

```bash
# Generate a new SSH key (no passphrase for automation)
ssh-keygen -t ed25519 -C "devwp-github-actions" -f ~/.ssh/aur_deploy

# This creates two files:
# - ~/.ssh/aur_deploy (private key - add to GitHub Secrets)
# - ~/.ssh/aur_deploy.pub (public key - add to AUR account)
```

### 3. Add SSH Public Key to AUR

1. Copy your public key:

   ```bash
   cat ~/.ssh/aur_deploy.pub
   ```

2. Go to https://aur.archlinux.org/account/YourUsername/edit
3. Paste the public key in the "SSH Public Key" field
4. Click "Update"

### 4. Initialize AUR Repository (First Time Only)

If you haven't created the AUR package yet:

```bash
# Clone the empty repository
git clone ssh://aur@aur.archlinux.org/devwp-bin.git

cd devwp-bin

# Copy your package files
cp /path/to/DevWP/aur/PKGBUILD .
cp /path/to/DevWP/aur/.SRCINFO .
cp /path/to/DevWP/aur/devwp-bin.install .

# Commit and push
git add PKGBUILD .SRCINFO devwp-bin.install
git commit -m "Initial commit: DevWP Electron application"
git push origin master
```

## GitHub Secrets Configuration

Add the following secrets to your GitHub repository:

### Required Secrets

Go to: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

1. **AUR_SSH_PRIVATE_KEY** (required)
   - Value: Content of `~/.ssh/aur_deploy` (the private key)
   - Copy with: `cat ~/.ssh/aur_deploy | pbcopy` (macOS) or `cat ~/.ssh/aur_deploy`

### Optional Secrets

2. **AUR_USERNAME** (optional)
   - Value: Your AUR username
   - Default: "DevWP Bot" if not set

3. **AUR_EMAIL** (optional)
   - Value: Your email for git commits
   - Default: "devwp-bot@users.noreply.github.com" if not set

## Workflow Triggers

### Automatic Trigger

The workflow automatically runs when a new release is **published** on GitHub:

```bash
# Create and push a tag
git tag v0.0.28
git push origin v0.0.28

# Then publish the release on GitHub (or wait for release.yml to create it)
# The aur-deploy.yml workflow will run after release.yml completes
```

### Manual Trigger

You can also manually trigger the workflow:

1. Go to: `Actions` → `Deploy to AUR` → `Run workflow`
2. Enter the version number (e.g., `0.0.28`)
3. Click `Run workflow`

This is useful for:

- Updating the AUR package without creating a new release
- Re-deploying if something went wrong
- Testing the workflow

## Workflow Process

### Step-by-Step Execution

1. **Checkout code**: Gets the latest repository code
2. **Set version**: Determines version from tag or manual input
3. **Download AppImage**: Fetches the compiled AppImage from GitHub release
4. **Calculate checksums**: Generates SHA256 for PKGBUILD
5. **Setup SSH**: Configures authentication for AUR
6. **Configure Git**: Sets up git user for commits
7. **Clone AUR repository**: Gets current AUR package
8. **Update PKGBUILD**: Modifies version and checksum
9. **Update .SRCINFO**: Regenerates metadata file
10. **Commit and push**: Uploads changes to AUR
11. **Create summary**: Shows deployment results in GitHub Actions UI
12. **Cleanup**: Removes sensitive files

## Verification

### Check Deployment Status

1. Go to GitHub: `Actions` → `Deploy to AUR`
2. Click on the latest workflow run
3. Check the "Create deployment summary" step for details

### Verify AUR Package

Visit: https://aur.archlinux.org/packages/devwp-bin

Check:

- Package version matches your release
- Last updated timestamp is recent
- PKGBUILD shows correct version and checksum

### Test Installation

```bash
# With yay
yay -S devwp-bin

# With paru
paru -S devwp-bin

# Manual installation
git clone https://aur.archlinux.org/devwp-bin.git
cd devwp-bin
makepkg -si
```

## Troubleshooting

### SSH Authentication Failed

```
Permission denied (publickey)
```

**Solution:**

- Verify `AUR_SSH_PRIVATE_KEY` secret is set correctly
- Check that the corresponding public key is added to your AUR account
- Ensure the private key has no passphrase

### Download Failed

```
Error: Failed to download AppImage
```

**Solution:**

- Ensure the release exists on GitHub
- Check that the AppImage was uploaded by `release.yml`
- Verify the filename matches: `devwp-{version}.AppImage`

### Checksum Mismatch

If users report checksum errors after installation:

**Solution:**

- Run workflow again (it will recalculate the checksum)
- Verify the AppImage wasn't modified after upload
- Check GitHub release page for correct file

### No Changes to Commit

```
No changes to commit
```

This means the AUR package already has this version. This is normal if:

- You're re-running the workflow for the same version
- The version wasn't bumped in `package.json`

**Solution:** Bump version in `package.json` before creating release

### .SRCINFO Generation Failed

```
makepkg: command not found
```

**Solution:** This shouldn't happen on `ubuntu-latest` with the pacman install step. If it does, the workflow needs adjustment.

## Maintenance

### Updating the Workflow

If you need to modify the deployment process:

1. Edit `.github/workflows/aur-deploy.yml`
2. Test with manual trigger first
3. Monitor the Actions tab for any errors

### Version Bumping Strategy

**Recommended process:**

1. Update `package.json` version (e.g., `0.0.28` → `0.0.28`)
2. Commit changes: `git commit -am "Bump version to 0.0.28"`
3. Create tag: `git tag v0.0.28`
4. Push: `git push && git push --tags`
5. Wait for `release.yml` to build and publish release
6. `aur-deploy.yml` will automatically run after release is published

### Manual AUR Updates

If you need to update the AUR package manually:

```bash
# Clone the AUR repo
git clone ssh://aur@aur.archlinux.org/devwp-bin.git
cd devwp-bin

# Make changes to PKGBUILD
vim PKGBUILD

# Regenerate .SRCINFO
makepkg --printsrcinfo > .SRCINFO

# Commit and push
git add PKGBUILD .SRCINFO
git commit -m "Update to version X.Y.Z"
git push origin master
```

## Security Considerations

1. **SSH Private Key**: Never commit the private key to the repository
2. **GitHub Secrets**: Only users with write access can view/edit secrets
3. **SSH Key Scope**: The SSH key only has access to the AUR repository
4. **Automatic Cleanup**: The workflow removes SSH keys after completion

## References

- [AUR Submission Guidelines](https://wiki.archlinux.org/title/AUR_submission_guidelines)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PKGBUILD Reference](https://wiki.archlinux.org/title/PKGBUILD)
- [Arch Package Guidelines](https://wiki.archlinux.org/title/Arch_package_guidelines)
