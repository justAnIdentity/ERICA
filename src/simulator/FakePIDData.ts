/**
 * Fake PID data generator
 * Generates obviously fake but properly structured German PID data
 * Based on: https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/PID_Presentation/
 */

export interface PIDClaims {
  // Personal identification
  family_name: string;
  given_name: string;
  birthdate: string; // SD-JWT format uses "birthdate" per IETF convention
  age_over_18?: boolean;
  age_over_21?: boolean;
  age_over_65?: boolean;
  age_in_years?: number;
  age_birth_year?: number;

  // Address
  address?: {
    street_address: string;
    locality: string;
    postal_code: string;
    country: string;
  };

  // Nationality
  nationalities?: string[];

  // Place of birth
  place_of_birth?: {
    locality: string;
  };

  // Document metadata
  issuing_country?: string;
  issuing_authority?: string;
  document_number?: string;
  administrative_number?: string;

  // Issuance info
  issuance_date?: string;
  expiry_date?: string;
}

/**
 * Generate fake PID data with obviously fake values
 */
export function generateFakePIDData(): PIDClaims {
  const birthDate = new Date("1987-06-15");
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();

  return {
    family_name: "Mustermann",
    given_name: "Max",
    birthdate: "1987-06-15",
    age_over_18: true,
    age_over_21: true,
    age_over_65: false,
    age_in_years: age,
    age_birth_year: 1987,

    address: {
      street_address: "Musterstraße 123",
      locality: "Musterstadt",
      postal_code: "12345",
      country: "DE",
    },

    nationalities: ["DE"],

    place_of_birth: {
      locality: "Berlin",
    },

    issuing_country: "DE",
    issuing_authority: "Bundesdruckerei GmbH (TEST)",
    document_number: "T220001293",
    administrative_number: "123456789012",

    issuance_date: "2024-01-15",
    expiry_date: "2034-01-14",
  };
}

/**
 * Generate expired PID data
 */
export function generateExpiredPIDData(): PIDClaims {
  const data = generateFakePIDData();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return {
    ...data,
    expiry_date: yesterday.toISOString().split('T')[0],
    issuance_date: "2014-01-15", // 10 years ago
  };
}

/**
 * Generate not-yet-valid PID data
 */
export function generateNotYetValidPIDData(): PIDClaims {
  const data = generateFakePIDData();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    ...data,
    issuance_date: tomorrow.toISOString().split('T')[0],
  };
}

/**
 * Generate PID data with missing required claims
 */
export function generateIncompletePIDData(): Partial<PIDClaims> {
  return {
    family_name: "Mustermann",
    given_name: "Max",
    // birth_date is missing!
    nationalities: ["DE"],
  };
}

/**
 * Get only the claims that were requested
 */
export function filterRequestedClaims(allClaims: Partial<PIDClaims>, requestedPaths: string[][]): Partial<PIDClaims> {
  const result: any = {};

  for (const path of requestedPaths) {
    let current: any = allClaims;
    let target: any = result;

    // Navigate through the path
    for (let i = 0; i < path.length; i++) {
      const key = path[i];

      if (i === path.length - 1) {
        // Last element in path - copy the value
        if (current[key] !== undefined) {
          target[key] = current[key];
        }
      } else {
        // Intermediate element - navigate deeper
        if (current[key] !== undefined) {
          if (target[key] === undefined) {
            target[key] = {};
          }
          current = current[key];
          target = target[key];
        } else {
          break; // Path doesn't exist
        }
      }
    }
  }

  return result;
}

/**
 * Add extra claims for over-disclosure scenario
 */
export function addExtraClaims(claims: Partial<PIDClaims>): PIDClaims {
  return {
    ...claims,
    // Add claims that weren't requested
    document_number: "T220001293",
    administrative_number: "123456789012",
    issuing_authority: "Bundesdruckerei GmbH (TEST)",
  } as PIDClaims;
}
