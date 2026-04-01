/**
 * Presentation Request URL Parser and Validator
 * Handles OpenID4VP URLs in various formats:
 * - openid4vp:// custom scheme
 * - https:// authorization endpoint
 * - Request by reference (request_uri)
 * - Request by value (request parameter with JWT)
 */

import { AuthorizationRequest, ValidationCheck, Severity } from "../types/index.js";

export interface URLParseResult {
  success: boolean;
  request?: AuthorizationRequest;
  rawUrl?: string;
  urlType?: 'openid4vp' | 'https' | 'request_uri' | 'request_object';
  checks: ValidationCheck[];
  errors: string[];
}

export class PresentationRequestURLParser {
  /**
   * Parse and validate an OpenID4VP URL
   */
  async parseURL(url: string): Promise<URLParseResult> {
    const checks: ValidationCheck[] = [];
    const errors: string[] = [];

    try {
      // Normalize URL (handle QR code payloads that might have extra whitespace)
      const normalizedUrl = url.trim();

      // Check URL scheme
      const schemeCheck = this.validateScheme(normalizedUrl);
      checks.push(schemeCheck);

      if (!schemeCheck.passed) {
        errors.push(schemeCheck.issue || "Invalid URL scheme");
        return { success: false, checks, errors, rawUrl: normalizedUrl };
      }

      // Parse URL
      let parsedUrl: URL;
      try {
        // Handle custom openid4vp:// scheme by converting to parseable format
        // openid4vp://?param=value becomes https://placeholder/?param=value
        let parseableUrl = normalizedUrl;
        if (normalizedUrl.startsWith('openid4vp://')) {
          parseableUrl = normalizedUrl.replace('openid4vp://', 'https://placeholder/');
        } else if (normalizedUrl.startsWith('openid://')) {
          parseableUrl = normalizedUrl.replace('openid://', 'https://placeholder/');
        }
        parsedUrl = new URL(parseableUrl);
      } catch (e) {
        errors.push(`Malformed URL: ${e instanceof Error ? e.message : String(e)}`);
        checks.push({
          checkId: "url.parse.validity",
          checkName: "URL Parse Validity",
          passed: false,
          category: "Syntax",
          severity: Severity.ERROR,
          issue: "URL cannot be parsed",
          details: e instanceof Error ? e.message : String(e),
        });
        return { success: false, checks, errors, rawUrl: normalizedUrl };
      }

      const searchParams = parsedUrl.searchParams;

      // Check for request_uri (request by reference)
      if (searchParams.has('request_uri')) {
        const requestUriCheck = this.createCheck(
          "url.request_uri.present",
          "Request URI Present",
          true,
          "Delivery",
          "Request by reference using request_uri parameter"
        );
        checks.push(requestUriCheck);

        const requestUri = searchParams.get('request_uri')!;
        const result = await this.fetchRequestObject(requestUri, checks);

        if (result.success && result.request) {
          return {
            success: true,
            request: result.request,
            rawUrl: normalizedUrl,
            urlType: 'request_uri',
            checks,
            errors: [],
          };
        } else {
          errors.push(...(result.errors || []));
          return { success: false, checks, errors, rawUrl: normalizedUrl };
        }
      }

      // Check for request parameter (JWT with request object)
      if (searchParams.has('request')) {
        const requestParamCheck = this.createCheck(
          "url.request_param.present",
          "Request Parameter Present",
          true,
          "Delivery",
          "Request by value using request parameter (JWT)"
        );
        checks.push(requestParamCheck);

        const requestJwt = searchParams.get('request')!;
        const result = await this.parseRequestJWT(requestJwt, checks);

        if (result.success && result.request) {
          return {
            success: true,
            request: result.request,
            rawUrl: normalizedUrl,
            urlType: 'request_object',
            checks,
            errors: [],
          };
        } else {
          errors.push(...(result.errors || []));
          return { success: false, checks, errors, rawUrl: normalizedUrl };
        }
      }

      // Plain URL with query parameters
      const request = this.extractRequestFromQueryParams(parsedUrl, checks);

      if (request) {
        const urlType = normalizedUrl.startsWith('openid4vp://') ? 'openid4vp' : 'https';
        return {
          success: true,
          request,
          rawUrl: normalizedUrl,
          urlType,
          checks,
          errors: [],
        };
      } else {
        errors.push("Could not extract authorization request from URL");
        return { success: false, checks, errors, rawUrl: normalizedUrl };
      }

    } catch (error) {
      errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      checks.push({
        checkId: "url.parse.error",
        checkName: "URL Parse Error",
        passed: false,
        category: "Syntax",
        severity: Severity.ERROR,
        issue: error instanceof Error ? error.message : String(error),
      });
      return { success: false, checks, errors };
    }
  }

