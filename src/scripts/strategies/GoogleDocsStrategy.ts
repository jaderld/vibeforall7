import { CONTEXT_MESSAGES } from '../constants';
import { ITabService } from '../services/tabService';
import { ContentPart } from '../types';
import { IContentStrategy } from './IContentStrategy';

function extractGoogleDocsContent(): { content: string | null; debug?: string } {
  try {
    const scripts = Array.from(document.querySelectorAll('script'));
    const modelChunkScripts = scripts.filter((script) =>
      script.innerText.trim().startsWith('DOCS_modelChunk ='),
    );

    if (modelChunkScripts.length === 0) {
      return { content: null, debug: 'No DOCS_modelChunk scripts found' };
    }

    type ChunkItem = { index: number; text: string };
    const chunks: ChunkItem[] = [];

    modelChunkScripts.forEach((script) => {
      try {
        const source = script.innerText.trim();
        let jsonText = source.substring('DOCS_modelChunk ='.length).trim();

        const parts = jsonText.split('; DOCS_');
        if (parts.length > 0) {
          jsonText = parts[0];
        }

        if (jsonText.endsWith(';')) {
          jsonText = jsonText.slice(0, -1);
        }

        const parsed = JSON.parse(jsonText);
        if (parsed && parsed.chunk && Array.isArray(parsed.chunk)) {
          parsed.chunk.forEach((item: { s?: string; ibi?: number }) => {
            if (item.s) {
              chunks.push({ index: item.ibi ?? 0, text: item.s });
            }
          });
        }
      } catch {
        // Ignore malformed chunks; we still try to parse others.
      }
    });

    if (chunks.length === 0) {
      return {
        content: null,
        debug: 'Found scripts but failed to parse content',
      };
    }

    chunks.sort((a, b) => a.index - b.index);
    return { content: chunks.map((chunk) => chunk.text).join('') };
  } catch (error) {
    return { content: null, debug: `Extraction error: ${String(error)}` };
  }
}

export class GoogleDocsStrategy implements IContentStrategy {
  constructor(private readonly tabService: ITabService) {}

  canHandle(url: string): boolean {
    return /docs\.google\.com\/document/.test(url);
  }

  async getContent(tabId: number, _url: string): Promise<ContentPart> {
    try {
      const payload = await this.tabService.executeScript(tabId, extractGoogleDocsContent);
      const content = payload?.content?.trim();

      if (!content) {
        const debug = payload?.debug ? ` (${payload.debug})` : '';
        return {
          type: 'text',
          text: `${CONTEXT_MESSAGES.NO_CONTENT_WARNING}${debug}`,
        };
      }

      return { type: 'text', text: content };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'text',
        text: `(Could not extract Google Docs content: ${message})`,
      };
    }
  }
}
