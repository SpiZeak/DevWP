# 🔒 Quick Certificate Setup

> **TL;DR**: Run `./scripts/setup-certs.sh` to eliminate browser SSL warnings

## One Command Setup

```bash
./scripts/setup-certs.sh
```

This script automatically:

- ✅ Detects and installs [mkcert](https://github.com/FiloSottile/mkcert) if available
- ✅ Creates a local Certificate Authority and trusts it system-wide
- ✅ Generates wildcard certificates for `*.test` domains
- ✅ No browser warnings — ever!

Or if certificates are already generated, just ensure trust:

```bash
./scripts/trust-certificate.sh
```

## After Running the Script

1. **Restart your browser** (important!)
2. Visit `https://test.test` or any `.test` site
3. No more warnings! 🎉

## Browser Notes

### Chrome/Chromium/Brave/Edge

✅ Uses system certificate store - works automatically after `mkcert -install`

### Firefox

✅ `mkcert -install` automatically adds to Firefox's certificate store

⚠️ If you still see warnings, manually import the CA:

- Go to `about:preferences#privacy`
- Certificates → View Certificates → Authorities → Import
- Select `$(mkcert -CAROOT)/rootCA.pem`
- Check "Trust this CA to identify websites"

## Need Help?

See detailed guide: [Certificate Trust Setup](../docs/certificate-trust-setup.md)

## Certificate Info

- **Location**: `config/certs/cert.pem` (cert) and `config/certs/ca.pem` (CA)
- **CA Name**: mkcert (auto-generated, locally-trusted)
- **Domains**: `*.test`, `*.localhost`, `localhost`, `127.0.0.1`, `::1`
- **Validity**: ~2.5 years
