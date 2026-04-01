/**
 * Wallet Simulator Diagnostics
 * Aggregates diagnostic events from all simulation components
 * Provides structured output for frontend inspection
 */

import { DiagnosticEvent } from "./CredentialTemplate.js";

export interface ComponentDiagnostics {
  component: string;
  phase: string;
  startTime: number;
  endTime: number;
  duration: number; // milliseconds
  eventCount: number;
  events: DiagnosticEvent[];
  hasErrors: boolean;
  errorCount: number;
}

export interface SimulationDiagnostics {
  simulationId: string;
  startTime: number;
  endTime: number;
  totalDuration: number; // milliseconds
  components: ComponentDiagnostics[];
  totalEventCount: number;
  phases: string[];
  summary: {
    success: boolean;
    componentCount: number;
    eventCount: number;
    errorCount: number;
  };
}

export interface DiagnosticPhaseInfo {
  component: string;
  phase: string;
  events: DiagnosticEvent[];
}

export class WalletSimulatorDiagnostics {
  private simulationId: string;
  private startTime: number;
  private componentDiagnostics: Map<string, DiagnosticPhaseInfo[]> = new Map();
  private phases: Set<string> = new Set();

  constructor() {
    this.simulationId = `sim_${this.generateId()}`;
    this.startTime = Date.now();
  }

  /**
   * Register diagnostics from a component
   */
  registerComponent(
    component: string,
    phase: string,
    events: DiagnosticEvent[]
  ): void {
    if (!this.componentDiagnostics.has(component)) {
      this.componentDiagnostics.set(component, []);
    }

    this.componentDiagnostics.get(component)!.push({
      component,
      phase,
      events,
    });

    this.phases.add(phase);
  }

  /**
   * Aggregate all diagnostics into structured format
   */
  aggregate(): SimulationDiagnostics {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    const components: ComponentDiagnostics[] = [];
    let totalEventCount = 0;
    let totalErrorCount = 0;

    // Process each component
    for (const [componentName, phaseInfos] of this.componentDiagnostics) {
      let componentStartTime = Infinity;
      let componentEndTime = -Infinity;
      let componentEventCount = 0;
      let componentErrorCount = 0;
      const allEvents: DiagnosticEvent[] = [];

      // Aggregate phases for this component
      for (const phaseInfo of phaseInfos) {
        for (const event of phaseInfo.events) {
          componentStartTime = Math.min(componentStartTime, event.timestamp);
          componentEndTime = Math.max(componentEndTime, event.timestamp);
          componentEventCount++;

          // Check for errors in event details
          if (
            event.details?.errors ||
            event.event.toLowerCase().includes("error") ||
            event.event.toLowerCase().includes("failed")
          ) {
            componentErrorCount++;
          }

          allEvents.push(event);
        }
      }

      if (componentEventCount > 0) {
        components.push({
          component: componentName,
          phase: Array.from(
            new Set(phaseInfos.map((p) => p.phase))
          ).join(" → "),
          startTime: componentStartTime,
          endTime: componentEndTime,
          duration: componentEndTime - componentStartTime,
          eventCount: componentEventCount,
          events: allEvents,
          hasErrors: componentErrorCount > 0,
          errorCount: componentErrorCount,
        });

        totalEventCount += componentEventCount;
        totalErrorCount += componentErrorCount;
      }
    }

    // Sort components by start time
    components.sort((a, b) => a.startTime - b.startTime);

    // Determine overall success
    const success = totalErrorCount === 0;

    return {
      simulationId: this.simulationId,
      startTime: this.startTime,
      endTime,
      totalDuration,
      components,
      totalEventCount,
      phases: Array.from(this.phases).sort(),
      summary: {
        success,
        componentCount: components.length,
        eventCount: totalEventCount,
        errorCount: totalErrorCount,
      },
    };
  }

  /**
   * Get diagnostics for a specific component
   */
  getComponentDiagnostics(component: string): DiagnosticPhaseInfo[] | undefined {
    return this.componentDiagnostics.get(component);
  }

  /**
   * Get timeline view of all events across all components
   */
  getTimeline(): DiagnosticEvent[] {
    const allEvents: DiagnosticEvent[] = [];

    for (const phaseInfos of this.componentDiagnostics.values()) {
      for (const phaseInfo of phaseInfos) {
        allEvents.push(...phaseInfo.events);
      }
    }

    // Sort by timestamp
    return allEvents.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get diagnostics summary as formatted string
   */
  static formatSummary(diagnostics: SimulationDiagnostics): string {
    const lines: string[] = [];

    lines.push("=== Simulation Diagnostics Summary ===");
    lines.push(`Simulation ID: ${diagnostics.simulationId}`);
    lines.push(
      `Duration: ${diagnostics.totalDuration}ms (${(diagnostics.totalDuration / 1000).toFixed(2)}s)`
    );
    lines.push(`Status: ${diagnostics.summary.success ? "✓ SUCCESS" : "✗ FAILED"}`);
    lines.push("");

    lines.push("Components:");
    for (const comp of diagnostics.components) {
      const status = comp.hasErrors ? "✗" : "✓";
      lines.push(
        `  ${status} ${comp.component}: ${comp.eventCount} events (${comp.duration}ms)${
          comp.errorCount > 0 ? ` - ${comp.errorCount} errors` : ""
        }`
      );
    }

    lines.push("");
    lines.push("Summary:");
    lines.push(`  Total Components: ${diagnostics.summary.componentCount}`);
    lines.push(`  Total Events: ${diagnostics.summary.eventCount}`);
    lines.push(`  Total Errors: ${diagnostics.summary.errorCount}`);

    return lines.join("\n");
  }

  /**
   * Static method for formatting summary (allows instance call too)
   */
  formatSummaryInstance(diagnostics: SimulationDiagnostics): string {
    return WalletSimulatorDiagnostics.formatSummary(diagnostics);
  }

  /**
   * Export diagnostics as JSON
   */
  exportJSON(diagnostics: SimulationDiagnostics): string {
    return JSON.stringify(diagnostics, null, 2);
  }

  /**
   * Get detailed component report
   */
  getComponentReport(
    diagnostics: SimulationDiagnostics,
    component: string
  ): string {
    const lines: string[] = [];
    const comp = diagnostics.components.find((c) => c.component === component);

    if (!comp) {
      return `Component '${component}' not found`;
    }

    lines.push(`=== ${component} Diagnostics ===`);
    lines.push(`Phase: ${comp.phase}`);
    lines.push(`Duration: ${comp.duration}ms`);
    lines.push(`Events: ${comp.eventCount}`);
    lines.push(`Status: ${comp.hasErrors ? "✗ FAILED" : "✓ SUCCESS"}`);
    if (comp.errorCount > 0) {
      lines.push(`Errors: ${comp.errorCount}`);
    }

    lines.push("\nEvents:");
    for (const event of comp.events) {
      const time = new Date(event.timestamp).toISOString();
      lines.push(`  [${time}] ${event.event}`);
      if (event.details) {
        const detailsStr = JSON.stringify(event.details);
        lines.push(`    ${detailsStr}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }

  /**
   * Get simulation ID
   */
  getSimulationId(): string {
    return this.simulationId;
  }
}

export default WalletSimulatorDiagnostics;