  /**
   * Validate URL scheme
   */
  private validateScheme(url: string): ValidationCheck {
    if (url.startsWith('openid4vp://') || url.startsWith('openid://?')) {
      return this.createCheck(
        "url.scheme.custom",
        "Custom URI Scheme",
        true,
        "Protocol",
        "Uses openid4vp:// custom scheme (typical for deep links and QR codes)"
      );
    } else if (url.startsWith('https://')) {
      return this.createCheck(
        "url.scheme.https",
        "HTTPS Scheme",
        true,
        "Protocol",
        "Uses https:// scheme (typical for web-based flows)"
      );
    } else if (url.startsWith('http://')) {
      return {
        checkId: "url.scheme.http",
        checkName: "HTTP Scheme (Insecure)",
        passed: false,
        category: "Protocol",
        severity: Severity.WARNING,
        issue: "Using insecure http:// scheme - should use https:// in production",
        suggestedFix: "Use https:// for security",
      };
    } else {
      return {
        checkId: "url.scheme.invalid",
        checkName: "Invalid Scheme",
        passed: false,
        category: "Protocol",
        severity: Severity.ERROR,
        issue: `Invalid URL scheme. Expected openid4vp://, openid://, or https://`,
        suggestedFix: "Use a valid OpenID4VP URL scheme",
      };
    }
  }

