export const CONTEXT_MESSAGES = {
  NO_CONTENT_WARNING: '(No text content found on this page)',
  TAB_NOT_FOUND: '(Tab not found or accessible)',
  ERROR_PREFIX: '(Could not extract content from this page:',
} as const;

export const NOISE_SELECTORS = [
  'nav',
  'footer',
  'script',
  'style',
  'noscript',
  '.ad',
  '.ads',
  '.social-share',
  '#sidebar',
  '.cookie-consent',
];

// --------------------------------------------------------
// Chatbot contextuel (sidebar)
// --------------------------------------------------------

// Nombre d'échanges précédents renvoyés à l'IA pour garder la mémoire
// de la conversation, sans faire exploser la taille du prompt.
export const CHAT_HISTORY_LIMIT = 8;

// Préfixe de clé utilisé pour stocker l'historique de chat par page
// dans chrome.storage.local (une entrée par URL nettoyée).
export const CHAT_STORAGE_PREFIX = 'failc:chat:';