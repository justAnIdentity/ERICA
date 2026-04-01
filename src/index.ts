/**
 * EUDI VP Debugger Orchestrator
 * Coordinates all components through the validation and simulation pipeline
 */

import { PresentationRequestValidator } from "./validators/index.js";
import { PresentationResponseValidator } from "./validators/index.js";
import { WalletSimulator } from "./simulator/index.js";
import { ExplainabilityEngine } from "./explainability/index.js";
import {
  AuthorizationRequest,
  PresentationResponse,
  ValidationResult,
  Profile,
  SimulationMode,
  DiagnosticReport,
} from "./types/index.js";

export interface DebuggerSession {
  requestValidation: ValidationResult;
  simulatedResponse: PresentationResponse;
  responseValidation: ValidationResult;
  diagnostics: DiagnosticReport;
}

export class EudiVpDebugger {
  private requestValidator: PresentationRequestValidator;
  private responseValidator: PresentationResponseValidator;
  private walletSimulator: WalletSimulator;
  private explainabilityEngine: ExplainabilityEngine;

  constructor() {
    this.requestValidator = new PresentationRequestValidator();
    this.responseValidator = new PresentationResponseValidator();
    this.walletSimulator = new WalletSimulator();
    this.explainabilityEngine = new ExplainabilityEngine();
  }

  /**
   * Full debugging session: validate request → simulate response → validate response
   */
  async debug(
    request: AuthorizationRequest,
    validationProfile: Profile = Profile.PID_PRESENTATION,
    simulationMode: SimulationMode = SimulationMode.COMPLIANT,
    postResponseToUri: boolean = false,
    preferredFormat: "dc+sd-jwt" | "mso_mdoc" = "dc+sd-jwt"
  ): Promise<DebuggerSession> {
    // 1. Validate presentation request with the selected profile
    const requestValidation = await this.requestValidator.validate(
      request,
      validationProfile
    );

    // Simulate wallet response
    const simulatedResponse = await this.walletSimulator.simulate(request, {
      mode: simulationMode,
      credentialSource: "TEMPLATE",
      postResponseToUri,
      preferredFormat,
    });

    // 3. Validate presentation response (as RP would)
    const responseValidation = await this.responseValidator.validate(simulatedResponse, request);

    // 4. Generate diagnostics derived from validation results
    const diagnostics = this.explainabilityEngine.generateReport(
      requestValidation,
      responseValidation
    );

    return {
      requestValidation,
      simulatedResponse,
      responseValidation,
      diagnostics,
    };
  }

  /**
   * Validate only the request (RP validation step)
   */
  async validateRequest(
    request: AuthorizationRequest,
    validationProfile: Profile = Profile.PID_PRESENTATION
  ): Promise<ValidationResult> {
    return this.requestValidator.validate(request, validationProfile);
  }

  /**
   * Validate only the response (RP validation step)
   */
  async validateResponse(response: PresentationResponse, request: AuthorizationRequest): Promise<ValidationResult> {
    return this.responseValidator.validate(response, request);
  }

  /**
   * Get explainability engine for detailed diagnostics
   */
  getExplainabilityEngine(): ExplainabilityEngine {
    return this.explainabilityEngine;
  }
}

// Re-export types and components
export * from "./types/index.js";
export { PresentationRequestValidator, type IRequestValidator, type IPresentationRequestValidator } from "./validators/index.js";
export { PresentationResponseValidator } from "./validators/index.js";
export { PresentationRequestURLParser, type URLParseResult } from "./validators/index.js";
export { WalletSimulator } from "./simulator/index.js";
export { ExplainabilityEngine } from "./explainability/index.js";

// Re-export runtime utilities for centralized instantiation
export { createDebugger, createURLParser, type RuntimeConfig } from "./runtime.js";
