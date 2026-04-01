/**
 * Claim Name Mapper
 * 
 * Handles format-specific claim naming differences between SD-JWT and mDoc.
 * 
 * SD-JWT PID uses: "birthdate" (per SD-JWT VC IETF convention)
 * mDoc PID uses:   "birth_date" (per ISO 18013-5 / EU PID mDoc namespace)
 * 
 * This mapper normalizes claim names so that validation logic can compare
 * claims across formats without false mismatches.
 */

export type CredentialFormatType = "sd-jwt" | "mdoc" | "unknown";

/**
 * Bidirectional mapping between SD-JWT and mDoc claim names.
 * Only claims that differ between formats need to be listed here.
 */
const SDJWT_TO_MDOC: Record<string, string> = {
  "birthdate": "birth_date",
  "issuance_date": "issue_date",
};

const MDOC_TO_SDJWT: Record<string, string> = Object.fromEntries(
  Object.entries(SDJWT_TO_MDOC).map(([k, v]) => [v, k])
);

/**
 * Normalize a claim name to the canonical (SD-JWT) form.
 * This allows consistent comparison regardless of source format.
 */
export function normalizeClaimName(claimName: string): string {
  return MDOC_TO_SDJWT[claimName] ?? claimName;
}

/**
 * Convert a claim name to its SD-JWT form.
 */
export function toSDJWTClaimName(claimName: string): string {
  return MDOC_TO_SDJWT[claimName] ?? claimName;
}

/**
 * Convert a claim name to its mDoc form.
 */
export function toMDocClaimName(claimName: string): string {
  return SDJWT_TO_MDOC[claimName] ?? claimName;
}

/**
 * Detect credential format from common indicators.
 */
export function detectFormatFromClaims(claims: string[]): CredentialFormatType {
  if (claims.some(c => c in MDOC_TO_SDJWT)) return "mdoc";
  if (claims.some(c => c in SDJWT_TO_MDOC)) return "sd-jwt";
  return "unknown";
}

/**
 * Check if two claim names refer to the same logical claim,
 * accounting for format-specific naming differences.
 */
export function claimNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return normalizeClaimName(a) === normalizeClaimName(b);
}
