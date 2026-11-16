import type { Agent } from "./agent.js";
import { InMemoryMemory, type MemoryStore } from "./memory.js";

export class RuntimeCapacityError extends Error {
  constructor() {
    super("Agent runtime queue is full");
    this.name = "RuntimeCapacityError";
  }
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

interface Waiter {
  readonly signal?: AbortSignal;
  readonly resolve: (release: () => void) => void;
  readonly reject: (error: Error) => void;
  onAbort?: () => void;
}

class Semaphore {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly limit: number,
    private readonly maxQueueSize: number
  ) {}

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }
    if (this.waiters.length >= this.maxQueueSize) {
      return Promise.reject(new RuntimeCapacityError());
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = { signal, resolve, reject };
      if (signal) {
        waiter.onAbort = () => {
          const index = this.waiters.indexOf(waiter);
          if (index !== -1) this.waiters.splice(index, 1);
          reject(abortError(signal));
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
    });
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (!next) {
        this.active -= 1;
        return;
      }
      if (next.signal && next.onAbort) {
        next.signal.removeEventListener("abort", next.onAbort);
      }
      next.resolve(this.releaseOnce());
    };
  }
}

export interface AgentRuntimeOptions {
  readonly maxConcurrency?: number;
  readonly maxQueueSize?: number;
  readonly memory?: MemoryStore;
}

export interface AgentRun<Input, Output = unknown> {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agent: Agent<Input, Output>;
  readonly input: Input;
  readonly signal?: AbortSignal;
}

export class AgentRuntime {
  private readonly semaphore: Semaphore;
  private readonly memory: MemoryStore;

  constructor(options: AgentRuntimeOptions = {}) {
    const maxConcurrency = options.maxConcurrency ?? 100;
    const maxQueueSize = options.maxQueueSize ?? 1000;
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError("maxConcurrency must be a positive integer");
    }
    if (!Number.isInteger(maxQueueSize) || maxQueueSize < 0) {
      throw new RangeError("maxQueueSize must be a non-negative integer");
    }
    this.semaphore = new Semaphore(maxConcurrency, maxQueueSize);
    this.memory = options.memory ?? new InMemoryMemory();
  }

  async run<Input, Output>({
    tenantId,
    sessionId,
    agent,
    input,
    signal
  }: AgentRun<Input, Output>): Promise<Output> {
    if (!tenantId.trim()) throw new TypeError("tenantId must not be empty");
    if (!sessionId.trim()) throw new TypeError("sessionId must not be empty");

    const release = await this.semaphore.acquire(signal);
    try {
      if (signal?.aborted) throw abortError(signal);
      return await agent.run(input, {
        tenantId,
        sessionId,
        memory: this.memory.forSession(tenantId, sessionId),
        signal
      });
    } finally {
      release();
    }
  }
}
