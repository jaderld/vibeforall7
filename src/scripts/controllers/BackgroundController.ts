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

type TextReplacement = { original: string; replacement: string };
type GlossaryEntry = { term: string; definition: string };

type TermSimplificationResult = {
  replacements: TextReplacement[];
  glossary: GlossaryEntry[];
  ui_labels: TextReplacement[];
};

// Système/prompt dédié à la simplification de termes + glossaire + libellés UI.
// Reprend exactement les règles fournies : le contenu de page est injecté
// dans le userPrompt, entre <<< >>>, pour rester proche du format original.
const TERM_SIMPLIFICATION_SYSTEM_PROMPT = `Tu es un moteur de transformation de pages web spécialisé en accessibilité et en langage clair.

Ta mission est d'améliorer une page web pour les personnes ayant des troubles cognitifs, de la dyslexie ou une faible maîtrise du numérique.

Tu recevras le texte visible brut extrait d'une page web.

RÈGLES :
1. Ne modifie PAS la structure HTML ni le sens du contenu.
2. Modifie uniquement le contenu textuel.
3. Conserve le sens exact et ne supprime jamais une information importante.
4. Ne mets JAMAIS un terme juridique ou administratif critique (par exemple : impôt, CAF, obligations légales) dans "replacements". Ne remplace JAMAIS ce terme dans le texte visible de la page : ajoute-le uniquement dans "glossary", avec une définition simple. N'écris jamais le texte littéral "[TERM]" nulle part dans ta réponse — ce n'est pas un texte à afficher sur la page.
5. Lorsque c'est pertinent, remplace les textes des boutons et actions de l'interface par des libellés courts, clairs et en MAJUSCULES.
6. Lorsque c'est pertinent, remplace les textes longs par des mots courts et directs, uniquement pour qu'ils soient plus compréhensibles et moins lourds. Ne change jamais le sens.

FORMAT DE SORTIE (JSON STRICT) :

{
  "replacements": [
    {
      "original": "...",
      "replacement": "..."
    }
  ],
  "glossary": [
    {
      "term": "...",
      "definition": "..."
    }
  ],
  "ui_labels": [
    {
      "original": "...",
      "replacement": "..."
    }
  ]
}

RÈGLES DE TRANSFORMATION :

LIBELLÉS D'INTERFACE :
- "Que cherchez-vous ?" ou formulations similaires, qui veulent dire la même chose → "RECHERCHE"
- "Commencer" ou formulations similaires, qui veulent dire la même chose → "COMMENCER"
- "Étape suivante" ou formulations similaires, qui veulent dire la même chose → "SUIVANT"
- "Valider" ou formulations similaires, qui veulent dire la même chose → "CONFIRMER"
- "Mon compte", "Se connecter" ou formulations similaires, qui veulent dire la même chose → "CONNEXION"

SIMPLIFICATION :
- Privilégie des mots courts et directs.
- Utilise des MAJUSCULES pour les actions.
- Évite les phrases longues dans les éléments de l'interface.

GLOSSAIRE (règles strictes) :
- Chaque "term" doit être UN SEUL mot ou une très courte expression (1 à 3 mots maximum, par exemple : "avis d'imposition", "quotient familial", "CAF"). Jamais une phrase, jamais une proposition complète, jamais un passage de texte.
- N'extrais que des mots ou expressions isolés qui semblent difficiles ou techniques (jargon administratif, juridique, ou acronymes) — pas des phrases entières ni des paragraphes.
- Fournis une définition simple en français pour chacun, en une phrase courte.
- Si aucun terme complexe n'apparaît sur la page, renvoie un tableau "glossary" vide plutôt que d'inventer des entrées.

Retourne uniquement le JSON.`

// Nettoie la réponse IA pour ne garder que des tableaux valides de paires
// string/string, quelle que soit la qualité du JSON renvoyé par le modèle.
function sanitizeTextReplacementArray(value: unknown): TextReplacement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is TextReplacement =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as any).original === 'string' &&
      typeof (item as any).replacement === 'string' &&
      (item as any).original.trim().length > 0,
    )
    .map((item) => ({ original: item.original.trim(), replacement: item.replacement.trim() }));
}

function sanitizeGlossaryArray(value: unknown): GlossaryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is GlossaryEntry =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as any).term === 'string' &&
      typeof (item as any).definition === 'string' &&
      (item as any).term.trim().length > 0,
    )
    .map((item) => ({ term: item.term.trim(), definition: item.definition.trim() }));
}

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

  // Appel IA séparé pour la simplification de termes / glossaire / libellés UI.
  // Ne lance JAMAIS d'exception vers l'appelant : en cas d'échec on renvoie null,
  // pour que le content script puisse retomber sur ses règles regex existantes.
  private async fetchTermSimplification(truncatedText: string): Promise<TermSimplificationResult | null> {
    try {
      const userPrompt = `<<<\n${truncatedText}\n>>>`;
      const aiResult = await this.callAI(TERM_SIMPLIFICATION_SYSTEM_PROMPT, userPrompt, true);

      return {
        replacements: sanitizeTextReplacementArray(aiResult?.replacements),
        glossary: sanitizeGlossaryArray(aiResult?.glossary),
        ui_labels: sanitizeTextReplacementArray(aiResult?.ui_labels),
      };
    } catch (error: unknown) {
      console.error('FAILC: échec de la simplification de termes par IA, fallback sur les règles locales.', error);
      return null;
    }
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

      const summarySystemPrompt = `Tu es un expert en accessibilité administrative et en langage FALC (Facile À Lire et à Comprendre).
Tu dois IMPÉRATIVEMENT répondre au format JSON strict avec exactement deux clés :
    - "summary" : Un résumé global de toute la page en 2 ou 3 phrases, pas seulement du premier bloc visible.
- "steps" : Un tableau (array) de strings contenant 3 ou 4 étapes claires à suivre.`;

      const summaryUserPrompt = `URL : ${pageUrl}\nTitre : ${pageTitle}\n\nVoici le texte extrait de la page web administrative :\n"""${truncatedText}"""\n\nGénère le JSON demandé.`;

      // Les deux appels IA (résumé + simplification de termes) partent en parallèle :
      // ils sont indépendants et n'ont pas besoin de s'attendre l'un l'autre.
      const [summarySettled, termsResult] = await Promise.all([
        this.callAI(summarySystemPrompt, summaryUserPrompt, true)
          .then((result) => ({ ok: true as const, result }))
          .catch((error: unknown) => ({ ok: false as const, error })),
        this.fetchTermSimplification(truncatedText),
      ]);

      if (!summarySettled.ok) {
        throw summarySettled.error;
      }

      const aiResult = summarySettled.result;

      sendResponse({
        simplifiedBlocks: [],
        summary: aiResult.summary || 'Résumé non disponible.',
        steps: aiResult.steps || [],
        // Si l'IA de simplification a échoué, on renvoie des tableaux vides :
        // le content script sait retomber sur ses règles regex/glossaire statiques.
        replacements: termsResult?.replacements || [],
        glossary: termsResult?.glossary || [],
        ui_labels: termsResult?.ui_labels || [],
        termsError: termsResult ? null : 'Simplification IA indisponible, règles locales utilisées.',
      });
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      sendResponse({ error: messageText });
    }
  }
}