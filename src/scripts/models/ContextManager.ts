import { CONTEXT_MESSAGES } from '../constants';
import { ITabService } from '../services/tabService';
import { ContentPart } from '../types';
import { TabContext } from './TabContext';

export class ContextManager {
  constructor(
    private readonly tabContext: TabContext,
    private readonly tabService: ITabService,
  ) {}

  async getContext(tabId: number, fallbackUrl: string = ''): Promise<ContentPart> {
    await this.tabService.waitForTabComplete(tabId, 2000);
    const tab = await this.tabService.getTab(tabId);
    const url = tab?.url || fallbackUrl;

    if (!url) {
      return { type: 'text', text: CONTEXT_MESSAGES.TAB_NOT_FOUND };
    }

    const strategy = this.tabContext.getStrategy(url);
    return strategy.getContent(tabId, url);
  }
}
