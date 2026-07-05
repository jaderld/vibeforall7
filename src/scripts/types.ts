export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'file_data'; mimeType: string; fileUri: string };

// Un tour de conversation transmis par le sidebar pour donner de la mémoire au chat
export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExtensionMessage {
  type: string;
  payload?: {
    tabId?: number;
    url?: string;
    pageContent?: string;
  };
  context?: string;
  question?: string;
  status?: 'ok' | 'error';
  // Chat contextuel (ASK_GEMINI_CONTEXT / CHAT_REPLY)
  history?: ChatHistoryTurn[];
  requestId?: string;
  reply?: string;
}