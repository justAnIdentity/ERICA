/**
 * Base OpenID4VP Profile
 * 
 * Implements validation for the base OpenID4VP specification.
 * This profile has minimal requirements - core OpenID4VP semantics only.
 */

import { BaseValidationProfile, ExtendedAuthorizationRequest } from "./IValidationProfile.js";
import { ValidationCheck, ValidationIssue, Severity, ValidationErrorCategory, SpecReference } from "../types/index.js";

export class BaseOpenID4VPProfile extends BaseValidationProfile {
  name = "OpenID4VP Base";

  /**
   * Base OpenID4VP syntax validation
   * Minimal profile-specific requirements - mostly relies on core validation
   */
  validateSyntax(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    // Base OpenID4VP doesn't require response_mode - it's optional
    // No profile-specific syntax requirements beyond core

    // Document that base profile is permissive
    if (!request.responseMode) {
      this.addDetailedCheck(
        checks,
        "profile.base.response_mode.optional",
        "Response Mode (Optional for Base Profile)",
        true,
        "Profile",
        Severity.WARNING,
        {
          subcategory: "Base OpenID4VP",
          field: "response_mode",
          expectedValue: "Any value or undefined",
          actualValue: request.responseMode || "undefined",
          details: "response_mode is optional in base OpenID4VP profile",
        }
      );
    }
  }

  /**
   * Base OpenID4VP semantic validation
   * Uses DCQL query format
   */
  validateSemantics(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    // Base profile uses DCQL format
    // No additional constraints beyond core semantic validation

    const category = "Profile";
    if (request.dcqlQuery) {
      this.addDetailedCheck(
        checks,
        "profile.base.query_format.dcql",
        "Query Format (DCQL)",
        true,
        category,
        Severity.WARNING,
        {
          subcategory: "Base OpenID4VP",
          field: "dcql_query",
          expectedValue: "dcql_query",
          actualValue: "dcql_query present",
          details: "Base profile supports DCQL format",
        }
      );
    } else {
      this.addDetailedCheck(
        checks,
        "profile.base.query_format.missing",
        "Query Format Missing",
        false,
        category,
        Severity.ERROR,
        {
          subcategory: "Base OpenID4VP",
          field: "dcql_query",
          expectedValue: "dcql_query",
          actualValue: "missing",
          details: "dcql_query is required",
        }
      );
    }
  }
}
