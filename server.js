import 'dotenv/config';
import http from 'http';
import { load } from 'cheerio';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const apiEnabled = Boolean(OPENAI_API_KEY);

const server = http.createServer(async (req, res) => {
  const requestPath = req.url?.split('?')[0] || '';
  if (req.method !== 'POST' || (requestPath !== '/api/analyze-page' && requestPath !== '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body || '{}');
      const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      const titleText = String(parsed.title || '');
      const htmlText = String(parsed.html || '');
      const pageText = extractVisibleText(htmlText);
      const prompt = buildOpenAIPrompt({ url: String(parsed.url || ''), title: titleText, text: pageText, blocks });

      let responsePayload;
      if (apiEnabled) {
        responsePayload = await fetchOpenAIAnalysis(prompt);
      }
      if (!responsePayload) {
        responsePayload = buildFallbackAnalysis({ titleText, htmlText, pageText, blocks });
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(responsePayload));
    } catch (error) {
      console.error('AI server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'invalid payload' }));
    }
  });
});

function extractVisibleText(html) {
  const dom = load(html || '');
  dom('script, style, noscript, iframe, canvas').remove();
  const text = dom('body').text();
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOpenAIPrompt({ url, title, text, blocks }) {
  const blockExamples = blocks.slice(0, 20).map((block, index) => ({
    id: block.id || `block-${index}`,
    text: String(block.text || '').replace(/\s+/g, ' ').trim()
  }));

  return `Tu es un assistant pour simplifier des pages administratives françaises.
Reçois l'URL suivante : ${url}
Titre de la page : ${title}
Texte extrait de la page : ${text}

Analyse le contenu et retourne uniquement un objet JSON avec ces clés :
- simplifiedBlocks : tableau d'objets { id, falc }
- glossary : tableau d'objets { term, definition }
- contactInfo : objet { telephone, email, adresse, horaires }
- voiceFormAvailable : booléen
- summary : chaîne
- steps : tableau de chaînes courtes
- highlightedSelectors : tableau de sélecteurs CSS

Règles :
1. Ne renvoie que du JSON valide. Pas d'explications supplémentaires.
2. Simplifie le texte en français simple, sans jargon inutile.
3. Si la page mentionne un formulaire, voiceFormAvailable doit être true.
4. Glossary doit contenir au moins les termes importants détectés.
5. Utilise au maximum 6 étapes claires.

Voici quelques blocs extraits :
${JSON.stringify(blockExamples, null, 2)}
`;
}

async function fetchOpenAIAnalysis(prompt) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: 'Tu es un assistant expert pour résumer et simplifier des informations administratives françaises.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.0,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      console.warn('OpenAI response not ok:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    return parseJsonResponse(content);
  } catch (error) {
    console.warn('OpenAI fetch failed:', error);
    return null;
  }
}

function parseJsonResponse(content) {
  try {
    const jsonMatch = content.trim().match(/\{[\s\S]*\}$/);
    const raw = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.simplifiedBlocks)) {
      return parsed;
    }
  } catch (error) {
    console.warn('JSON parse failed:', error, 'content:', content);
  }
  return null;
}

function buildFallbackAnalysis({ titleText, htmlText, pageText, blocks }) {
  const combinedText = `${titleText} ${pageText}`;
  return {
    simplifiedBlocks: blocks.map((block, index) => ({
      id: block.id || `block-${index}`,
      falc: simplifyText(block.text || '', titleText, combinedText)
    })),
    glossary: buildGlossary(combinedText),
    contactInfo: extractContactInfo(combinedText),
    voiceFormAvailable: /<form/i.test(htmlText),
    summary: buildSummary(combinedText),
    steps: [
      'Repérez la rubrique principale et les actions demandées.',
      'Préparez les pièces justificatives ou informations utiles.',
      'Suivez les étapes affichées et gardez les coordonnées à portée de main.'
    ],
    highlightedSelectors: ['form', 'button', 'input', 'a']
  };
}

