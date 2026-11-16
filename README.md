# agentscope.ts

A TypeScript agent framework inspired by AgentScope Java, with tenant-scoped
conversation memory and bounded asynchronous execution.

## Current scope

This repository is an early implementation, not yet a 1:1 port of
`agentscope-java`. The initial API provides typed agents and messages, scoped
in-memory conversation history, and a runtime with configurable concurrency
and queue limits. The runtime can be embedded in self-hosted services and does
not require a hosted control plane.

## Quick start

```ts
import { AgentRuntime } from "agentscope.ts";

const runtime = new AgentRuntime({ maxConcurrency: 32, maxQueueSize: 256 });
const agent = {
  async run(input: string, { memory }) {
    memory.addMessage({ role: "user", content: input });
    const answer = `Received: ${input}`;
    memory.addMessage({ role: "assistant", content: answer });
    return answer;
  }
};

const answer = await runtime.run({
  tenantId: "customer-42",
  sessionId: "conversation-7",
  agent,
  input: "Hello",
  signal: AbortSignal.timeout(10_000)
});
```

Each run receives memory isolated by the pair `(tenantId, sessionId)`. Supply
tenant identifiers from a trusted authentication layer; this package does not
authenticate requests or provide durable storage. `maxConcurrency` limits
active agent calls, `maxQueueSize` bounds pending calls, and queued calls can
be cancelled with an `AbortSignal`.

## Development

- `npm run build` compiles the library and declaration files into `dist/`.
- `npm test` builds the library and runs the focused runtime tests.
