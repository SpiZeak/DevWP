# AUR Deployment Quick Start

## One-Time Setup (5 minutes)

### 1. Generate SSH Key

```bash
ssh-keygen -t ed25519 -C "devwp-github-actions" -f ~/.ssh/aur_deploy
# Press Enter twice (no passphrase for automation)
```

### 2. Add Public Key to AUR

```bash
# Copy public key
cat ~/.ssh/aur_deploy.pub

# Go to: https://aur.archlinux.org/account/YourUsername/edit
# Paste in "SSH Public Key" field and save
```

### 3. Add Private Key to GitHub

```bash
# Copy private key
cat ~/.ssh/aur_deploy

# Go to: GitHub repo → Settings → Secrets and variables → Actions
# Click "New repository secret"
# Name: AUR_SSH_PRIVATE_KEY
# Value: Paste the private key (entire content including BEGIN/END lines)
# Click "Add secret"
```

### 4. Optional: Add Git Config Secrets

```bash
# In GitHub: Settings → Secrets and variables → Actions

# Add AUR_USERNAME (optional, defaults to "DevWP Bot")
# Name: AUR_USERNAME
# Value: YourAURUsername

# Add AUR_EMAIL (optional, defaults to devwp-bot@users.noreply.github.com)
# Name: AUR_EMAIL
# Value: your@email.com
```

### 5. Initialize AUR Repo (First Time Only)

```bash
git clone ssh://aur@aur.archlinux.org/devwp-bin.git
cd devwp-bin
cp ../DevWP/aur/PKGBUILD .
cp ../DevWP/aur/.SRCINFO .
cp ../DevWP/aur/devwp-bin.install .
git add PKGBUILD .SRCINFO devwp-bin.install
git commit -m "Initial commit: DevWP v0.0.31"
git push origin master
```

## Daily Usage

### Automatic Deployment (Recommended)

```bash
# 1. Bump version in package.json
vim package.json  # Change version: "0.0.31" → "0.0.31"

# 2. Commit and tag
git commit -am "Bump version to 0.0.31"
git tag v0.0.31
git push && git push --tags

# 3. Wait for workflows to complete
# - release.yml builds and publishes GitHub release (~10-15 min)
# - aur-deploy.yml updates AUR package (~2-3 min)

# 4. Done! Check:
# GitHub: Actions tab for workflow status
# AUR: https://aur.archlinux.org/packages/devwp-bin
```

### Manual Deployment

```bash
# Go to: GitHub → Actions → Deploy to AUR → Run workflow
# Enter version: 0.0.31
# Click: Run workflow
# Wait ~2-3 minutes
```

## Verification

```bash
# Check AUR package
yay -Ss devwp-bin

# Install/Update
yay -S devwp-bin

# Test
devwp
```

## Troubleshooting

| Problem                         | Solution                                              |
| ------------------------------- | ----------------------------------------------------- |
| "Permission denied (publickey)" | Check `AUR_SSH_PRIVATE_KEY` secret matches public key |
| "Failed to download AppImage"   | Ensure GitHub release exists and AppImage uploaded    |
| "No changes to commit"          | Version already deployed (normal for re-runs)         |
| Users report checksum error     | Re-run workflow to recalculate checksum               |

## Workflow Files

- `.github/workflows/aur-deploy.yml` - Main deployment workflow
- `docs/aur-deployment-setup.md` - Detailed setup guide
- `aur/PKGBUILD` - AUR package template

## What Gets Automated

✅ AppImage download from GitHub release
✅ SHA256 checksum calculation
✅ PKGBUILD version update
✅ PKGBUILD checksum update
✅ .SRCINFO regeneration
✅ Git commit and push to AUR
✅ Deployment summary in GitHub Actions

## What You Still Do Manually

🔧 Bump version in `package.json`
🔧 Create and push git tags
🔧 Monitor workflow execution

---

**Full Documentation:** See `docs/aur-deployment-setup.md` for complete details.
