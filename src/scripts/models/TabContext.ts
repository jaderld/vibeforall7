import { IContentStrategy } from '../strategies/IContentStrategy';

export class TabContext {
  constructor(private readonly strategies: IContentStrategy[]) {}

  getStrategy(url: string): IContentStrategy {
    const strategy = this.strategies.find((item) => item.canHandle(url));
    if (!strategy) {
      throw new Error('No strategy registered for this URL.');
    }
    return strategy;
  }
}
