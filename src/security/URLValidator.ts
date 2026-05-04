/**
 * URL Validator for SSRF Protection
 * Validates URLs before making HTTP requests to prevent Server-Side Request Forgery
 *
 * Blocks:
 * - Private IP addresses (localhost, RFC1918, link-local)
 * - Cloud metadata endpoints
 * - Non-HTTPS protocols (with configurable exception for development)
 */

import { ValidationCheck, Severity } from "../types/index.js";

export interface URLValidationResult {
  valid: boolean;
  url?: URL;
  checks: ValidationCheck[];
  errors: string[];
}

export class URLValidator {
  // Private IP ranges per RFC1918 and other reserved ranges
  private static readonly PRIVATE_IP_RANGES = [
    // Loopback
    { start: '127.0.0.0', end: '127.255.255.255', name: 'Loopback (127.0.0.0/8)' },
    // Private Class A
    { start: '10.0.0.0', end: '10.255.255.255', name: 'Private Class A (10.0.0.0/8)' },
    // Private Class B
    { start: '172.16.0.0', end: '172.31.255.255', name: 'Private Class B (172.16.0.0/12)' },
    // Private Class C
    { start: '192.168.0.0', end: '192.168.255.255', name: 'Private Class C (192.168.0.0/16)' },
    // Link-local
    { start: '169.254.0.0', end: '169.254.255.255', name: 'Link-local (169.254.0.0/16)' },
    // Multicast
    { start: '224.0.0.0', end: '239.255.255.255', name: 'Multicast (224.0.0.0/4)' },
  ];

  // Cloud metadata endpoints
  private static readonly CLOUD_METADATA_IPS = [
    '169.254.169.254', // AWS, Azure, GCP
    'fd00:ec2::254',   // AWS IPv6
  ];

  // Localhost variants
  private static readonly LOCALHOST_NAMES = [
    'localhost',
    'localhost.localdomain',
    '0.0.0.0',
    '::1',
    '::',
  ];

