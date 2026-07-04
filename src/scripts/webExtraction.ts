import TurndownService from 'turndown';
import { NOISE_SELECTORS } from './constants';

declare global {
  interface Window {
    extractPageContent: (noiseSelectors?: string[]) => string;
  }
}

export function extractPageContent(
  noiseSelectors: string[] = NOISE_SELECTORS,
): string {
  if (!document.body) {
    return '';
  }

  const bodyClone = document.body.cloneNode(true) as HTMLElement;

  try {
    noiseSelectors.forEach((selector) => {
      const elements = bodyClone.querySelectorAll(selector);
      elements.forEach((element) => element.remove());
    });
  } catch (error) {
    console.warn('FAILC: content cleaning failed:', error);
  }

  try {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });

    const markdown = turndownService.turndown(bodyClone.innerHTML).trim();
    if (markdown) {
      return markdown;
    }
  } catch (error) {
    console.warn('FAILC: markdown conversion failed:', error);
  }

  const cleanedText = (bodyClone.innerText || bodyClone.textContent || '').trim();
  if (cleanedText) {
    return cleanedText;
  }

  return (document.body.innerText || document.body.textContent || '').trim();
}

window.extractPageContent = extractPageContent;
