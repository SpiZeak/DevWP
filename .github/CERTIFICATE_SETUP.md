# 🔒 Quick Certificate Setup

> **TL;DR**: Run `./scripts/trust-certificate.sh` to eliminate browser SSL warnings

## One Command Setup

```bash
./scripts/trust-certificate.sh
```

This script automatically:

- ✅ Detects your OS (Linux/macOS/Windows)
- ✅ Adds the CA certificate to system trust store
- ✅ Provides browser-specific instructions

## After Running the Script

1. **Restart your browser** (important!)
2. Visit `https://test.test` or any `.test` site
3. No more warnings! 🎉

## Browser Notes

### Chrome/Chromium/Brave/Edge

✅ Uses system certificate store - works automatically after restart

### Firefox

⚠️ Requires manual import:

- Go to `about:preferences#privacy`
- Certificates → View Certificates → Authorities → Import
- Select `config/certs/ca.pem`
- Check "Trust this CA to identify websites"

## Need Help?

See detailed guide: [Certificate Trust Setup](../docs/certificate-trust-setup.md)

## Certificate Info

- **Location**: `config/certs/ca.pem`
- **CA Name**: test-ca
- **Domains**: `*.test`
- **Validity**: ~60 days
