/**
 * Validation Profile Registry
 * 
 * Manages available validation profiles and provides factory methods.
 * Implements the registry pattern for plugin-based profile support.
 */

import { IValidationProfile } from "./IValidationProfile.js";
import { BaseOpenID4VPProfile } from "./BaseOpenID4VPProfile.js";
import { PIDPresentationProfile } from "./PIDPresentationProfile.js";
import { Profile } from "../types/index.js";

export class ValidationProfileRegistry {
  private static profiles = new Map<Profile, IValidationProfile>();

  /**
   * Initialize registry with built-in profiles
   */
  static {
    ValidationProfileRegistry.profiles.set(Profile.BASE_OPENID4VP, new BaseOpenID4VPProfile());
    ValidationProfileRegistry.profiles.set(Profile.PID_PRESENTATION, new PIDPresentationProfile());
  }

  /**
   * Get a profile by type
   */
  static getProfile(profileType: Profile): IValidationProfile {
    const profile = this.profiles.get(profileType);
    if (!profile) {
      throw new Error(`Unknown validation profile: ${profileType}`);
    }
    return profile;
  }

  /**
   * Register a custom profile
   * Allows plugins to add custom validation profiles at runtime
   */
  static registerProfile(profileType: Profile, profile: IValidationProfile): void {
    this.profiles.set(profileType, profile);
  }

  /**
   * Get all registered profiles
   */
  static getAllProfiles(): Map<Profile, IValidationProfile> {
    return new Map(this.profiles);
  }

  /**
   * Get default profile
   */
  static getDefaultProfile(): IValidationProfile {
    return this.getProfile(Profile.BASE_OPENID4VP);
  }
}
