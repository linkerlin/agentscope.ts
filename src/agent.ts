import type { Memory } from "./memory.js";

export interface AgentContext {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly memory: Memory;
  readonly signal?: AbortSignal;
}

export interface Agent<Input = unknown, Output = unknown> {
  run(input: Input, context: AgentContext): Output | Promise<Output>;
}
