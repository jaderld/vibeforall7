import { BackgroundController } from './controllers/BackgroundController';
import { ContextManager } from './models/ContextManager';
import { TabContext } from './models/TabContext';
import { TabService } from './services/tabService';
import { DefaultWebPageStrategy } from './strategies/DefaultWebPageStrategy';
import { ChatHistoryTurn, ExtensionMessage } from './types';
import { FormFillController } from './controllers/FormFillController';

type AIProvider = 'openai' | 'gemini';

const AI_STORAGE_KEYS = {
  provider: 'failcAiProvider',
  openaiKey: 'failcOpenAiApiKey',
  geminiKey: 'failcGeminiApiKey',
} as const;

const OPENAI_API_URL = '[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)';
const GEMINI_API_URL_BASE = '[https://generativelanguage.googleapis.com/v1beta/models](https://generativelanguage.googleapis.com/v1beta/models)';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_PRIMARY_MODEL = 'models/gemini-3.1-flash-lite';
const GEMINI_MODELS_CACHE_TTL_MS = 10 * 60 * 1000;

let geminiModelsCache: {
  apiKey: string;
  models: string[];
  fetchedAt: number;
} | null = null;

// --------------------------------------------------------
// TYPES ET INTERFACES (Pour satisfaire TypeScript)
// --------------------------------------------------------
interface OpenAIRequestBody {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  response_format?: { type: string };
}

interface GeminiRequestBody {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig: {
    temperature: number;
    responseMimeType?: string;
  };
}

interface AISettings {
  provider: AIProvider;
  openaiKey: string;
  geminiKey: string;
}

interface GeminiModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

// --------------------------------------------------------
// FONCTION DE NETTOYAGE JSON (Correction Gemini Markdown)
// --------------------------------------------------------
function cleanAndParseJSON(aiResponse: string) {
  try {
    // 1. On retire les balises Markdown ```json et ```
    let cleanedText = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // 2. Sécurité supplémentaire : on extrait de force ce qui se trouve entre { et }
    // au cas où Gemini aurait ajouté du blabla avant ou après (ex: "Voici le JSON :")
    const firstBrace = cleanedText.indexOf('{');
    const lastBrace = cleanedText.lastIndexOf('}');
    
    // On extrait aussi pour les tableaux [ ] au cas où l'IA renverrait une liste
    const firstBracket = cleanedText.indexOf('[');
    const lastBracket = cleanedText.lastIndexOf(']');

    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      cleanedText = cleanedText.substring(firstBracket, lastBracket + 1);
    }

    // 3. On parse le JSON assaini
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Échec critique du parsing JSON. Texte brut renvoyé par l'IA :", aiResponse);
    throw error;
  }
}

// Construit un rendu texte de l'historique pour le donner en contexte au modèle
function formatChatHistory(history: ChatHistoryTurn[] | undefined): string {
  if (!Array.isArray(history) || history.length === 0) {
    return 'Aucun échange précédent.';
  }

  return history
    .filter((turn) => turn && typeof turn.content === 'string')
    .map((turn) => `${turn.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${turn.content}`)
    .join('\n');
}

// --------------------------------------------------------
// 1. INITIALISATION DE L'EXTENSION
// --------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'failc-selection',
    title: 'Simplifier cette sélection avec FAILC',
    contexts: ['selection']
  });

  // Ouvre le side panel automatiquement au clic sur l'icône.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: unknown) => {
    console.error('FAILC: impossible d’activer le side panel au clic', err);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'failc-selection' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_SELECTION', selectionText: info.selectionText, tabId: tab.id });
  }
});

// --------------------------------------------------------
// 2. MOTEUR IA
// --------------------------------------------------------
async function getAISettings(): Promise<AISettings> {
  const result = await chrome.storage.local.get([
    AI_STORAGE_KEYS.provider,
    AI_STORAGE_KEYS.openaiKey,
    AI_STORAGE_KEYS.geminiKey,
  ]);

  return {
    provider: (result[AI_STORAGE_KEYS.provider] as AIProvider) || 'openai',
    openaiKey: String(result[AI_STORAGE_KEYS.openaiKey] || '').trim(),
    geminiKey: String(result[AI_STORAGE_KEYS.geminiKey] || '').trim(),
  };
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  expectJson: boolean = false,
): Promise<any> {
  try {
    const requestBody: OpenAIRequestBody = {
      model: DEFAULT_OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    };

    if (expectJson) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Erreur API OpenAI');
    }

    const data = await response.json();
    const textResponse = data.choices[0].message.content;

    return expectJson ? cleanAndParseJSON(textResponse) : textResponse;
  } catch (error: unknown) {
    console.error('Erreur appel OpenAI :', error);
    throw error;
  }
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  expectJson: boolean = false,
): Promise<any> {
  const requestBody: GeminiRequestBody = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  };

  if (expectJson) {
    requestBody.generationConfig.responseMimeType = 'application/json';
  }

  let lastError: Error | null = null;

  const modelCandidates = [GEMINI_PRIMARY_MODEL];

  for (const model of modelCandidates) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        let message = errorText || 'Erreur API Gemini';

        try {
          const parsed = JSON.parse(errorText);
          message = parsed?.error?.message || message;
        } catch {
          // Non-JSON error payload; keep raw text.
        }

        if (/model|not found|unsupported/i.test(message)) {
          throw new Error(`Le modele Gemini configure (${model}) n'est pas disponible pour cette cle API. Utilisez une cle avec acces a ce modele.`);
        }

        throw new Error(message);
      }

      const data = await response.json();
      const textResponse = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('')
        .trim();

      if (!textResponse) {
        throw new Error('Réponse Gemini vide');
      }

      return expectJson ? cleanAndParseJSON(textResponse) : textResponse;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      break;
    }
  }

  console.error('Erreur appel Gemini :', lastError);
  throw lastError || new Error('Erreur API Gemini');
}

