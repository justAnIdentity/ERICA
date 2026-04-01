/**
 * Simulator module entry point
 *
 * Public API surface:
 * - WalletSimulator: Main entry point for simulating wallet responses
 * - WalletSimulatorOptions: Configuration for simulation
 * - DecodedVPToken/DecodedJWT: Types for inspecting decoded credentials
 * - SimulationModeHandler: Reusable utilities for applying simulation modes to credentials
 *
 * Internal modules (not exported):
 * - WalletSimulatorOrchestrator: Internal coordination logic
 * - PIDCache: Reserved for future optional caching
 * - CredentialMatcher, KeyManager, etc.: Internal implementation details
 */

export { WalletSimulator, type IWalletSimulator, type WalletSimulatorOptions } from "./WalletSimulator.js";
export type { DecodedVPToken, DecodedJWT } from "./CredoSDJWTGenerator.js";
export { SimulationModeHandler, type CredentialMetadata, type SimulationModeResult } from "./SimulationModeHandler.js";
