/**
 * PID Presentation Profile
 * 
 * Implements validation for the German PID Presentation (HAIP-aligned) profile.
 * This profile enforces high-assurance identity presentation requirements.
 */

import { BaseValidationProfile, ExtendedAuthorizationRequest } from "./IValidationProfile.js";
import { ValidationCheck, ValidationIssue, Severity, ValidationErrorCategory, SpecReference } from "../types/index.js";

export class PIDPresentationProfile extends BaseValidationProfile {
  name = "PID Presentation (EUDI HAIP)";

  /**
   * PID Presentation syntax validation
   * Enforces high-assurance requirements for PID presentation
   */
  validateSyntax(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Profile";

    // Requirement 1: response_mode must be direct_post.jwt
    if (!request.responseMode) {
      this.addDetailedCheck(
        checks,
        "profile.response_mode.direct_post_jwt",
        "Response Mode HAIP Compliance",
        false,
        category,
        Severity.ERROR,
        {
          subcategory: "PID Presentation Requirements",
          field: "response_mode",
          expectedValue: "direct_post.jwt",
          actualValue: "undefined",
          issue: 'Missing response_mode. Must be "direct_post.jwt" for PID Presentation',
          suggestedFix: 'Set response_mode to "direct_post.jwt"',
          specReference: { spec: "EUDI-ARF", quotation: "High-assurance profiles must use direct_post.jwt" },
        }
      );
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "response_mode",
        issue: 'PID Presentation requires response_mode: "direct_post.jwt"',
        severity: Severity.ERROR,
        specReference: { spec: "EUDI-ARF" },
        suggestedFix: 'Set response_mode to "direct_post.jwt"',
      });
    } else if (request.responseMode !== "direct_post.jwt") {
      this.addDetailedCheck(
        checks,
        "profile.response_mode.direct_post_jwt",
        "Response Mode HAIP Compliance",
        false,
        category,
        Severity.ERROR,
        {
          subcategory: "PID Presentation Requirements",
          field: "response_mode",
          expectedValue: "direct_post.jwt",
          actualValue: request.responseMode,
          issue: `Invalid response_mode for PID Presentation: must be "direct_post.jwt", got: ${request.responseMode}`,
          suggestedFix: 'Change response_mode to "direct_post.jwt"',
          specReference: { spec: "EUDI-ARF", quotation: "High-assurance profiles must use direct_post.jwt" },
        }
      );
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "response_mode",
        issue: `PID Presentation requires direct_post.jwt, got: ${request.responseMode}`,
        severity: Severity.ERROR,
        specReference: { spec: "EUDI-ARF" },
        suggestedFix: 'Change response_mode to "direct_post.jwt"',
      });
    } else {
      this.addDetailedCheck(
        checks,
        "profile.response_mode.direct_post_jwt",
        "Response Mode HAIP Compliance",
        true,
        category,
        Severity.ERROR,
        {
          subcategory: "PID Presentation Requirements",
          field: "response_mode",
          expectedValue: "direct_post.jwt",
          actualValue: request.responseMode,
          details: "response_mode is HAIP compliant",
        }
      );
    }

    // Requirement 2: client_id must use x509_hash: scheme
    if (request.clientId) {
      if (!request.clientId.startsWith("x509_hash:")) {
        this.addDetailedCheck(
          checks,
          "profile.client_id.x509_hash",
          "Client ID x509_hash Scheme (PID)",
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "PID Presentation Requirements",
            field: "client_id",
            expectedValue: "x509_hash:<hash>",
            actualValue: request.clientId,
            issue: `PID Presentation requires x509_hash: scheme for client_id`,
            suggestedFix: "Use x509_hash:<certificate_hash> format",
            specReference: { spec: "EUDI-ARF", section: "3.1" },
          }
        );
        issues.push({
          category: ValidationErrorCategory.PROFILE_VIOLATION,
          field: "client_id",
          issue: "PID Presentation requires x509_hash: scheme",
          severity: Severity.ERROR,
          specReference: { spec: "EUDI-ARF" },
          suggestedFix: "Use x509_hash:<certificate_hash> format",
        });
      } else {
        this.addDetailedCheck(
          checks,
          "profile.client_id.x509_hash",
          "Client ID x509_hash Scheme (PID)",
          true,
          category,
          Severity.ERROR,
          {
            subcategory: "PID Presentation Requirements",
            field: "client_id",
            expectedValue: "x509_hash:<hash>",
            actualValue: request.clientId,
            details: "client_id uses required x509_hash scheme",
          }
        );
      }
    }
  }

  /**
   * PID Presentation semantic validation
   * Enforces PID-specific credential and format requirements
   */
  validateSemantics(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Profile";

    // Requirement 1: verifier_info presence (identifies the RP)
    if (!request.verifierInfo) {
      this.addDetailedCheck(
        checks,
        "profile.verifier_info.presence",
        "Verifier Info Presence (PID)",
        false,
        category,
        Severity.WARNING,
        {
          subcategory: "PID Presentation Requirements",
          field: "verifier_info",
          expectedValue: "verifier_info object",
          actualValue: "undefined",
          issue: "PID Presentation requires verifier_info to identify the RP",
          suggestedFix: "Add verifier_info with organization name and logo",
          specReference: { spec: "EUDI-ARF", section: "3.2" },
        }
      );
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "verifier_info",
        issue: "PID Presentation requires verifier_info",
        severity: Severity.WARNING,
        specReference: { spec: "EUDI-ARF" },
        suggestedFix: "Add verifier_info with organization details",
      });
    } else {
      this.addDetailedCheck(
        checks,
        "profile.verifier_info.presence",
        "Verifier Info Presence (PID)",
        true,
        category,
        Severity.WARNING,
        {
          subcategory: "PID Presentation Requirements",
          field: "verifier_info",
          expectedValue: "verifier_info object",
          actualValue: "Present",
          details: "Verifier information is present for RP identification",
        }
      );
    }

    // Requirement 2: VP formats must be specified for SD-JWT and/or mDoc
    if (request.clientMetadata?.vpFormatsSupported) {
      const formats = request.clientMetadata.vpFormatsSupported;
      const hasSDJWT = formats["dc+sd-jwt"] || formats["sd-jwt"];
      const hasMDoc = formats["mso_mdoc"] || formats["vc+sd-jwt"];

      if (!hasSDJWT && !hasMDoc) {
        this.addDetailedCheck(
          checks,
          "profile.vp_formats.sd_jwt",
          "VP Formats Support (PID)",
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "PID Presentation Requirements",
            field: "client_metadata.vp_formats_supported",
            expectedValue: '"dc+sd-jwt" or "mso_mdoc"',
            actualValue: Object.keys(formats).join(", "),
            issue: "PID Presentation requires SD-JWT and/or mDoc format support",
            suggestedFix: 'Add "dc+sd-jwt" and/or "mso_mdoc" to vp_formats_supported',
            specReference: { spec: "EUDI-ARF", section: "3.2" },
          }
        );
        issues.push({
          category: ValidationErrorCategory.PROFILE_VIOLATION,
          field: "client_metadata.vp_formats_supported",
          issue: "PID Presentation requires SD-JWT and/or mDoc support",
          severity: Severity.ERROR,
          specReference: { spec: "EUDI-ARF" },
          suggestedFix: 'Add "dc+sd-jwt" and/or "mso_mdoc"',
        });
      } else {
        this.addDetailedCheck(
          checks,
          "profile.vp_formats.sd_jwt",
          "VP Formats Support (PID)",
          true,
          category,
          Severity.ERROR,
          {
            subcategory: "PID Presentation Requirements",
            field: "client_metadata.vp_formats_supported",
            expectedValue: '"dc+sd-jwt" or "mso_mdoc"',
            actualValue: (hasSDJWT ? "SD-JWT " : "") + (hasMDoc ? "mDoc" : ""),
            details: "Required PID formats are supported",
          }
        );
      }
    }

    // Requirement 3: aud (audience) must be present for key binding validation
    if (!request.aud) {
      this.addDetailedCheck(
        checks,
        "profile.aud.presence",
        "Audience (aud) Presence (PID)",
        false,
        category,
        Severity.WARNING,
        {
          subcategory: "PID Presentation Requirements",
          field: "aud",
          expectedValue: 'aud claim (e.g., "https://self-issued.me/v2")',
          actualValue: "undefined",
          issue: "PID Presentation recommends aud for key binding validation",
          suggestedFix: 'Add aud claim (typically "https://self-issued.me/v2" or RP identifier)',
          specReference: { spec: "EUDI-ARF", section: "4.1" },
        }
      );
    } else {
      this.addDetailedCheck(
        checks,
        "profile.aud.presence",
        "Audience (aud) Presence (PID)",
        true,
        category,
        Severity.WARNING,
        {
          subcategory: "PID Presentation Requirements",
          field: "aud",
          expectedValue: "aud claim",
          actualValue: request.aud,
          details: "Audience is present for key binding",
        }
      );
    }
  }
}
