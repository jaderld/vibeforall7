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
