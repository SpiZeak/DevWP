# Release Checklist

Use this checklist when preparing a new DevWP release.

## Pre-Release

- [ ] All tests passing (`bun run test:all`)
- [ ] Code formatted (`bun run format`)
- [ ] Type checking passes (`bun run typecheck`)
- [ ] Update `package.json` version
- [ ] Update `CHANGELOG.md` (if exists) or release notes
- [ ] All commits pushed to master
- [ ] No uncommitted changes

## GitHub Release

- [ ] Create and push version tag:
  ```bash
  git tag v0.0.X
  git push origin v0.0.X
  ```
- [ ] Wait for GitHub Actions to complete
- [ ] Verify all build artifacts (Windows, macOS, Linux) are uploaded
- [ ] Test download links work
- [ ] Edit release notes if needed

## AUR Release

- [ ] Download the Linux AppImage from GitHub release
- [ ] Calculate SHA256 checksum:
  ```bash
  cd aur/
  ./update-checksum.sh 0.0.X
  ```
- [ ] Verify PKGBUILD updated correctly
- [ ] Test build locally:
  ```bash
  makepkg -si
  devwp --version
  ```
- [ ] Navigate to AUR repository:
  ```bash
  cd /path/to/aur-publish
  ```
- [ ] Copy updated files:
  ```bash
  cp ../DevWP/aur/PKGBUILD .
  cp ../DevWP/aur/.SRCINFO .
  ```
- [ ] Commit and push to AUR:
  ```bash
  git add PKGBUILD .SRCINFO
  git commit -m "Update to version 0.0.X"
  git push origin master
  ```
- [ ] Verify package appears on AUR website
- [ ] Test installation from AUR:
  ```bash
  yay -S devwp
  ```

## Post-Release

- [ ] Announce release on social media/forums
- [ ] Update documentation if needed
- [ ] Monitor issue tracker for bug reports
- [ ] Respond to AUR package comments

## Rollback (if needed)

If critical issues are found:

1. Delete the GitHub tag:

   ```bash
   git tag -d v0.0.X
   git push origin :refs/tags/v0.0.X
   ```

2. Revert AUR package:

   ```bash
   cd aur-publish/
   git revert HEAD
   git push origin master
   ```

3. Mark GitHub release as draft or delete it

## Version Numbering

- **Major** (X.0.0): Breaking changes, major features
- **Minor** (0.X.0): New features, non-breaking changes
- **Patch** (0.0.X): Bug fixes, minor improvements

## Quick Commands Reference

```bash
# Development build
bun run build

# Platform-specific builds
bun run build:linux
bun run build:win
bun run build:mac

# Create tag
git tag v0.0.X
git push origin v0.0.X

# Update AUR
cd aur/
./update-checksum.sh 0.0.X
cd ../aur-publish
cp ../DevWP/aur/{PKGBUILD,.SRCINFO} .
git add PKGBUILD .SRCINFO
git commit -m "Update to version 0.0.X"
git push
```
