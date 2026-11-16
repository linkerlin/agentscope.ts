export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
