export interface ITabService {
  getTab(tabId: number): Promise<chrome.tabs.Tab | null>;
  waitForTabComplete(tabId: number, timeoutMs?: number): Promise<void>;
  sendMessage<TResponse = any>(tabId: number, message: unknown): Promise<TResponse>;
  executeScript<TResult>(
    tabId: number,
    func: () => TResult,
  ): Promise<TResult | undefined>;
}

export class TabService implements ITabService {
  async getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
    return chrome.tabs.get(tabId).catch(() => null);
  }

  async waitForTabComplete(tabId: number, timeoutMs: number = 2000): Promise<void> {
    const tab = await this.getTab(tabId);
    if (!tab || tab.status === 'complete') {
      return;
    }

    await new Promise<void>((resolve) => {
      let done = false;

      const cleanup = () => {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        window.clearTimeout(timer);
      };

      const listener = (
        updatedTabId: number,
        changeInfo: { status?: string },
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          cleanup();
          resolve();
        }
      };

      const timer = window.setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  async sendMessage<TResponse = any>(
    tabId: number,
    message: unknown,
  ): Promise<TResponse> {
    return chrome.tabs.sendMessage(tabId, message) as Promise<TResponse>;
  }

  async executeScript<TResult>(
    tabId: number,
    func: () => TResult,
  ): Promise<TResult | undefined> {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func,
    });
    return result[0]?.result as TResult | undefined;
  }
}
