import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuntime, RuntimeCapacityError } from "../dist/index.js";

test("keeps memory isolated by tenant and session", async () => {
  const runtime = new AgentRuntime();
  const agent = {
    run: (input, context) => {
      context.memory.addMessage({ role: "user", content: input });
      return context.memory.getMessages().map((message) => message.content);
    }
  };

  assert.deepEqual(await runtime.run({
    tenantId: "tenant-a",
    sessionId: "shared-session",
    agent,
    input: "private to tenant a"
  }), ["private to tenant a"]);
  assert.deepEqual(await runtime.run({
    tenantId: "tenant-b",
    sessionId: "shared-session",
    agent,
    input: "private to tenant b"
  }), ["private to tenant b"]);
  assert.deepEqual(await runtime.run({
    tenantId: "tenant-a",
    sessionId: "shared-session",
    agent,
    input: "same conversation"
  }), ["private to tenant a", "same conversation"]);
});

test("bounds active runs and queued work, and releases permits after completion", async () => {
  const runtime = new AgentRuntime({ maxConcurrency: 1, maxQueueSize: 1 });
  let finishFirst;
  let started = 0;
  const first = runtime.run({
    tenantId: "tenant",
    sessionId: "first",
    agent: {
      run: () => new Promise((resolve) => {
        started += 1;
        finishFirst = resolve;
      })
    },
    input: null
  });
  await new Promise((resolve) => setImmediate(resolve));

  const queued = runtime.run({
    tenantId: "tenant",
    sessionId: "queued",
    agent: { run: () => ++started },
    input: null
  });
  await assert.rejects(runtime.run({
    tenantId: "tenant",
    sessionId: "overflow",
    agent: { run: () => null },
    input: null
  }), RuntimeCapacityError);

  finishFirst("first complete");
  assert.equal(await first, "first complete");
  assert.equal(await queued, 2);
  assert.equal(started, 2);
});

test("removes cancelled runs from the queue", async () => {
  const runtime = new AgentRuntime({ maxConcurrency: 1, maxQueueSize: 1 });
  let finishFirst;
  const first = runtime.run({
    tenantId: "tenant",
    sessionId: "first",
    agent: {
      run: () => new Promise((resolve) => {
        finishFirst = resolve;
      })
    },
    input: null
  });
  await new Promise((resolve) => setImmediate(resolve));

  const controller = new AbortController();
  const cancelled = runtime.run({
    tenantId: "tenant",
    sessionId: "cancelled",
    agent: { run: () => assert.fail("cancelled run must not start") },
    input: null,
    signal: controller.signal
  });
  controller.abort();
  await assert.rejects(cancelled, (error) => error.name === "AbortError");

  const next = runtime.run({
    tenantId: "tenant",
    sessionId: "next",
    agent: { run: () => "next run" },
    input: null
  });
  finishFirst("first complete");
  assert.equal(await first, "first complete");
  assert.equal(await next, "next run");
});

test("rejects empty scope identifiers", async () => {
  const runtime = new AgentRuntime();
  await assert.rejects(runtime.run({
    tenantId: " ",
    sessionId: "session",
    agent: { run: () => null },
    input: null
  }), TypeError);
});
