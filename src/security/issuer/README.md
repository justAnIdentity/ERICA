# Test PID Issuer Certificates

## ⚠️ WARNING: TEST ONLY - DO NOT USE IN PRODUCTION ⚠️

These certificates are for **testing purposes only** and are used by the EUDI VP Debugger wallet simulator to sign PID credentials.

### What's Here

- `issuer-private-key.pem` - ES256 (P-256) private key for signing PIDs
- `issuer-certificate.pem` - Self-signed certificate for the test issuer

### Security Notice

**THESE KEYS ARE INTENTIONALLY PUBLIC AND COMMITTED TO THE REPOSITORY**

- ❌ DO NOT use these certificates in production
- ❌ DO NOT trust these certificates for real identity verification
- ❌ DO NOT use PIDs signed by these certificates for actual authentication
- ✅ DO use these certificates to test your Relying Party verification logic
- ✅ DO use these certificates to understand EUDI PID flows

### For Relying Party Developers

If you're building an EUDI Relying Party and want to test against the wallet simulator:

1. **Download the trust anchor**: `GET https://your-debugger-url/api/issuer/trust-anchor`
2. **Add to your test trust list**: Configure your RP to trust this issuer (test environment only!)
3. **Verify credentials**: PIDs from the wallet simulator will be signed by this certificate

### Certificate Details

```
Subject: C=DE, O=EUDI VP Debugger - TEST ONLY, OU=Wallet Simulator, CN=Test PID Issuer (DO NOT USE IN PRODUCTION)
Validity: 10 years from 2026-05-04
Algorithm: ES256 (P-256)
```

### Why Are These Keys Public?

This is a **debugging and testing tool**. The private key is intentionally public so that:
- Developers can reproduce the exact same credentials
- RPs can configure a stable trust anchor for testing
- The community can verify the tool's behavior
- There's no confusion about security (it's clearly labeled as TEST ONLY)

**Any PID signed by these certificates is FAKE and contains NO real personal data.**

### For Production

In a production environment:
- PID issuers use HSM-protected private keys
- Certificates are issued by government certificate authorities
- Trust lists are maintained by national or European authorities
- Private keys are NEVER public

These are test certificates only. Never use in production.