  /**
   * Validate a URL before making HTTP request
   * @param urlString The URL to validate
   * @param allowHttp Allow HTTP in development (default: false)
   */
  static async validate(
    urlString: string,
    allowHttp: boolean = false
  ): Promise<URLValidationResult> {
    const checks: ValidationCheck[] = [];
    const errors: string[] = [];

    try {
      // Parse URL
      let url: URL;
      try {
        url = new URL(urlString);
      } catch (e) {
        const error = `Invalid URL format: ${e instanceof Error ? e.message : String(e)}`;
        errors.push(error);
        checks.push({
          checkId: 'ssrf.url.parse',
          checkName: 'URL Parse',
          passed: false,
          category: 'Security',
          severity: Severity.ERROR,
          issue: error,
        });
        return { valid: false, checks, errors };
      }

      // Check protocol
      const protocolCheck = this.validateProtocol(url, allowHttp);
      checks.push(protocolCheck);
      if (!protocolCheck.passed) {
        errors.push(protocolCheck.issue || 'Invalid protocol');
        return { valid: false, url, checks, errors };
      }

      // Check hostname
      const hostnameCheck = await this.validateHostname(url);
      checks.push(...hostnameCheck.checks);
      if (!hostnameCheck.valid) {
        errors.push(...hostnameCheck.errors);
        return { valid: false, url, checks, errors };
      }

      // All checks passed
      checks.push({
        checkId: 'ssrf.validation.success',
        checkName: 'URL Validation Success',
        passed: true,
        category: 'Security',
        severity: Severity.WARNING,
        details: `URL is safe to fetch: ${urlString}`,
      });

      return { valid: true, url, checks, errors: [] };

    } catch (error) {
      const errorMsg = `URL validation error: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      checks.push({
        checkId: 'ssrf.validation.error',
        checkName: 'URL Validation Error',
        passed: false,
        category: 'Security',
        severity: Severity.ERROR,
        issue: errorMsg,
      });
      return { valid: false, checks, errors };
    }
  }

  /**
   * Validate URL protocol
   */
  private static validateProtocol(url: URL, allowHttp: boolean): ValidationCheck {
    if (url.protocol === 'https:') {
      return {
        checkId: 'ssrf.protocol.https',
        checkName: 'HTTPS Protocol',
        passed: true,
        category: 'Security',
        severity: Severity.WARNING,
        details: 'Using secure HTTPS protocol',
      };
    }

    if (url.protocol === 'http:' && allowHttp) {
      return {
        checkId: 'ssrf.protocol.http',
        checkName: 'HTTP Protocol (Development)',
        passed: true,
        category: 'Security',
        severity: Severity.WARNING,
        issue: 'Using insecure HTTP protocol - allowed in development only',
        suggestedFix: 'Use HTTPS in production',
      };
    }

    return {
      checkId: 'ssrf.protocol.invalid',
      checkName: 'Invalid Protocol',
      passed: false,
      category: 'Security',
      severity: Severity.ERROR,
      issue: `Protocol '${url.protocol}' not allowed. Only HTTPS is permitted.`,
      suggestedFix: 'Use https:// protocol',
      specReference: {
        spec: 'OpenID4VP',
        section: '6.1',
        url: 'https://openid.net/specs/openid-4-verifiable-presentations-1_0.html',
      },
    };
  }

  /**
   * Validate hostname is not pointing to private/internal resources
   */
  private static async validateHostname(url: URL): Promise<{
    valid: boolean;
    checks: ValidationCheck[];
    errors: string[];
  }> {
    const checks: ValidationCheck[] = [];
    const errors: string[] = [];
    const hostname = url.hostname.toLowerCase();

    // Check for localhost names
    if (this.LOCALHOST_NAMES.includes(hostname)) {
      const error = `Hostname '${hostname}' is localhost - not allowed`;
      errors.push(error);
      checks.push({
        checkId: 'ssrf.hostname.localhost',
        checkName: 'Localhost Detection',
        passed: false,
        category: 'Security',
        severity: Severity.ERROR,
        issue: error,
        suggestedFix: 'Use a public hostname, not localhost',
      });
      return { valid: false, checks, errors };
    }

    // Resolve hostname to IP address
    let ipAddress: string;
    try {
      // Use dns.promises.lookup for Node.js DNS resolution
      const dns = await import('dns');
      const { address } = await dns.promises.lookup(hostname);
      ipAddress = address;

      checks.push({
        checkId: 'ssrf.hostname.resolve',
        checkName: 'Hostname Resolution',
        passed: true,
        category: 'Security',
        severity: Severity.WARNING,
        details: `Resolved ${hostname} to ${ipAddress}`,
      });
    } catch (e) {
      const error = `Failed to resolve hostname '${hostname}': ${e instanceof Error ? e.message : String(e)}`;
      errors.push(error);
      checks.push({
        checkId: 'ssrf.hostname.resolve',
        checkName: 'Hostname Resolution',
        passed: false,
        category: 'Security',
        severity: Severity.ERROR,
        issue: error,
      });
      return { valid: false, checks, errors };
    }

    // Check if IP is private or reserved
    const ipCheck = this.validateIPAddress(ipAddress);
    checks.push(ipCheck);
    if (!ipCheck.passed) {
      errors.push(ipCheck.issue || 'IP address not allowed');
      return { valid: false, checks, errors };
    }

    return { valid: true, checks, errors: [] };
  }

  /**
   * Check if IP address is private or reserved
   */
  private static validateIPAddress(ip: string): ValidationCheck {
    // Check cloud metadata IPs
    if (this.CLOUD_METADATA_IPS.includes(ip)) {
      return {
        checkId: 'ssrf.ip.cloud_metadata',
        checkName: 'Cloud Metadata IP Blocked',
        passed: false,
        category: 'Security',
        severity: Severity.ERROR,
        issue: `IP address ${ip} is a cloud metadata endpoint - blocked for security`,
        suggestedFix: 'Do not access cloud metadata endpoints',
      };
    }

    // Check private IP ranges
    if (this.isIPv4(ip)) {
      const privateRange = this.isPrivateIPv4(ip);
      if (privateRange) {
        return {
          checkId: 'ssrf.ip.private',
          checkName: 'Private IP Address Blocked',
          passed: false,
          category: 'Security',
          severity: Severity.ERROR,
          issue: `IP address ${ip} is in private range ${privateRange} - not allowed`,
          suggestedFix: 'Use a public IP address',
        };
      }
    }

    // Check IPv6 private ranges
    if (this.isIPv6(ip)) {
      if (this.isPrivateIPv6(ip)) {
        return {
          checkId: 'ssrf.ip.private_ipv6',
          checkName: 'Private IPv6 Address Blocked',
          passed: false,
          category: 'Security',
          severity: Severity.ERROR,
          issue: `IPv6 address ${ip} is private/link-local - not allowed`,
          suggestedFix: 'Use a public IPv6 address',
        };
      }
    }

    return {
      checkId: 'ssrf.ip.public',
      checkName: 'Public IP Address',
      passed: true,
      category: 'Security',
      severity: Severity.WARNING,
      details: `IP address ${ip} is public and allowed`,
    };
  }

  /**
   * Check if string is IPv4 address
   */
  private static isIPv4(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(ip);
  }

  /**
   * Check if string is IPv6 address
   */
  private static isIPv6(ip: string): boolean {
    return ip.includes(':');
  }

  /**
   * Check if IPv4 address is private
   * Returns the name of the private range if private, null if public
   */
  private static isPrivateIPv4(ip: string): string | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => p < 0 || p > 255)) {
      return null;
    }

    const ipNum = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];

    for (const range of this.PRIVATE_IP_RANGES) {
      const startParts = range.start.split('.').map(Number);
      const endParts = range.end.split('.').map(Number);

      const startNum = (startParts[0] << 24) + (startParts[1] << 16) + (startParts[2] << 8) + startParts[3];
      const endNum = (endParts[0] << 24) + (endParts[1] << 16) + (endParts[2] << 8) + endParts[3];

      if (ipNum >= startNum && ipNum <= endNum) {
        return range.name;
      }
    }

    return null;
  }

  /**
   * Check if IPv6 address is private/link-local
   */
  private static isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();

    // Link-local (fe80::/10)
    if (lower.startsWith('fe80:')) return true;

    // Unique local (fc00::/7)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

    // Loopback (::1)
    if (lower === '::1') return true;

    // Unspecified (::)
    if (lower === '::') return true;

    return false;
  }
}

export default URLValidator;
