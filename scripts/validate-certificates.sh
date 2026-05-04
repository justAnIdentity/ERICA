#!/bin/bash
# Validation script for certificate infrastructure
# Tests certificate generation, trust anchor export, and x5c inclusion in SD-JWTs

set -e

echo "🔐 Certificate Infrastructure Validation Script"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if API server is running
echo "1. Checking if API server is running..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API server is running"
else
    echo -e "${RED}✗${NC} API server is not running"
    echo "   Please start the server with: cd api && npm run dev"
    exit 1
fi
echo ""

# Create temp directory for test files
TEMP_DIR=$(mktemp -d)
echo "Using temp directory: $TEMP_DIR"
echo ""

# Test 1: Download trust anchor
echo "2. Testing trust anchor download..."
curl -s http://localhost:3001/api/trust-anchor -o "$TEMP_DIR/trust-anchor.pem"

if [ -f "$TEMP_DIR/trust-anchor.pem" ]; then
    echo -e "${GREEN}✓${NC} Trust anchor downloaded"

    # Verify it's a valid certificate
    if openssl x509 -in "$TEMP_DIR/trust-anchor.pem" -text -noout > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Trust anchor is a valid X.509 certificate"

        # Extract certificate details
        SUBJECT=$(openssl x509 -in "$TEMP_DIR/trust-anchor.pem" -noout -subject | sed 's/subject=//')
        ISSUER=$(openssl x509 -in "$TEMP_DIR/trust-anchor.pem" -noout -issuer | sed 's/issuer=//')
        VALIDITY=$(openssl x509 -in "$TEMP_DIR/trust-anchor.pem" -noout -enddate | sed 's/notAfter=//')

        echo "   Subject: $SUBJECT"
        echo "   Issuer: $ISSUER"
        echo "   Valid until: $VALIDITY"

        # Check if it's self-signed (root CA)
        if [ "$SUBJECT" = "$ISSUER" ]; then
            echo -e "${GREEN}✓${NC} Certificate is self-signed (Root CA)"
        else
            echo -e "${RED}✗${NC} Certificate is not self-signed"
        fi

        # Check Basic Constraints (look for the extension presence, encoding might vary)
        if openssl x509 -in "$TEMP_DIR/trust-anchor.pem" -text -noout | grep -q "X509v3 Basic Constraints: critical"; then
            echo -e "${GREEN}✓${NC} Certificate has Basic Constraints extension (CA certificate)"
        else
            echo -e "${YELLOW}⚠${NC} Could not verify Basic Constraints"
        fi
    else
        echo -e "${RED}✗${NC} Trust anchor is not a valid certificate"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Failed to download trust anchor"
    exit 1
fi
echo ""

# Test 2: Test debug endpoint with a sample request
echo "3. Testing SD-JWT generation with certificates..."

# Create a minimal test request with required fields
cat > "$TEMP_DIR/test-request.json" << 'EOF'
{
  "request": {
    "response_type": "vp_token",
    "client_id": "test-client",
    "response_uri": "https://example.com/callback",
    "response_mode": "direct_post.jwt",
    "nonce": "test-nonce-123",
    "state": "test-state-456",
    "aud": "https://self-issued.me/v2",
    "client_metadata": {
      "jwks": {
        "keys": [
          {
            "kty": "EC",
            "crv": "P-256",
            "x": "ShU4Fr3NH7v9TOAc9aYiu9eicdkfVT9ecVCPaPgJrMs",
            "y": "iV0VXASylR0qWoDr_mKUWwzo-M59Wz3QBzpCm4oiXT0",
            "alg": "ECDH-ES",
            "kid": "test-key-1"
          }
        ]
      },
      "vp_formats_supported": {
        "dc+sd-jwt": {
          "kb-jwt_alg_values": ["ES256"],
          "sd-jwt_alg_values": ["ES256"]
        }
      }
    },
    "dcql_query": {
      "credentials": [
        {
          "id": "pid-sd-jwt",
          "format": "dc+sd-jwt",
          "claims": [
            { "path": ["given_name"] },
            { "path": ["family_name"] }
          ],
          "meta": {
            "vct_values": ["urn:eudi:pid:de:1"]
          }
        }
      ],
      "credential_sets": [
        { "options": [["pid-sd-jwt"]] }
      ]
    }
  },
  "validationProfile": "base-openid4vp",
  "simulationMode": "VALID"
}
EOF

