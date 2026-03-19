import type { ScenarioConfig } from './types.js';

class ScenarioRegistry {
  private scenarios = new Map<string, ScenarioConfig>();

  register(scenario: ScenarioConfig): void {
    this.scenarios.set(scenario.id, scenario);
  }

  get(id: string): ScenarioConfig | undefined {
    return this.scenarios.get(id);
  }

  getDefault(): ScenarioConfig {
    return this.scenarios.values().next().value!;
  }

  list(): ScenarioConfig[] {
    return [...this.scenarios.values()];
  }

  ids(): string[] {
    return [...this.scenarios.keys()];
  }
}

export const scenarioRegistry = new ScenarioRegistry();
