import http from 'http';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}');
      const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      const htmlText = stripHtml(parsed.html || '');
      const titleText = String(parsed.title || '');
      const combinedText = `${titleText} ${htmlText}`;
      const simplifiedBlocks = blocks.map((block, index) => ({
        id: block.id || `block-${index}`,
        falc: simplifyText(block.text || '', titleText, combinedText)
      }));

      const glossary = buildGlossary(combinedText);
      const contactInfo = extractContactInfo(combinedText);
      const summary = buildSummary(combinedText);

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        simplifiedBlocks,
        glossary,
        contactInfo,
        voiceFormAvailable: /<form/i.test(parsed.html || ''),
        summary,
        steps: [
          'Repérez la rubrique principale et les actions demandées.',
          'Préparez les pièces justificatives ou informations utiles.',
          'Suivez les étapes affichées et gardez les coordonnées à portée de main.'
        ],
        highlightedSelectors: ['form', 'button', 'input', 'a']
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'invalid payload' }));
    }
  });
});

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function simplifyText(text, title = '', combinedText = '') {
  if (!text) return 'Informations à consulter.';
  let simplified = `${title} ${text}`.replace(/\s+/g, ' ').trim();
  const lower = `${combinedText} ${simplified}`.toLowerCase();

  if (/(déclar|imp[oô]t|taxe|revenu|fisc)/i.test(lower)) {
    simplified = `${simplified} Vous devez remplir un formulaire ou vérifier un document fiscal.`;
  }
  if (/(paiement|cotisation|montant|versement|facture)/i.test(lower)) {
    simplified = `${simplified} Vérifiez le montant à payer ou à préparer.`;
  }
  if (/(pièce|document|justificatif|renseigne|dossier)/i.test(lower)) {
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
    { term: 'avis d\'imposition', definition: 'Document envoyé par l’administration pour expliquer le montant de votre impôt.' },
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
  console.log('FAILC AI server running on http://127.0.0.1:8787');
});
