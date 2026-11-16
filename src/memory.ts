import type { Message } from "./message.js";

export interface Memory {
  getMessages(): readonly Message[];
  addMessage(message: Message): void;
  clear(): void;
}

export class InMemoryMemory {
  private readonly tenants = new Map<string, Map<string, Message[]>>();

  forSession(tenantId: string, sessionId: string): Memory {
    let sessions = this.tenants.get(tenantId);
    if (!sessions) {
      sessions = new Map();
      this.tenants.set(tenantId, sessions);
    }

    return {
      getMessages: () => [...(sessions.get(sessionId) ?? [])],
      addMessage: (message) => {
        let messages = sessions.get(sessionId);
        if (!messages) {
          messages = [];
          sessions.set(sessionId, messages);
        }
        messages.push({ ...message, metadata: message.metadata ? { ...message.metadata } : undefined });
      },
      clear: () => {
        sessions.delete(sessionId);
        if (sessions.size === 0) this.tenants.delete(tenantId);
      }
    };
  }
}