async function getGeminiGenerateContentModels(apiKey: string): Promise<string[]> {
  const response = await fetch(`${GEMINI_API_URL_BASE}?key=${apiKey}`);

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText || 'Impossible de récupérer la liste des modèles Gemini.';

    try {
      const parsed = JSON.parse(errorText);
      message = parsed?.error?.message || message;
    } catch {
      // Non-JSON error payload; keep raw text.
    }

    throw new Error(message);
  }

  const data = await response.json();
  const models: GeminiModelInfo[] = Array.isArray(data?.models) ? data.models : [];

  return models
    .filter((model) => model?.name && model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name);
}

async function getGeminiGenerateContentModelsCached(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (
    geminiModelsCache &&
    geminiModelsCache.apiKey === apiKey &&
    now - geminiModelsCache.fetchedAt < GEMINI_MODELS_CACHE_TTL_MS
  ) {
    return geminiModelsCache.models;
  }

  const models = await getGeminiGenerateContentModels(apiKey);
  geminiModelsCache = {
    apiKey,
    models,
    fetchedAt: now,
  };
  return models;
}

async function callAI(systemPrompt: string, userPrompt: string, expectJson: boolean = false): Promise<any> {
  const settings = await getAISettings();
  const providerOrder: AIProvider[] = settings.provider === 'gemini'
    ? ['gemini', 'openai']
    : ['openai', 'gemini'];

  for (const provider of providerOrder) {
    if (provider === 'openai' && settings.openaiKey) {
      try {
        return await callOpenAI(settings.openaiKey, systemPrompt, userPrompt, expectJson);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (settings.geminiKey && /api key|authorization|unauthorized|invalid key/i.test(message)) {
          return callGemini(settings.geminiKey, systemPrompt, userPrompt, expectJson);
        }
        throw error;
      }
    }
    if (provider === 'gemini' && settings.geminiKey) {
      try {
        return await callGemini(settings.geminiKey, systemPrompt, userPrompt, expectJson);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (settings.openaiKey && /api key|authorization|unauthorized|invalid key/i.test(message)) {
          return callOpenAI(settings.openaiKey, systemPrompt, userPrompt, expectJson);
        }
        throw error;
      }
    }
  }

  throw new Error('Veuillez enregistrer une clé API OpenAI ou Gemini.');
}

const tabService = new TabService();
const tabContext = new TabContext([
  new DefaultWebPageStrategy(tabService),
]);
const contextManager = new ContextManager(tabContext, tabService);
const backgroundController = new BackgroundController(contextManager, callAI);
const formFillController = new FormFillController(callAI);

// --------------------------------------------------------
// 3. GESTION DES MESSAGES
// --------------------------------------------------------
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (backgroundController.handleMessage(message, sender, sendResponse)) {
    return true;
  }

  if (formFillController.handleMessage(message, sender, sendResponse)) {
    return true;
  }

  // CHAT CONTEXTUEL (Question/Réponse) — avec mémoire de conversation et corrélation par requestId
  if (message?.type === 'ASK_GEMINI_CONTEXT') {
    const requestId = message.requestId;

    (async () => {
      try {
        const systemPrompt = "Tu es un assistant d'accessibilité bienveillant, spécialisé dans l'aide aux démarches administratives françaises (CAF, URSSAF, impôts, etc.). Réponds de manière directe, rassurante et très facile à comprendre (langage FALC). Va à l'essentiel, les réponses doivent être courtes, évite les longues phrases rédigées, va à l'essentiel."
  + "Pour les questions portant sur des éléments précis de la page (où se trouve un bouton, comment remplir un champ, quelle démarche faire ici), base-toi en priorité sur le contexte de la page fourni. "
  + "Pour les questions plus générales sur le sujet administratif ou fiscal concerné par la page (définitions, notions, noms propres, acronymes, sigles, etc même des questions de compréhension générale), tu peux répondre avec tes connaissances générales même si ce n'est pas mentionné sur la page, en donnant une explication simple et accessible. "
  + "N'indique que tu ne sais pas que si la question sort réellement du domaine administratif/fiscal ou si tu n'as vraiment pas l'information.";

        const historyText = formatChatHistory(message.history);

        const userPrompt = `Contexte de la page sur laquelle je me trouve : "${message.context || 'Aucun.'}"\n\nHistorique de la conversation :\n${historyText}\n\nNouvelle question de l'utilisateur : "${message.question || ''}"`;

        const replyText = await callAI(systemPrompt, userPrompt, false);
        chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply: replyText, requestId });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : '';
        const friendlyMessage = details && /clé|api key|authorization/i.test(details)
          ? "❌ Aucune clé API valide n'est configurée. Ouvrez les paramètres pour en ajouter une."
          : "❌ Désolé, une erreur est survenue pendant la connexion à l'IA.";
        chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply: friendlyMessage, requestId });
      }
    })();
    return true;
  }

  // GESTION DU BADGE SUR L'ICÔNE
  if (message?.type === 'SET_BADGE') {
    try {
      const status = message.status;
      chrome.action.setBadgeText({ text: status === 'ok' ? '✓' : '!' });
      chrome.action.setBadgeBackgroundColor({ color: status === 'ok' ? '#2e7d32' : '#c62828' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    } catch (e: unknown) {
      // ignore
    }
  }

  return false;
});