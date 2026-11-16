import type { Message } from "./message.js";

export interface Memory {
  getMessages(): Promise<readonly Message[]>;
  addMessage(message: Message): Promise<void>;
  clear(): Promise<void>;
}

export interface MemoryStore {
  forSession(tenantId: string, sessionId: string): Memory;
}

export class InMemoryMemory implements MemoryStore {
  private readonly tenants = new Map<string, Map<string, Message[]>>();

  forSession(tenantId: string, sessionId: string): Memory {
    return {
      getMessages: async () => (this.tenants.get(tenantId)?.get(sessionId) ?? [])
        .map((message) => ({
          ...message,
          metadata: message.metadata ? { ...message.metadata } : undefined
        })),
      addMessage: async (message) => {
        let sessions = this.tenants.get(tenantId);
        if (!sessions) {
          sessions = new Map();
          this.tenants.set(tenantId, sessions);
        }
        let messages = sessions.get(sessionId);
        if (!messages) {
          messages = [];
          sessions.set(sessionId, messages);
        }
        messages.push({ ...message, metadata: message.metadata ? { ...message.metadata } : undefined });
      },
      clear: async () => {
        const sessions = this.tenants.get(tenantId);
        sessions?.delete(sessionId);
        if (sessions?.size === 0) this.tenants.delete(tenantId);
      }
    };
  }
}
