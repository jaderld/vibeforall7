import { ContextManager } from '../models/ContextManager';
import { ExtensionMessage } from '../types';

const MAX_ANALYSIS_CHARS = 12000;

function sandwichTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const marker = '\n... CONTENU TRONQUE ...\n';
  const headLength = Math.floor((maxChars - marker.length) / 2);
  const tailLength = maxChars - marker.length - headLength;

  return `${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`;
}

type CallAI = (
  systemPrompt: string,
  userPrompt: string,
  expectJson?: boolean,
) => Promise<any>;

export class BackgroundController {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly callAI: CallAI,
  ) {}

  handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ): boolean {
    if (message?.type !== 'FETCH_ANALYSIS') {
      return false;
    }

    void this.handleFetchAnalysis(message, sender, sendResponse);
    return true;
  }

  private async handleFetchAnalysis(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ): Promise<void> {
    try {
      const senderTabId = sender.tab?.id;
      const tabId = message.payload?.tabId ?? senderTabId;
      const fallbackUrl = message.payload?.url ?? sender.tab?.url ?? '';
      const pageUrl = sender.tab?.url || fallbackUrl || 'URL inconnue';
      const pageTitle = sender.tab?.title || 'Titre inconnu';

      if (!tabId) {
        sendResponse({ error: 'Tab ID not found' });
        return;
      }

      const contentPart = await this.contextManager.getContext(tabId, fallbackUrl);
      const pageText =
        contentPart.type === 'text'
          ? contentPart.text
          : `Video URL: ${contentPart.fileUri}`;

      const truncatedText = sandwichTruncate(pageText, MAX_ANALYSIS_CHARS);

      const systemPrompt = `Tu es un expert en accessibilité administrative et en langage FALC (Facile À Lire et à Comprendre).
Tu dois IMPÉRATIVEMENT répondre au format JSON strict avec exactement deux clés :
    - "summary" : Un résumé global de toute la page en 2 ou 3 phrases, pas seulement du premier bloc visible.
- "steps" : Un tableau (array) de strings contenant 3 ou 4 étapes claires à suivre.`;

      const userPrompt = `URL : ${pageUrl}\nTitre : ${pageTitle}\n\nVoici le texte extrait de la page web administrative :\n"""${truncatedText}"""\n\nGénère le JSON demandé.`;
      const aiResult = await this.callAI(systemPrompt, userPrompt, true);

      sendResponse({
        simplifiedBlocks: [],
        summary: aiResult.summary || 'Résumé non disponible.',
        steps: aiResult.steps || [],
      });
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      sendResponse({ error: messageText });
    }
  }
}
