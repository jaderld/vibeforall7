import { ContentPart } from '../types';

export interface IContentStrategy {
  canHandle(url: string): boolean;
  getContent(tabId: number, url: string): Promise<ContentPart>;
}
