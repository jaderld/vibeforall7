export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'file_data'; mimeType: string; fileUri: string };

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
}
