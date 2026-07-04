import { ContentPart } from '../types';
import { IContentStrategy } from './IContentStrategy';

export class YouTubeStrategy implements IContentStrategy {
  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const isYouTubeDomain = /(^|\.)youtube\.com$/i.test(parsedUrl.hostname);

      if (isYouTubeDomain) {
        return (
          (parsedUrl.pathname === '/watch' && parsedUrl.searchParams.has('v')) ||
          parsedUrl.pathname.startsWith('/shorts/')
        );
      }

      return parsedUrl.hostname === 'youtu.be';
    } catch {
      return false;
    }
  }

  async getContent(_tabId: number, url: string): Promise<ContentPart> {
    return { type: 'text', text: `Video URL: ${url}` };
  }
}
