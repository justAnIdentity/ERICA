/**
 * Validation Profile Interface
 * 
 * Profiles define validation rule-sets for different presentation request types.
 * Each profile encapsulates the constraints and requirements specific to that profile.
 */

import { ValidationCheck, ValidationIssue, Severity } from "../types/index.js";

export interface ExtendedAuthorizationRequest {
  clientId?: string;
  responseType?: string;
  responseUri?: string;
  responseMode?: string;
  nonce?: string;
  state?: string;
  dcqlQuery?: any;
  clientMetadata?: any;
  aud?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
  verifierInfo?: any;
  [key: string]: any;
}

/**
 * Hook methods that profiles can implement to customize validation.
 * Each hook receives the request and the validator's checks/issues arrays.
 */
export interface IValidationProfile {
  /**
   * Profile name for identification and logging
   */
  name: string;

  /**
   * Profile-specific syntax validation hooks
   * Called after core syntax validation; can add warnings/errors
   */
  validateSyntax(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void;

  /**
   * Profile-specific semantic validation hooks
   * Called after core semantic validation; can add warnings/errors
   */
  validateSemantics(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void;

  /**
   * Helper to add a detailed check (delegated from validator)
   */
  addDetailedCheck(
    checks: ValidationCheck[],
    checkId: string,
    checkName: string,
    passed: boolean,
    category: string,
    severity: Severity,
    options?: {
      subcategory?: string;
      field?: string;
      expectedValue?: string;
      actualValue?: string;
      details?: string;
      issue?: string;
      suggestedFix?: string;
      specReference?: any;
    }
  ): void;
}

/**
 * Base implementation that profiles can extend
 */
export abstract class BaseValidationProfile implements IValidationProfile {
  abstract name: string;

  validateSyntax(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    // Default: no profile-specific syntax checks
  }

  validateSemantics(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    // Default: no profile-specific semantic checks
  }

  addDetailedCheck(
    checks: ValidationCheck[],
    checkId: string,
    checkName: string,
    passed: boolean,
    category: string,
    severity: Severity,
    options?: {
      subcategory?: string;
      field?: string;
      expectedValue?: string;
      actualValue?: string;
      details?: string;
      issue?: string;
      suggestedFix?: string;
      specReference?: any;
    }
  ): void {
    checks.push({
      checkId,
      checkName,
      passed,
      category,
      subcategory: options?.subcategory,
      field: options?.field,
      expectedValue: options?.expectedValue,
      actualValue: options?.actualValue,
      details: options?.details,
      severity,
      issue: passed ? undefined : options?.issue,
      suggestedFix: passed ? undefined : options?.suggestedFix,
      specReference: passed ? undefined : options?.specReference,
    });
  }
}