  /**
   * Fetch request object from request_uri
   */
  private async fetchRequestObject(requestUri: string, checks: ValidationCheck[]): Promise<{ success: boolean; request?: AuthorizationRequest; errors?: string[] }> {
    const errors: string[] = [];

    try {
      // Validate request_uri is HTTPS
      if (!requestUri.startsWith('https://')) {
        checks.push({
          checkId: "url.request_uri.https",
          checkName: "Request URI HTTPS",
          passed: false,
          category: "Security",
          severity: Severity.ERROR,
          issue: "request_uri must use HTTPS",
          suggestedFix: "Use HTTPS for request_uri to ensure secure transmission",
          specReference: {
            spec: "OpenID4VP",
            section: "6.1",
            url: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#name-passing-authorization-reque",
          },
        });
        errors.push("request_uri must use HTTPS");
        return { success: false, errors };
      }

      checks.push(this.createCheck(
        "url.request_uri.https",
        "Request URI HTTPS",
        true,
        "Security",
        "request_uri uses HTTPS"
      ));

      // Fetch the JWT from the request_uri
      try {
        const response = await fetch(requestUri, {
          method: 'GET',
          headers: {
            'Accept': 'application/oauth-authz-req+jwt, application/jwt, */*',
          },
        });

        if (!response.ok) {
          checks.push({
            checkId: "url.request_uri.fetch_failed",
            checkName: "Request URI Fetch Failed",
            passed: false,
            category: "Network",
            severity: Severity.ERROR,
            issue: `HTTP ${response.status}: ${response.statusText}`,
            details: `Failed to fetch from ${requestUri}`,
          });
          errors.push(`Failed to fetch request_uri: HTTP ${response.status}`);
          return { success: false, errors };
        }

        checks.push(this.createCheck(
          "url.request_uri.fetch_success",
          "Request URI Fetch Success",
          true,
          "Network",
          `Successfully fetched from ${requestUri}`
        ));

        const contentType = response.headers.get('content-type') || '';
        const jwtString = await response.text();

        // Validate content type
        if (contentType.includes('application/oauth-authz-req+jwt') || contentType.includes('application/jwt')) {
          checks.push(this.createCheck(
            "url.request_uri.content_type",
            "Request URI Content Type",
            true,
            "Protocol",
            `Correct content type: ${contentType}`
          ));
        } else {
          checks.push({
            checkId: "url.request_uri.content_type",
            checkName: "Request URI Content Type",
            passed: false,
            category: "Protocol",
            severity: Severity.WARNING,
            issue: `Expected application/oauth-authz-req+jwt or application/jwt, got ${contentType}`,
            details: "Content type should indicate JWT format",
          });
        }

        // Parse the JWT
        const parseResult = await this.parseRequestJWT(jwtString.trim(), checks);
        return parseResult;

      } catch (fetchError) {
        checks.push({
          checkId: "url.request_uri.fetch_error",
          checkName: "Request URI Fetch Error",
          passed: false,
          category: "Network",
          severity: Severity.ERROR,
          issue: fetchError instanceof Error ? fetchError.message : String(fetchError),
          details: `Failed to fetch from ${requestUri}`,
        });
        errors.push(`Failed to fetch request_uri: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
        return { success: false, errors };
      }

    } catch (error) {
      errors.push(`Unexpected error fetching request_uri: ${error instanceof Error ? error.message : String(error)}`);
      checks.push({
        checkId: "url.request_uri.error",
        checkName: "Request URI Error",
        passed: false,
        category: "Network",
        severity: Severity.ERROR,
        issue: error instanceof Error ? error.message : String(error),
      });
      return { success: false, errors };
    }
  }

  /**
   * Parse JWT from request parameter
   */
  private async parseRequestJWT(jwt: string, checks: ValidationCheck[]): Promise<{ success: boolean; request?: AuthorizationRequest; errors?: string[] }> {
    const errors: string[] = [];

    try {
      // Validate JWT format (3 base64url parts separated by dots)
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        checks.push({
          checkId: "url.request_jwt.format",
          checkName: "Request JWT Format",
          passed: false,
          category: "Syntax",
          severity: Severity.ERROR,
          issue: `Invalid JWT format: expected 3 parts, got ${parts.length}`,
          suggestedFix: "Ensure the request parameter contains a valid JWT (header.payload.signature)",
        });
        errors.push("Invalid JWT format");
        return { success: false, errors };
      }

      checks.push(this.createCheck(
        "url.request_jwt.format",
        "Request JWT Format",
        true,
        "Syntax",
        "JWT has correct structure (3 parts)"
      ));

      // Decode JWT header and payload (without verification for now)
      try {
        // Decode header
        const headerJson = this.base64urlDecode(parts[0]);
        const header = JSON.parse(headerJson);

        checks.push(this.createCheck(
          "url.request_jwt.header_decode",
          "Request JWT Header Decode",
          true,
          "Syntax",
          `JWT header decoded: alg=${header.alg}, typ=${header.typ}`
        ));

        // Validate x5c certificate chain if present
        if (header.x5c) {
          await this.validateCertificateChain(header.x5c, checks);
        } else {
          checks.push({
            checkId: "url.request_jwt.x5c_missing",
            checkName: "X.509 Certificate Chain Missing",
            passed: false,
            category: "Security",
            severity: Severity.WARNING,
            issue: "No x5c header found in JWT - cannot validate RP certificate",
            suggestedFix: "Include x5c header with RP's certificate chain for authentication",
          });
        }

        // Decode payload
        const payloadJson = this.base64urlDecode(parts[1]);
        const payload = JSON.parse(payloadJson);

        checks.push(this.createCheck(
          "url.request_jwt.decode",
          "Request JWT Decode",
          true,
          "Syntax",
          "JWT payload successfully decoded"
        ));

        // Note: Signature verification would happen here in production
        checks.push({
          checkId: "url.request_jwt.signature",
          checkName: "Request JWT Signature Verification",
          passed: false,
          category: "Security",
          severity: Severity.WARNING,
          issue: "JWT signature verification not yet implemented in this debugger",
          suggestedFix: "Implement signature verification using client_metadata.jwks",
        });

        return { success: true, request: payload as AuthorizationRequest };

      } catch (e) {
        checks.push({
          checkId: "url.request_jwt.decode",
          checkName: "Request JWT Decode",
          passed: false,
          category: "Syntax",
          severity: Severity.ERROR,
          issue: `Failed to decode JWT: ${e instanceof Error ? e.message : String(e)}`,
        });
        errors.push("Failed to decode JWT payload");
        return { success: false, errors };
      }

    } catch (error) {
      errors.push(`Failed to parse request JWT: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, errors };
    }
  }

  /**
   * Base64URL decode helper
   */
  private base64urlDecode(str: string): string {
    // Convert base64url to base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    const pad = base64.length % 4;
    if (pad) {
      if (pad === 1) {
        throw new Error('Invalid base64url string');
      }
      base64 += '='.repeat(4 - pad);
    }

    // Decode base64
    if (typeof Buffer !== 'undefined') {
      // Node.js environment
      return Buffer.from(base64, 'base64').toString('utf-8');
    } else {
      // Browser environment
      return atob(base64);
    }
  }

  /**
   * Extract authorization request from URL query parameters
   */
  private extractRequestFromQueryParams(url: URL, checks: ValidationCheck[]): AuthorizationRequest | null {
    const params = url.searchParams;

    // Build request object from query parameters
    const request: any = {};

    // Required parameters
    const requiredParams = ['response_type', 'client_id'];
    for (const param of requiredParams) {
      if (params.has(param)) {
        request[param] = params.get(param);
        checks.push(this.createCheck(
          `url.param.${param}.present`,
          `${param} Present`,
          true,
          "Required Parameters",
          `${param} found in URL`
        ));
      } else {
        checks.push({
          checkId: `url.param.${param}.missing`,
          checkName: `${param} Missing`,
          passed: false,
          category: "Required Parameters",
          severity: Severity.ERROR,
          issue: `Required parameter '${param}' is missing`,
          suggestedFix: `Add ${param} to the URL query parameters`,
        });
        return null;
      }
    }

    // Optional but common parameters
    const optionalParams = [
      'redirect_uri', 'response_uri', 'state', 'nonce', 'response_mode',
      'presentation_definition', 'presentation_definition_uri',
      'client_metadata', 'client_metadata_uri'
    ];

    for (const param of optionalParams) {
      if (params.has(param)) {
        const value = params.get(param)!;

        // Try to parse JSON parameters
        if (['presentation_definition', 'client_metadata'].includes(param)) {
          try {
            request[param] = JSON.parse(value);
            checks.push(this.createCheck(
              `url.param.${param}.parsed`,
              `${param} Parsed`,
              true,
              "Optional Parameters",
              `${param} successfully parsed as JSON`
            ));
          } catch (e) {
            checks.push({
              checkId: `url.param.${param}.parse_error`,
              checkName: `${param} Parse Error`,
              passed: false,
              category: "Optional Parameters",
              severity: Severity.WARNING,
              issue: `Failed to parse ${param} as JSON: ${e instanceof Error ? e.message : String(e)}`,
            });
            request[param] = value; // Store as string
          }
        } else {
          request[param] = value;
        }
      }
    }

    return request as AuthorizationRequest;
  }

  /**
   * Helper to create a passing validation check
   */
  private createCheck(
    checkId: string,
    checkName: string,
    passed: boolean,
    category: string,
    details?: string
  ): ValidationCheck {
    return {
      checkId,
      checkName,
      passed,
      category,
      severity: passed ? Severity.WARNING : Severity.ERROR,
      details,
    };
  }

  /**
   * Validate X.509 certificate chain from x5c header
   */
  private async validateCertificateChain(x5c: string[], checks: ValidationCheck[]): Promise<void> {
    // Check x5c is an array
    if (!Array.isArray(x5c) || x5c.length === 0) {
      checks.push({
        checkId: "url.request_jwt.x5c_invalid",
        checkName: "X.509 Certificate Chain Invalid",
        passed: false,
        category: "Security",
        severity: Severity.ERROR,
        issue: "x5c header must be a non-empty array of base64-encoded certificates",
      });
      return;
    }

    checks.push(this.createCheck(
      "url.request_jwt.x5c_present",
      "X.509 Certificate Chain Present",
      true,
      "Security",
      `Certificate chain contains ${x5c.length} certificate(s)`
    ));

    try {
      // Decode and parse each certificate
      const certificates = x5c.map((cert, idx) => {
        try {
          // Certificates in x5c are base64-encoded DER
          const derBuffer = Buffer.from(cert, 'base64');

          // Convert to PEM format for Node.js crypto APIs
          const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;

          return { pem, derBuffer, index: idx };
        } catch (e) {
          throw new Error(`Certificate ${idx} is not valid base64: ${e instanceof Error ? e.message : String(e)}`);
        }
      });

      checks.push(this.createCheck(
        "url.request_jwt.x5c_decode",
        "Certificate Chain Decode",
        true,
        "Security",
        "All certificates successfully decoded"
      ));

      // Validate each certificate using Node.js crypto
      const crypto = await import('crypto');
      const x509Crypto = await import('crypto');

      for (let i = 0; i < certificates.length; i++) {
        const { pem, index } = certificates[i];

        try {
          // Create X509Certificate object (Node.js v15.6.0+)
          const x509 = new x509Crypto.X509Certificate(pem);

          // Check if certificate is expired
          const validFrom = new Date(x509.validFrom);
          const validTo = new Date(x509.validTo);
          const now = new Date();

          if (now < validFrom) {
            checks.push({
              checkId: `url.request_jwt.x5c_cert_${index}_not_yet_valid`,
              checkName: `Certificate ${index} Not Yet Valid`,
              passed: false,
              category: "Security",
              severity: Severity.ERROR,
              issue: `Certificate is not yet valid. Valid from: ${validFrom.toISOString()}`,
              details: `Subject: ${x509.subject}`,
            });
          } else if (now > validTo) {
            checks.push({
              checkId: `url.request_jwt.x5c_cert_${index}_expired`,
              checkName: `Certificate ${index} Expired`,
              passed: false,
              category: "Security",
              severity: Severity.ERROR,
              issue: `Certificate expired on ${validTo.toISOString()}`,
              details: `Subject: ${x509.subject}`,
            });
          } else {
            checks.push(this.createCheck(
              `url.request_jwt.x5c_cert_${index}_validity`,
              `Certificate ${index} Validity Period`,
              true,
              "Security",
              `Valid from ${validFrom.toISOString()} to ${validTo.toISOString()}`
            ));
          }

          // Extract certificate info
          checks.push(this.createCheck(
            `url.request_jwt.x5c_cert_${index}_parse`,
            `Certificate ${index} Parse`,
            true,
            "Security",
            `Subject: ${x509.subject}, Issuer: ${x509.issuer}`
          ));

        } catch (e) {
          checks.push({
            checkId: `url.request_jwt.x5c_cert_${index}_parse_error`,
            checkName: `Certificate ${index} Parse Error`,
            passed: false,
            category: "Security",
            severity: Severity.ERROR,
            issue: `Failed to parse certificate: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }

      // Note: Trust anchor validation would require external trust list
      checks.push({
        checkId: "url.request_jwt.x5c_trust_anchor",
        checkName: "Trust Anchor Validation",
        passed: false,
        category: "Security",
        severity: Severity.WARNING,
        issue: "Trust anchor validation not implemented - requires configured trust list",
        suggestedFix: "Configure trust list with authorized RP certificates for production use",
      });

    } catch (error) {
      checks.push({
        checkId: "url.request_jwt.x5c_validation_error",
        checkName: "Certificate Chain Validation Error",
        passed: false,
        category: "Security",
        severity: Severity.ERROR,
        issue: `Failed to validate certificate chain: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
