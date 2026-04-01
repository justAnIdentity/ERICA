/**
 * PID Data Generator
 * Generates realistic German PID (Persistent Identifier) credential data
 * Produces the same person each time for debugging consistency
 */

export interface PIDCredentialClaims {
  // Personal identification
  given_name: string;
  family_name: string;
  birthdate: string; // ISO 8601 format: YYYY-MM-DD

  // Address
  address?: {
    street_address?: string;
    postal_code?: string;
    locality?: string;
    country?: string;
  };

  // Additional attributes
  nationalities?: string[];
  gender?: string;
  birth_place?: string;
  birth_country?: string;
  age_over_18?: boolean;
  age_over_21?: boolean;
}

export interface PIDCredentialData {
  id: string;
  format: "dc+sd-jwt" | "mso_mdoc";
  claims: PIDCredentialClaims;
  selectivelyDisclosableClaims?: string[]; // For SD-JWT, which claims can be selectively disclosed
}

export class PIDDataGenerator {
  /**
   * Generate a realistic German PID credential
   * Returns the same person every time for consistency
   */
  static generatePIDCredential(format: "dc+sd-jwt" | "mso_mdoc" = "dc+sd-jwt"): PIDCredentialData {
    const baseClaims: PIDCredentialClaims = {
      given_name: "Maria",
      family_name: "Müller",
      birthdate: "1985-03-15",
      address: {
        street_address: "Hauptstraße 42",
        postal_code: "10115",
        locality: "Berlin",
        country: "DE",
      },
      nationalities: ["DE"],
      gender: "F",
      birth_place: "München",
      birth_country: "DE",
      age_over_18: true,
      age_over_21: true,
    };

    if (format === "dc+sd-jwt") {
      return {
        id: "pid-sd-jwt",
        format: "dc+sd-jwt",
        claims: baseClaims,
        selectivelyDisclosableClaims: [
          "given_name",
          "family_name",
          "birthdate",
          "address.street_address",
          "address.postal_code",
          "address.locality",
          "address.country",
          "nationalities",
          "gender",
          "birth_place",
          "birth_country",
          "age_over_18",
          "age_over_21",
        ],
      };
    } else {
      // mso_mdoc format
      return {
        id: "pid-mso-mdoc",
        format: "mso_mdoc",
        claims: baseClaims,
      };
    }
  }

  /**
   * Filter credential claims based on requested claim paths
   * Handles both flat and nested paths (e.g., "address.street_address")
   */
  static filterClaimsFromRequest(
    credential: PIDCredentialData,
    requestedClaimPaths: string[][]
  ): Partial<PIDCredentialClaims> {
    const filtered: Partial<PIDCredentialClaims> = {};

    for (const pathArray of requestedClaimPaths) {
      const value = this.getNestedValue(credential.claims, pathArray);
      if (value !== undefined) {
        this.setNestedValue(filtered, pathArray, value);
      }
    }

    return filtered;
  }

  /**
   * Get value from nested object using path array
   * E.g., ["address", "street_address"] -> claims.address.street_address
   */
  private static getNestedValue(obj: any, path: string[]): any {
    let current = obj;
    for (const key of path) {
      current = current?.[key];
    }
    return current;
  }

  /**
   * Set value in nested object using path array
   */
  private static setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    current[path[path.length - 1]] = value;
  }

  /**
   * Get all claims as a flat key-value map for JWT payload
   */
  static getClaimsAsPayload(credential: PIDCredentialData): Record<string, any> {
    return this.flattenObject(credential.claims);
  }

  /**
   * Flatten nested object for JWT payload
   * E.g., { address: { street_address: "..." } } -> { "address.street_address": "..." }
   */
  private static flattenObject(obj: any, prefix = ""): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, newKey));
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Determine which claims should be selectively disclosed
   * Returns map of claim name -> should be disclosed
   */
  static getSelectivelyDisclosureMap(
    credential: PIDCredentialData,
    requestedClaimPaths: string[][]
  ): Record<string, boolean> {
    const disclosureMap: Record<string, boolean> = {};
    const flatClaims = this.flattenObject(credential.claims);

    // Convert path arrays to flat keys for matching
    const requestedKeys = requestedClaimPaths.map((path) => path.join("."));

    for (const claimKey of Object.keys(flatClaims)) {
      // Claim is disclosed if it's requested OR if it's marked as selectively disclosable
      const isRequested = requestedKeys.some(
        (rk) => rk === claimKey || rk.startsWith(claimKey + ".") || claimKey.startsWith(rk)
      );

      const canBeDisclosed = credential.selectivelyDisclosableClaims?.includes(claimKey) ?? true;

      // Mark as disclosed if it's requested and can be disclosed
      disclosureMap[claimKey] = isRequested && canBeDisclosed;
    }

    return disclosureMap;
  }

  /**
   * Check if a claim exists in the credential
   */
  static hasClaimPath(credential: PIDCredentialData, path: string[]): boolean {
    return this.getNestedValue(credential.claims, path) !== undefined;
  }
}

export default PIDDataGenerator;
