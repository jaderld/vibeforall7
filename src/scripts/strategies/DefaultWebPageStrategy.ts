import { CONTEXT_MESSAGES } from '../constants';
import { ITabService } from '../services/tabService';
import { ContentPart } from '../types';
import { IContentStrategy } from './IContentStrategy';

export class DefaultWebPageStrategy implements IContentStrategy {
  constructor(private readonly tabService: ITabService) {}

  canHandle(_url: string): boolean {
    return true;
  }

  async getContent(tabId: number, _url: string): Promise<ContentPart> {
    try {
      const response = await this.tabService.sendMessage<{ pageContent?: string }>(
        tabId,
        { type: 'EXTRACT_PAGE_CONTENT' },
      );

      const pageContent = String(response?.pageContent || '').trim();
      if (!pageContent) {
        return { type: 'text', text: CONTEXT_MESSAGES.NO_CONTENT_WARNING };
      }

      return { type: 'text', text: pageContent };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'text',
        text: `${CONTEXT_MESSAGES.ERROR_PREFIX} ${message})`,
      };
    }
  }
}