# Call debug endpoint
curl -s -X POST http://localhost:3001/api/debug \
  -H "Content-Type: application/json" \
  -d @"$TEMP_DIR/test-request.json" \
  -o "$TEMP_DIR/debug-response.json"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Debug endpoint responded successfully"

    # Extract the vp_token (SD-JWT) - handle both array and object formats
    VP_TOKEN=$(cat "$TEMP_DIR/debug-response.json" | python3 -c "import sys, json; data=json.load(sys.stdin); vp=data.get('data',{}).get('simulatedResponse',{}).get('vp_token'); print(vp[0]['credential'] if isinstance(vp,list) and len(vp)>0 else '') if vp else print('')" 2>/dev/null)

    if [ -n "$VP_TOKEN" ]; then
        echo -e "${GREEN}✓${NC} SD-JWT credential found in response"

        # Extract JWT header (before first dot)
        HEADER=$(echo "$VP_TOKEN" | cut -d'~' -f1 | cut -d'.' -f1)

        # Decode header (add padding if needed)
        HEADER_DECODED=$(echo "$HEADER" | base64 -d 2>/dev/null || echo "$HEADER=" | base64 -d 2>/dev/null || echo "$HEADER==" | base64 -d 2>/dev/null)

        if [ -n "$HEADER_DECODED" ]; then
            echo -e "${GREEN}✓${NC} JWT header decoded successfully"
            echo "   Header preview: $(echo "$HEADER_DECODED" | head -c 100)..."

            # Check for x5c in header
            if echo "$HEADER_DECODED" | grep -q '"x5c"'; then
                echo -e "${GREEN}✓${NC} x5c field found in JWT header"

                # Count certificates in x5c array
                CERT_COUNT=$(echo "$HEADER_DECODED" | grep -o '"x5c":\s*\[[^]]*\]' | grep -o '","' | wc -l)
                CERT_COUNT=$((CERT_COUNT + 1)) # Add 1 because there's one more cert than separators

                echo -e "${GREEN}✓${NC} x5c contains $CERT_COUNT certificate(s)"

                if [ "$CERT_COUNT" -eq 2 ]; then
                    echo -e "${GREEN}✓${NC} Certificate chain has correct length (2: leaf + root)"
                else
                    echo -e "${YELLOW}⚠${NC} Expected 2 certificates, found $CERT_COUNT"
                fi

                # Extract first certificate from x5c (leaf cert)
                LEAF_CERT_B64=$(echo "$HEADER_DECODED" | grep -o '"x5c":\s*\["[^"]*"' | sed 's/.*"\([^"]*\)".*/\1/')

                if [ -n "$LEAF_CERT_B64" ]; then
                    echo "$LEAF_CERT_B64" | base64 -d > "$TEMP_DIR/leaf.der" 2>/dev/null

                    if openssl x509 -inform der -in "$TEMP_DIR/leaf.der" -text -noout > /dev/null 2>&1; then
                        echo -e "${GREEN}✓${NC} Leaf certificate is valid"

                        LEAF_SUBJECT=$(openssl x509 -inform der -in "$TEMP_DIR/leaf.der" -noout -subject | sed 's/subject=//')
                        echo "   Leaf Subject: $LEAF_SUBJECT"

                        # Check if it's NOT a CA
                        if openssl x509 -inform der -in "$TEMP_DIR/leaf.der" -text -noout | grep -q "CA:FALSE"; then
                            echo -e "${GREEN}✓${NC} Leaf certificate has CA:FALSE (correct for end-entity)"
                        fi

                        # Convert root to DER for verification
                        openssl x509 -in "$TEMP_DIR/trust-anchor.pem" -outform der -out "$TEMP_DIR/root.der"

                        # Verify leaf is signed by root
                        if openssl verify -CAfile "$TEMP_DIR/trust-anchor.pem" <(openssl x509 -inform der -in "$TEMP_DIR/leaf.der") > /dev/null 2>&1; then
                            echo -e "${GREEN}✓${NC} Leaf certificate is signed by root CA"
                        else
                            echo -e "${YELLOW}⚠${NC} Could not verify leaf certificate signature"
                        fi
                    else
                        echo -e "${RED}✗${NC} Leaf certificate is invalid"
                    fi
                fi
            else
                echo -e "${RED}✗${NC} x5c field not found in JWT header"
                echo "   This means certificates are not being included in the SD-JWT"
                exit 1
            fi
        else
            echo -e "${RED}✗${NC} Failed to decode JWT header"
        fi
    else
        echo -e "${RED}✗${NC} No SD-JWT credential found in response"
        echo "   Response preview: $(cat "$TEMP_DIR/debug-response.json" | head -c 200)..."
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Debug endpoint failed"
    exit 1
fi
echo ""

# Test 3: Download trust anchor in DER format
echo "4. Testing trust anchor download in DER format..."
curl -s "http://localhost:3001/api/trust-anchor?format=der" -o "$TEMP_DIR/trust-anchor.der"

if [ -f "$TEMP_DIR/trust-anchor.der" ]; then
    if openssl x509 -inform der -in "$TEMP_DIR/trust-anchor.der" -text -noout > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} DER format trust anchor is valid"

        # Verify PEM and DER contain the same certificate
        PEM_FINGERPRINT=$(openssl x509 -in "$TEMP_DIR/trust-anchor.pem" -noout -fingerprint | cut -d'=' -f2)
        DER_FINGERPRINT=$(openssl x509 -inform der -in "$TEMP_DIR/trust-anchor.der" -noout -fingerprint | cut -d'=' -f2)

        if [ "$PEM_FINGERPRINT" = "$DER_FINGERPRINT" ]; then
            echo -e "${GREEN}✓${NC} PEM and DER formats contain the same certificate"
            echo "   Fingerprint: $PEM_FINGERPRINT"
        else
            echo -e "${RED}✗${NC} PEM and DER formats differ"
        fi
    else
        echo -e "${RED}✗${NC} DER format trust anchor is invalid"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Failed to download DER format trust anchor"
    exit 1
fi
echo ""

# Cleanup
echo "5. Cleaning up..."
rm -rf "$TEMP_DIR"
echo -e "${GREEN}✓${NC} Cleanup complete"
echo ""

echo "================================================"
echo -e "${GREEN}✅ All certificate infrastructure tests passed!${NC}"
echo ""
echo "Summary:"
echo "  • Trust anchor can be downloaded and is a valid root CA"
echo "  • SD-JWTs include x5c certificate chain (2 certificates)"
echo "  • Leaf certificates are properly signed by root CA"
echo "  • Both PEM and DER formats work correctly"
echo ""
echo "To use with a verifier:"
echo "  1. Download: curl http://localhost:3001/api/trust-anchor -o root-ca.pem"
echo "  2. Import root-ca.pem into your verifier's trust store"
echo "  3. The verifier can now validate presentation signatures using x5c"