function simplifyText(text, title = '', combinedText = '') {
  if (!text) return 'Informations à consulter.';
  let simplified = `${title} ${text}`.replace(/\s+/g, ' ').trim();
  const lower = `${combinedText} ${simplified}`.toLowerCase();

  if (/(déclar|imp[oô]t|taxe|revenu|fisc)/.test(lower)) {
    simplified = `${simplified} Vous devez remplir un formulaire ou vérifier un document fiscal.`;
  }
  if (/(paiement|cotisation|montant|versement|facture)/.test(lower)) {
    simplified = `${simplified} Vérifiez le montant à payer ou à préparer.`;
  }
  if (/(pièce|document|justificatif|renseigne|dossier)/.test(lower)) {
    simplified = `${simplified} Préparez les pièces demandées avant de poursuivre.`;
  }

  return simplified
    .replace(/\bavis d['’]imposition\b/gi, 'document de l’administration')
    .replace(/\bcomplémentaire santé\b/gi, 'mutuelle')
    .replace(/\bcotisation\b/gi, 'paiement')
    .replace(/\bdéclaration\b/gi, 'formulaire à remplir')
    .replace(/\bimpôt\b/gi, 'taxe')
    .replace(/\ballocation\b/gi, 'aide financière')
    .replace(/\bcaf\b/gi, 'caisse d’allocations familiales')
    .replace(/\burssaf\b/gi, 'organisme chargé des cotisations sociales')
    .replace(/\bsécurité sociale\b/gi, 'protection sociale')
    .replace(/\bdémarche\b/gi, 'action administrative')
    .replace(/\bformulaire\b/gi, 'formulaire simple')
    .replace(/\bdocuments?\b/gi, 'pièces à fournir');
}

function buildSummary(text) {
  const lower = String(text || '').toLowerCase();
  if (/(déclar|imp[oô]t|taxe|revenu|fisc)/.test(lower)) {
    return 'Cette page concerne une démarche fiscale ou administrative. Rassemblez les documents demandés et remplissez le formulaire avec les informations exactes.';
  }
  if (/(paiement|cotisation|montant|versement|facture)/.test(lower)) {
    return 'Cette page concerne un paiement ou une cotisation. Vérifiez le montant et les moyens de paiement proposés.';
  }
  return 'Cette page contient des informations administratives. Repérez les étapes principales, les documents demandés et les coordonnées utiles.';
}

function buildGlossary(text) {
  const entries = [];
  const patterns = [
    { term: "avis d'imposition", definition: 'Document envoyé par l’administration pour expliquer le montant de votre impôt.' },
    { term: 'cotisation', definition: 'Montant payé pour financer un service ou une assurance.' },
    { term: 'complémentaire santé', definition: 'Garantie qui complète la couverture de base pour les soins médicaux.' },
    { term: 'caf', definition: 'Caisse d’allocations familiales, organisme qui gère certaines aides.' },
    { term: 'urssaf', definition: 'Organisme chargé du contrôle et du recouvrement des cotisations sociales.' }
  ];
  patterns.forEach((entry) => {
    if (text.toLowerCase().includes(entry.term.toLowerCase())) {
      entries.push(entry);
    }
  });
  return entries;
}

function extractContactInfo(text) {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] || '';
  const telephone = /(\+33|0)[0-9 .-]{8,14}/.exec(text)?.[0] || '';
  return {
    telephone,
    email,
    adresse: /adresse[^\n:]{0,80}([A-ZÀ-ÿ0-9'’., -]{4,80})/i.exec(text)?.[1]?.trim() || '',
    horaires: /horaires?[^\n:]{0,80}([A-ZÀ-ÿ0-9'’., -]{4,80})/i.exec(text)?.[1]?.trim() || ''
  };
}

server.listen(8787, '127.0.0.1', () => {
  console.log(`FAILC AI server running on http://127.0.0.1:8787 (OpenAI ${apiEnabled ? 'enabled' : 'disabled'})`);
});
