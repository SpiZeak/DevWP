# Certificate Trust Setup

This guide explains how DevWP sets up locally-trusted certificates using [mkcert](https://github.com/FiloSottile/mkcert), so you never see browser warnings during local development.

## How It Works

DevWP uses **mkcert** to:

1. Create a local Certificate Authority (CA) on your machine
2. Install that CA into your system's trust store automatically
3. Generate development certificates signed by that CA for all your `.test` domains

This means **no browser warnings** — ever!

## Quick Start

Run the automated setup script:

```bash
# One-time setup — installs mkcert's CA and generates certificates
./scripts/setup-certs.sh
```

Or if you already have certificates generated:

```bash
# Just ensure the CA is trusted
./scripts/trust-certificate.sh
```

## What These Scripts Do

Both scripts:

1. **Ensure mkcert is installed** — if not, see installation instructions below
2. **Run `mkcert -install`** — creates a local CA and trusts it system-wide
3. **Generate certificates** for `*.test`, `*.localhost`, `localhost`, `127.0.0.1`, and `::1`
4. **Copy the CA certificate** to `config/certs/ca.pem` for nginx

## Installing mkcert

### macOS

```bash
brew install mkcert
```

### Linux

**Arch Linux (AUR):**
```bash
yay -S mkcert
```

**Debian/Ubuntu:**
```bash
sudo apt install libnss3-tools
curl -JLO "https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-$(uname -s)-$(uname -m)"
chmod +x mkcert-*
sudo mv mkcert-* /usr/local/bin/mkcert
```

**Fedora:**
```bash
sudo dnf install nss-tools
curl -JLO "https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-$(uname -s)-$(uname -m)"
chmod +x mkcert-*
sudo mv mkcert-* /usr/local/bin/mkcert
```

### Windows

```powershell
choco install mkcert
```

Or download the binary from [the releases page](https://github.com/FiloSottile/mkcert/releases).

## Manual Setup (without the script)

If you prefer to set up certificates manually:

```bash
# 1. Install mkcert's local CA (trusted system-wide)
mkcert -install

# 2. Generate certificates for all domains
mkcert -cert-file config/certs/cert.pem -key-file config/certs/key.pem \
  "*.test" \
  "*.localhost" \
  "localhost" \
  127.0.0.1 \
  ::1

# 3. Copy the CA cert for nginx
cp "$(mkcert -CAROOT)/rootCA.pem" config/certs/ca.pem
```

## Dynamic Certificate Generation

When you **create**, **update**, or **delete** a site through DevWP, the app automatically regenerates the certificate using mkcert to include all current domains and aliases. This happens via the Rust backend — no manual steps needed.

## Browser-Specific Notes

### Chrome/Chromium/Brave/Edge

These browsers use the system trust store. Since `mkcert -install` adds the CA there, **everything should work automatically**.

### Firefox

Firefox uses its own certificate store. `mkcert -install` automatically adds the CA to Firefox's store if Firefox is installed. If you see warnings:

1. Open Firefox and go to `about:preferences#privacy`
2. Scroll to "Certificates" → Click "View Certificates"
3. Go to "Authorities" tab
4. Look for "mkcert" in the list
5. If missing, click "Import" and select: `$(mkcert -CAROOT)/rootCA.pem`
6. Check "Trust this CA to identify websites"
7. Click "OK"

### Safari (macOS)

Safari uses the macOS Keychain, and `mkcert -install` adds the CA there automatically.

## Verification

After setup:

1. **Restart your browser** (important!)
2. Visit any `.test` domain (e.g., `https://test.test`)
3. You should see a padlock icon with **no warnings**
4. Click the padlock and verify the certificate is issued by "mkcert"

## Troubleshooting

### Still seeing warnings?

1. **Restart your browser** — Most browsers cache certificate information
2. **Clear browser cache** — Sometimes necessary for Chrome/Chromium
3. **Check certificate validity** — Certificates expire after ~2.5 years
4. **Regenerate certificates** — Run `./scripts/setup-certs.sh` again

### mkcert: "command not found"

Install mkcert (see instructions above) or add it to your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Firefox still shows warnings?

Firefox doesn't use the system certificate store by default. The `mkcert -install` command tries to add to Firefox's store, but if Firefox is not installed or the NSS tools are missing, you'll need to import manually (see Firefox instructions above).

### Chrome shows NET::ERR_CERT_AUTHORITY_INVALID?

1. Clear Chrome's SSL state: `chrome://settings/clearBrowserData` (choose "Cached images and files")
2. Restart Chrome completely
3. Run `mkcert -install` again
4. Try visiting the site again

### Linux: "Permission denied" errors?

The `mkcert -install` command may need `sudo` on some Linux distributions to update the system trust store:

```bash
# If you get permission errors, try:
sudo mkcert -install
```

## Removing Trusted Certificate

If you need to remove mkcert's CA:

```bash
# Uninstall the CA from system trust stores
mkcert -uninstall

# Optionally delete the CA files
rm -rf "$(mkcert -CAROOT)"
```

### Manual removal by OS:

**Linux (Debian/Ubuntu):**
```bash
sudo rm /usr/local/share/ca-certificates/mkcert*
sudo update-ca-certificates --fresh
```

**Linux (Arch Linux):**
```bash
sudo rm /etc/ca-certificates/trust-source/anchors/mkcert*
sudo trust extract-compat
```

**macOS:**
```bash
sudo security delete-certificate -c "mkcert" /Library/Keychains/System.keychain
```

**Windows:**
```powershell
certutil -delstore "ROOT" "mkcert"
```

## Security Notes

- **Development only**: These certificates are for local development only
- **Do not use in production**: Self-signed certificates should never be used in production
- **mkcert's CA is local**: The CA never leaves your machine
- **Rotate periodically**: Certificates are valid for ~2.5 years; regenerate as needed

## Certificate Details

- **CA Name**: mkcert (auto-generated)
- **Key Type**: ECDSA or RSA (mkcert decides)
- **Domains**: `*.test`, `*.localhost`, `localhost`, `127.0.0.1`, `::1`
- **Dynamic SANs**: Additional domains/aliases are added as you create sites

## Additional Resources

- [mkcert GitHub Repository](https://github.com/FiloSottile/mkcert)
- [mkcert Documentation](https://github.com/FiloSottile/mkcert#mkcert)
