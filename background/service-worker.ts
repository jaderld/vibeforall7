type AIProvider = 'openai' | 'gemini';

const AI_STORAGE_KEYS = {
  provider: 'failcAiProvider',
  openaiKey: 'failcOpenAiApiKey',
  geminiKey: 'failcGeminiApiKey',
} as const;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL_PREFERENCES = [
  'models/gemini-2.5-flash',
  'models/gemini-2.0-flash',
  'models/gemini-1.5-flash',
  'models/gemini-1.5-pro',
  'models/gemini-pro',
] as const;

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

function extractJsonResponse(content: string): string {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}$/);
  return jsonMatch ? jsonMatch[0] : trimmed;
}

interface Block {
  text: string;
}

interface ExtensionMessage {
  type: string;
  payload?: { blocks?: Block[] };
  context?: string;
  question?: string;
  status?: 'ok' | 'error';
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
    
    return expectJson ? JSON.parse(textResponse) : textResponse;
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

  const availableModels = await getGeminiGenerateContentModels(apiKey);
  const modelCandidates = buildGeminiModelCandidates(availableModels);

  for (const model of modelCandidates) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
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
          lastError = new Error(`Gemini (${model}) : ${message}`);
          continue;
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

      return expectJson ? JSON.parse(extractJsonResponse(textResponse)) : textResponse;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!/model|not found|unsupported/i.test(lastError.message)) {
        break;
      }
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

function buildGeminiModelCandidates(discoveredModels: string[]): string[] {
  const discoveredSet = new Set(discoveredModels);
  const orderedDiscovered = GEMINI_MODEL_PREFERENCES.filter((model) => discoveredSet.has(model));
  const remainingDiscovered = discoveredModels.filter((model) => !orderedDiscovered.includes(model as (typeof GEMINI_MODEL_PREFERENCES)[number]));

  return [...orderedDiscovered, ...remainingDiscovered];
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

// --------------------------------------------------------
// 3. GESTION DES MESSAGES
// --------------------------------------------------------
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  
  // ANALYSE DE LA PAGE (Résumé + Étapes)
  if (message?.type === 'FETCH_ANALYSIS') {
    (async () => {
      try {
        // Extraction du texte envoyé par le content script
        const blocks = message.payload?.blocks || [];
        const pageText = blocks.map((b: Block) => b.text).join(' ').slice(0, 5000); 
        
        const systemPrompt = `Tu es un expert en accessibilité administrative et en langage FALC (Facile À Lire et à Comprendre). 
        Tu dois IMPÉRATIVEMENT répondre au format JSON strict avec exactement deux clés :
        - "summary" : Un résumé très simple de la page en 2 ou 3 phrases.
        - "steps" : Un tableau (array) de strings contenant 3 ou 4 étapes claires à suivre.`;

        const userPrompt = `Voici le texte extrait de la page web administrative :\n"""${pageText}"""\n\nGénère le JSON demandé.`;
        
        const openAiResult = await callAI(systemPrompt, userPrompt, true);
        
        sendResponse({ 
          simplifiedBlocks: [], 
          summary: openAiResult.summary || "Résumé non disponible.", 
          steps: openAiResult.steps || []
        });
      } catch (err: unknown) {
        console.error("Erreur FETCH_ANALYSIS:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendResponse({ error: errorMessage });
      }
    })();
    return true; 
  }

  // CHAT CONTEXTUEL (Question/Réponse)
  if (message?.type === 'ASK_GEMINI_CONTEXT') {
    (async () => {
      try {
        const systemPrompt = "Tu es un assistant d'accessibilité bienveillant. Réponds de manière directe, rassurante et très facile à comprendre.";
        const userPrompt = `Contexte de la page sur laquelle je me trouve : "${message.context || 'Aucun.'}"\n\nMa question : "${message.question || ''}"`;
        
        const replyText = await callAI(systemPrompt, userPrompt, false);
        chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply: replyText });
      } catch (error: unknown) {
        chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply: "❌ Désolé, erreur de connexion avec l'IA." });
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