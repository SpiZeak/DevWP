# Certificate Trust Setup

This guide explains how to trust DevWP's self-signed certificates so you don't see browser warnings during local development.

## Quick Start

Run the automated setup script:

```bash
./scripts/trust-certificate.sh
```

This script will:

- Detect your operating system
- Add the CA certificate to your system's trust store
- Provide browser-specific instructions

## Manual Setup

If you prefer to set up certificates manually, follow the instructions for your platform below.

### Linux

#### Debian/Ubuntu

```bash
sudo cp config/certs/ca.pem /usr/local/share/ca-certificates/devwp-ca.crt
sudo update-ca-certificates
```

#### RedHat/CentOS/Fedora

```bash
sudo cp config/certs/ca.pem /etc/pki/ca-trust/source/anchors/devwp-ca.pem
sudo update-ca-trust
```

#### Arch Linux

```bash
sudo cp config/certs/ca.pem /etc/ca-certificates/trust-source/anchors/devwp-ca.pem
sudo trust extract-compat
```

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain config/certs/ca.pem
```

### Windows

Run in Administrator PowerShell:

```powershell
certutil -addstore -f "ROOT" "config\certs\ca.pem"
```

Or use the GUI:

1. Double-click `config/certs/ca.pem`
2. Click "Install Certificate"
3. Select "Local Machine"
4. Place in "Trusted Root Certification Authorities"
5. Click "Finish"

## Browser-Specific Instructions

### Chrome/Chromium/Brave/Edge

**Linux/Windows:** These browsers typically use the system certificate store, so the above steps should work automatically.

**Manual import (if needed):**

1. Go to `chrome://settings/certificates`
2. Click "Authorities" tab
3. Click "Import"
4. Select `config/certs/ca.pem`
5. Check "Trust this certificate for identifying websites"
6. Click "OK"

### Firefox

Firefox uses its own certificate store and requires manual import:

1. Open Firefox
2. Go to `about:preferences#privacy`
3. Scroll to "Certificates" section
4. Click "View Certificates"
5. Go to "Authorities" tab
6. Click "Import"
7. Select `config/certs/ca.pem`
8. Check "Trust this CA to identify websites"
9. Click "OK"

### Safari (macOS)

Safari uses the macOS Keychain, so the macOS system setup above is sufficient.

## Verification

After trusting the certificate:

1. **Restart your browser** (important!)
2. Visit any `.test` domain (e.g., `https://test.test`)
3. You should see a padlock icon with no warnings
4. Click the padlock and verify the certificate is issued by "test-ca"

## Troubleshooting

### Still seeing warnings?

1. **Restart your browser** - Most browsers cache certificate information
2. **Clear browser cache** - Sometimes necessary for Chrome/Chromium
3. **Check certificate validity** - Certificates expire after 60 days
4. **Regenerate certificates** - If expired, regenerate using the certificate generation script

### Certificate expired?

Check expiration:

```bash
openssl x509 -in config/certs/ca.pem -noout -dates
```

If expired, regenerate certificates:

```bash
# TODO: Add certificate generation script path when created
```

### Firefox still shows warnings?

Firefox doesn't use the system certificate store. You must manually import the certificate using the Firefox-specific instructions above.

### Chrome shows NET::ERR_CERT_AUTHORITY_INVALID?

1. Clear Chrome's SSL state: `chrome://settings/clearBrowserData` (choose "Cached images and files")
2. Restart Chrome completely
3. Try visiting the site again

### Linux: "Permission denied" errors?

The certificate installation commands require `sudo`. Make sure you're running the script with appropriate permissions.

## Security Notes

- **Development only**: These certificates are for local development only
- **Do not use in production**: Self-signed certificates should never be used in production
- **Rotate regularly**: Consider regenerating certificates periodically
- **Keep private keys secure**: The `ca-key.pem` file should never be shared

## Certificate Details

- **CA Name**: test-ca
- **Key Size**: 2048 bits
- **Signature Algorithm**: SHA-256 with RSA
- **Validity**: 60 days (approximately)
- **Domains**: `*.test` (all .test domains)

## Removing Trusted Certificate

If you need to remove the trusted certificate:

### Linux (Debian/Ubuntu)

```bash
sudo rm /usr/local/share/ca-certificates/devwp-ca.crt
sudo update-ca-certificates --fresh
```

### Linux (RedHat/Fedora)

```bash
sudo rm /etc/pki/ca-trust/source/anchors/devwp-ca.pem
sudo update-ca-trust
```

### macOS

```bash
sudo security delete-certificate -c "test-ca" /Library/Keychains/System.keychain
```

### Windows

```powershell
certutil -delstore "ROOT" "test-ca"
```

## Additional Resources

- [OpenSSL Certificate Management](https://www.openssl.org/docs/man1.1.1/man1/x509.html)
- [Chrome Certificate Management](https://chromium.googlesource.com/chromium/src/+/master/docs/linux/cert_management.md)
- [Firefox Certificate Management](https://support.mozilla.org/en-US/kb/setting-certificate-authorities-firefox)
