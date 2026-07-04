type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';

type SimplifiedBlock = { id: string; falc: string };
type GlossaryEntry = { term: string; definition: string };
type ContactInfo = { telephone: string; email: string; adresse: string; horaires: string };

type AnalysisResponse = {
  simplifiedBlocks: SimplifiedBlock[];
  glossary: GlossaryEntry[];
  contactInfo: ContactInfo;
  voiceFormAvailable: boolean;
  summary: string;
  steps: string[];
  highlightedSelectors: string[];
};

const ADMIN_KEYWORDS = ['déclaration', 'cotisation', 'avis', 'impôt', 'caf', 'urssaf', 'allocation', 'sécurité sociale', 'démarche', 'complémentaire santé', 'impot', 'retraite', 'pension'];
const STORAGE_PREFIX = 'failc:';
const TERM_DEFINITIONS: Array<{ term: string; definition: string }> = [
  { term: 'avis d\'imposition', definition: 'Document envoyé par l’administration pour expliquer le montant de votre impôt.' },
  { term: 'cotisation', definition: 'Montant payé pour financer un service ou une assurance.' },
  { term: 'complémentaire santé', definition: 'Garantie qui complète la couverture de base pour les soins médicaux.' },
  { term: 'caf', definition: 'Caisse d’allocations familiales, organisme qui gère certaines aides.' },
  { term: 'urssaf', definition: 'Organisme chargé du contrôle et du recouvrement des cotisations sociales.' },
  { term: 'allocation', definition: 'Aide financière versée par l’État ou un organisme public.' },
  { term: 'démarche', definition: 'Action administrative à réaliser auprès d’un service public.' }
];

let activeProfile: Profile = 'standard';
let currentPopover: HTMLDivElement | null = null;

function getCurrentProfile(): Profile {
  return activeProfile;
}

function applyProfileStyles(profile: Profile) {
  const existing = document.getElementById('failc-profile-style');
  if (existing) existing.remove();

  if (profile === 'standard') {
    const base = document.getElementById('failc-base-style');
    if (base) base.remove();
    return;
  }

  const baseStyle = document.createElement('style');
  baseStyle.id = 'failc-base-style';
  baseStyle.textContent = `
    .failc-term { border-bottom: 2px dotted #0b5fff; cursor: help; text-decoration: none; }
    .failc-popover { position: fixed; z-index: 2147483647; background: #0f172a; color: #fff; padding: 10px 12px; border-radius: 8px; max-width: 260px; font-size: 14px; line-height: 1.4; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
    .failc-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646; background: #102a43; color: #fff; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  `;
  document.head.appendChild(baseStyle);

  const style = document.createElement('style');
  style.id = 'failc-profile-style';
  style.textContent = profile === 'dyslexia'
    ? `
      body, body * { font-family: Arial, sans-serif !important; }
      body, body * { line-height: 1.65 !important; text-align: left !important; }
      p, li, td, h1, h2, h3, button, a { letter-spacing: 0.01em !important; }
    `
    : profile === 'low-vision'
      ? `
        body { background: #111 !important; color: #f8f8f8 !important; }
        body * { color: inherit !important; }
        body a, body button { font-size: 1.2em !important; padding: 0.4em 0.6em !important; }
        body p, body li, body td, body h1, body h2, body h3 { font-size: 1.2em !important; }
      `
      : `
        * { animation: none !important; transition: none !important; }
        video { autoplay: false !important; }
      `;

  document.head.appendChild(style);
}

function isAdministrativePage() {
  const formCount = document.querySelectorAll('form').length;
  const text = `${document.title} ${document.querySelector('h1')?.textContent || ''} ${document.querySelector('h2')?.textContent || ''}`.toLowerCase();
  const hasKeyword = ADMIN_KEYWORDS.some((keyword) => text.includes(keyword));
  return formCount > 0 || hasKeyword || document.querySelectorAll('p, li, td').length > 6;
}

function createLoadingIndicator() {
  const existing = document.getElementById('failc-loading');
  if (existing) return existing as HTMLDivElement;
  const el = document.createElement('div');
  el.id = 'failc-loading';
  el.textContent = 'Analyse en cours...';
  el.style.cssText = `position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#0b5fff;color:#fff;padding:10px 12px;border-radius:8px;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,0.2);max-width:220px;`;
  document.body.appendChild(el);
  return el;
}

function removeLoadingIndicator() {
  document.getElementById('failc-loading')?.remove();
}

function ensureFloatingAssistant() {
  if (document.getElementById('failc-floating-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'failc-floating-panel';
  panel.style.cssText = `position:fixed;right:0;top:0;bottom:0;z-index:2147483647;width:min(380px, calc(100vw - 24px));overflow:auto;background:#f8fafc;border-left:1px solid #cbd5e1;box-shadow:-8px 0 40px rgba(15,23,42,0.15);padding:16px;font-family:Arial,sans-serif;color:#111;`;
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <strong style="font-size:15px;">FAILC Assistant</strong>
      <div style="display:flex;gap:6px;">
        <button id="failc-floating-collapse" type="button" style="border:0;background:#eff6ff;color:#0b5fff;border-radius:999px;padding:4px 8px;cursor:pointer;font-size:12px;">réduire</button>
        <button id="failc-floating-close" type="button" style="border:0;background:transparent;cursor:pointer;font-size:16px;">✕</button>
      </div>
    </div>
    <div id="failc-floating-body" style="font-size:13px;line-height:1.45;color:#334155;">
      Ce panneau accompagne la page et propose une version plus simple des blocs administratifs.
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button id="failc-floating-analyze" type="button" style="flex:1;min-height:38px;border:0;border-radius:8px;background:#0b5fff;color:#fff;cursor:pointer;">Analyser</button>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#failc-floating-close')?.addEventListener('click', () => panel.remove());
  panel.querySelector('#failc-floating-collapse')?.addEventListener('click', () => {
    const body = document.getElementById('failc-floating-body');
    if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  });
  panel.querySelector('#failc-floating-analyze')?.addEventListener('click', () => {
    void analyzePage(true);
  });
}

function updateFloatingAssistant(data: AnalysisResponse | null) {
  ensureFloatingAssistant();
  const panel = document.getElementById('failc-floating-panel');
  const body = document.getElementById('failc-floating-body');
  if (!panel || !body) return;

  const summary = data?.summary || 'Aucune analyse disponible pour le moment.';
  const steps = data?.steps?.slice(0, 3) || [];
  const formNotice = data?.voiceFormAvailable
    ? '<div style="margin-top:8px;padding:10px;border:1px solid #0b5fff;border-radius:10px;background:#eff6ff;color:#0f172a;">Formulaire détecté sur cette page.</div>'
    : '';
  const contacts = [
    data?.contactInfo.telephone ? `📞 ${data.contactInfo.telephone}` : '',
    data?.contactInfo.email ? `✉️ ${data.contactInfo.email}` : '',
    data?.contactInfo.adresse ? `📍 ${data.contactInfo.adresse}` : ''
  ].filter(Boolean);

  body.innerHTML = `
    <div style="margin-bottom:10px;"><strong>Résumé</strong><div style="margin-top:6px;">${summary}</div></div>
    ${formNotice}
    ${steps.length ? `<div style="margin-bottom:10px;"><strong>À faire</strong><ul style="margin:6px 0 0 16px;padding:0;">${steps.map((step) => `<li>${step}</li>`).join('')}</ul></div>` : ''}
    ${contacts.length ? `<div><strong>Coordonnées</strong><div style="margin-top:6px;">${contacts.join('<br/>')}</div></div>` : ''}
  `;
}

function setBadge(status: 'ok' | 'error') {
  // Content scripts may not have access to chrome.action in all contexts — delegate to background.
  try {
    chrome.runtime.sendMessage({ type: 'SET_BADGE', status });
  } catch (e) {
    // ignore
  }
}

function showInlineNotice(message: string) {
  const existing = document.getElementById('failc-notice');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'failc-notice';
  el.textContent = message;
  el.style.cssText = `position:fixed;left:16px;bottom:72px;z-index:2147483647;background:#fff3cd;color:#6b4f00;padding:10px 12px;border:1px solid #ffe79a;border-radius:8px;max-width:280px;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showAccessibilityGuide(data: AnalysisResponse) {
  ensureFloatingAssistant();
  updateFloatingAssistant(data);
}

function applyAccessibilityProfile(profile: Profile) {
  activeProfile = profile;
  applyProfileStyles(profile);
  chrome.storage.local.set({ failcProfile: profile });
  const bannerMessage = profile === 'dyslexia'
    ? 'Police adaptée et espacement amélioré.'
    : profile === 'low-vision'
      ? 'Contraste et taille de texte renforcés.'
      : profile === 'anti-epilepsy'
        ? 'Animations et transitions désactivées.'
        : 'Profil standard appliqué.';
  showInlineNotice(bannerMessage);
}

function collectBlocks() {
  const selector = 'p, li, td, h1, h2, h3, h4, h5, h6, label';
  const elements = Array.from(document.querySelectorAll(selector));
  const blocks: Array<{ id: string; text: string; html: string; tagName: string }> = [];
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.closest('script, style, noscript, svg, form, button, input, textarea, select, iframe')) return;
    const text = element.innerText?.trim() || element.textContent?.trim() || '';
    const isVisible = element.getClientRects().length > 0 || element.tagName === 'BODY' || element.tagName === 'HTML';
    if (!text || text.length < 12 || !isVisible) return;
    const id = `failc-${Math.random().toString(36).slice(2, 10)}`;
    element.setAttribute('data-failc-id', id);
    blocks.push({ id, text, html: element.outerHTML.slice(0, 2400), tagName: element.tagName.toLowerCase() });
  });
  return blocks.slice(0, 60);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function simplifyText(text: string, html = ''): string {
  let normalized = `${text || ''}`.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Informations à consulter.';

  const combined = `${normalized} ${html}`.toLowerCase();
  const guidance: string[] = [];

  if (/(déclar|imp[oô]t|taxe|revenu|fisc)/i.test(combined)) {
    guidance.push('Vous devez remplir un formulaire ou vérifier un document fiscal.');
  }
  if (/(paiement|cotisation|montant|versement|facture)/i.test(combined)) {
    guidance.push('Vérifiez le montant à payer ou à préparer.');
  }
  if (/(pièce|document|justificatif|renseigne|dossier)/i.test(combined)) {
    guidance.push('Préparez les pièces demandées avant de poursuivre.');
  }
  if (/(contact|adresse|téléphone|email|horaire|service)/i.test(combined)) {
    guidance.push('Repérez les coordonnées utiles et les services associés.');
  }

  const replacements: Array<[RegExp, string]> = [
    [/\bavis d['’]imposition\b/gi, 'document de l’administration'],
    [/\bcomplémentaire santé\b/gi, 'mutuelle'],
    [/\bcotisation\b/gi, 'paiement'],
    [/\bdéclaration\b/gi, 'formulaire à remplir'],
    [/\bimpôt\b/gi, 'taxe'],
    [/\ballocation\b/gi, 'aide financière'],
    [/\bcaf\b/gi, 'caisse d’allocations familiales'],
    [/\burssaf\b/gi, 'organisme chargé des cotisations sociales'],
    [/\bsécurité sociale\b/gi, 'protection sociale'],
    [/\bdémarche\b/gi, 'action administrative'],
    [/\bformulaire\b/gi, 'formulaire simple'],
    [/\bdocuments?\b/gi, 'pièces à fournir']
  ];

  replacements.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  const finalText = `${normalized}${guidance.length ? ` ${guidance.join(' ')}` : ''}`.trim();
  return finalText.length > 220 ? `${finalText.slice(0, 217).trimEnd()}…` : finalText;
}

function extractContactInfo(text: string): ContactInfo {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] || '';
  const telephone = /(\+33|0)[0-9 .-]{8,14}/.exec(text)?.[0] || '';
  const adresseMatch = /adresse[^\n:]{0,80}([A-ZÀ-ÿ0-9'’., -]{4,80})/i.exec(text);
  const horairesMatch = /horaires?[^\n:]{0,80}([A-ZÀ-ÿ0-9'’., -]{4,80})/i.exec(text);
  return {
    telephone,
    email,
    adresse: adresseMatch?.[1]?.trim() || '',
    horaires: horairesMatch?.[1]?.trim() || ''
  };
}

function buildGlossary(text: string): GlossaryEntry[] {
  const glossary: GlossaryEntry[] = [];
  TERM_DEFINITIONS.forEach((entry) => {
    if (text.toLowerCase().includes(entry.term.toLowerCase())) {
      glossary.push(entry);
    }
  });
  return glossary;
}

function analyzeLocally(blocks: Array<{ id: string; text: string; html: string; tagName: string }>): AnalysisResponse {
  const visibleText = blocks.map((block) => block.text).join(' ');
  const glossary = buildGlossary(visibleText);
  const contactInfo = extractContactInfo(visibleText);

  const lowerText = visibleText.toLowerCase();
  // Detect page type and intents
  const isTax = /déclar|imp[oô]t|revenu|fisc|taxe/.test(lowerText);
  const isPayment = /paiement|cotisation|montant|versement|facture/.test(lowerText);
  const isDocumentPrep = /document|pièce|justificatif|dossier|télécharger|téléverse|téléverser/.test(lowerText);
  const isForm = document.querySelectorAll('form').length > 0;

  // Extract headings and form labels to make the summary specific
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => (h.textContent || '').trim()).filter(Boolean);
  const firstHeading = headings[0] || document.title || '';

  const formLabels = Array.from(document.querySelectorAll('label')).map(l => (l.textContent || '').trim()).filter(Boolean).slice(0, 12);

  // Find dates and amounts
  const dateMatches = visibleText.match(/\b\d{1,2}\s?(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi) || [];
  const amountMatches = visibleText.match(/\b\d+[\s\d,.]*€\b/g) || [];

  // Build a focused summary
  let summaryParts: string[] = [];
  if (firstHeading) summaryParts.push(`Titre principal : ${firstHeading}.`);
  if (isTax) summaryParts.push('Sujet principal : démarche fiscale / impôts.');
  if (isPayment) summaryParts.push('Cette page traite d’un paiement ou d’une cotisation.');
  if (isDocumentPrep) summaryParts.push('La page demande de préparer des documents ou justificatifs.');
  if (isForm) summaryParts.push('Il y a un formulaire à compléter sur cette page.');
  if (formLabels.length) summaryParts.push(`Champs visibles : ${formLabels.slice(0,6).join(', ')}${formLabels.length>6?'...':''}.`);
  if (amountMatches.length) summaryParts.push(`Montants repérés : ${amountMatches.slice(0,3).join(', ')}.`);
  if (dateMatches.length) summaryParts.push(`Dates ou délais repérés : ${dateMatches.slice(0,3).join(', ')}.`);

  const whatToDo: string[] = [];
  if (isForm) whatToDo.push('Remplir le formulaire en suivant l’ordre des champs.');
  if (isDocumentPrep) whatToDo.push('Préparer les pièces justificatives demandées (pièce d’identité, justificatif de domicile, avis, etc.).');
  if (isPayment) whatToDo.push('Vérifier le montant indiqué et préparer un moyen de paiement sécurisé.');
  if (!whatToDo.length) whatToDo.push('Repérez les actions principales et suivez les étapes indiquées.');

  const summary = summaryParts.length ? `${summaryParts.join(' ')} Ce qu’il faut faire : ${whatToDo.join(' ')}` : 'Cette page semble contenir des informations administratives ; suivez les instructions affichées et préparez les pièces demandées.';

  // Build actionable steps, short and accessible
  const steps = [] as string[];
  if (firstHeading) steps.push(`Vérifier la rubrique : ${firstHeading}.`);
  if (formLabels.length) steps.push(`Remplir les champs importants comme : ${formLabels.slice(0,3).join(', ')}.`);
  if (dateMatches.length) steps.push(`Respecter les dates indiquées : ${dateMatches[0]}.`);
  if (amountMatches.length) steps.push(`Vérifier les montants (${amountMatches.slice(0,2).join(', ')}).`);
  steps.push('Préparez les pièces demandées et suivez l’ordre indiqué.');

  const highlightedSelectors = ['form', 'button', 'input', 'a'];

  return {
    simplifiedBlocks: blocks.map((block) => ({ id: block.id, falc: simplifyText(block.text, block.html) })),
    glossary,
    contactInfo,
    voiceFormAvailable: isForm,
    summary,
    steps,
    highlightedSelectors
  };
}

async function fetchAnalysis(blocks: Array<{ id: string; text: string; html: string; tagName: string }>): Promise<AnalysisResponse> {
  // Delegate network request to the background service worker to avoid CORS and private-network restrictions.
  return new Promise<AnalysisResponse>((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'FETCH_ANALYSIS', payload: { url: location.href, title: document.title, html: document.body?.innerHTML || '', blocks, hasForm: document.querySelectorAll('form').length > 0 } }, (response) => {
        // If the message channel closed or an error occurred, chrome.runtime.lastError will be set.
        if (chrome.runtime.lastError) {
          // Fallback to local analysis to avoid unhandled promise / console error when sender or background is reloaded/closed.
          resolve(analyzeLocally(blocks));
          return;
        }
        if (response && (response as any).simplifiedBlocks) {
          resolve(response as AnalysisResponse);
        } else {
          // background returned nothing — fallback to local analysis
          resolve(analyzeLocally(blocks));
        }
      });
    } catch (e) {
      resolve(analyzeLocally(blocks));
    }
  });
}

async function analyzePage(force = false) {
  if (!force && !isAdministrativePage()) return;
  ensureFloatingAssistant();
  const loading = createLoadingIndicator();
  const blocks = collectBlocks();
  try {
    const data = await fetchAnalysis(blocks);
    showAccessibilityGuide(data);
    updateFloatingAssistant(data);
    const storageKey = `${STORAGE_PREFIX}${location.href}`;
    await chrome.storage.local.set({ [storageKey]: { glossary: data.glossary, contactInfo: data.contactInfo, voiceFormAvailable: data.voiceFormAvailable } });
    applyGlossaryHighlights(data.glossary);
    attachGlossaryInteractions();
    setBadge('ok');
  } catch (error) {
    setBadge('error');
    showInlineNotice('Analyse indisponible, réessayez');
  } finally {
    removeLoadingIndicator();
  }
}

function applyGlossaryHighlights(glossary: GlossaryEntry[]) {
  document.querySelectorAll('.failc-term').forEach((element) => element.remove());
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const current = walker.currentNode as Text;
    if (current.nodeValue && current.nodeValue.trim()) nodes.push(current);
  }

  nodes.forEach((node) => {
    const text = node.nodeValue || '';
    let updated = text;
    glossary.forEach((entry) => {
      const escapedTerm = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
      updated = updated.replace(regex, (match) => {
        const span = document.createElement('span');
        span.className = 'failc-term';
        span.setAttribute('tabindex', '0');
        span.setAttribute('data-definition', entry.definition);
        span.textContent = match;
        return span.outerHTML;
      });
    });

    if (updated !== text) {
      const fragment = document.createRange().createContextualFragment(updated);
      node.parentNode?.replaceChild(fragment, node);
    }
  });
}

function attachGlossaryInteractions() {
  document.querySelectorAll('.failc-term').forEach((element) => {
    element.addEventListener('mouseenter', (event) => showPopover(event.currentTarget as HTMLElement));
    element.addEventListener('focus', (event) => showPopover(event.currentTarget as HTMLElement));
    element.addEventListener('mouseleave', hidePopover);
    element.addEventListener('blur', hidePopover);
    element.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') hidePopover();
    });
  });
}

function showPopover(target: HTMLElement) {
  hidePopover();
  const definition = target.getAttribute('data-definition') || '';
  if (!definition) return;
  const popover = document.createElement('div');
  popover.className = 'failc-popover';
  popover.textContent = definition;
  document.body.appendChild(popover);
  const rect = target.getBoundingClientRect();
  popover.style.top = `${window.scrollY + rect.bottom + 6}px`;
  popover.style.left = `${window.scrollX + rect.left}px`;
  if (getCurrentProfile() === 'anti-epilepsy') {
    popover.style.transition = 'none';
  } else if (getCurrentProfile() === 'low-vision') {
    popover.style.background = '#000';
    popover.style.color = '#fff';
    popover.style.fontSize = '15px';
  }
  currentPopover = popover;
}

function hidePopover() {
  currentPopover?.remove();
  currentPopover = null;
}

async function analyzeSelection(selectionText: string) {
  const blocks = [{ id: `selection-${Date.now()}`, text: selectionText, html: selectionText, tagName: 'div' }];
  const loading = createLoadingIndicator();
  try {
    const data = await fetchAnalysis(blocks);
    const popover = document.createElement('div');
    popover.id = 'failc-selection-popover';
    popover.style.cssText = `position:fixed;z-index:2147483647;max-width:280px;background:#fff;border:1px solid #0b5fff;border-radius:8px;padding:10px 12px;box-shadow:0 4px 14px rgba(0,0,0,0.2);`;
    popover.innerHTML = `<strong>Résumé FAILC</strong><div style="margin-top:6px;">${data.simplifiedBlocks[0]?.falc || 'Sélection simplifiée.'}</div>`;
    document.body.appendChild(popover);
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    if (rect) {
      popover.style.top = `${window.scrollY + rect.bottom + 8}px`;
      popover.style.left = `${window.scrollX + rect.left}px`;
    } else {
      popover.style.top = '24px';
      popover.style.right = '24px';
    }
    setTimeout(() => popover.remove(), 6000);
  } finally {
    removeLoadingIndicator();
  }
}

function highlightImportantElements() {
  document.querySelectorAll('button, input, select, textarea, a').forEach((element, index) => {
    if (element instanceof HTMLElement) {
      element.style.outline = '2px solid #f59e0b';
      element.style.outlineOffset = '2px';
      element.setAttribute('data-failc-highlight', String(index));
    }
  });
}

function answerContextualQuestion(question: string) {
  const text = document.body.innerText.slice(0, 1800);
  const answer = question.toLowerCase().includes('faire') || question.toLowerCase().includes('étape')
    ? 'Commencez par vérifier le formulaire, préparez les pièces demandées et suivez l’ordre des étapes indiqué sur la page.'
    : `Voici ce qui semble essentiel sur cette page : ${text.slice(0, 220)}...`;
  return answer;
}

function init() {
  chrome.storage.local.get(['failcProfile'], (result) => {
    activeProfile = (result.failcProfile as Profile) || 'standard';
    applyProfileStyles(activeProfile);
  });

  if (isAdministrativePage()) {
    ensureFloatingAssistant();
    void analyzePage(false);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SET_PROFILE') {
      activeProfile = message.profile;
      applyProfileStyles(activeProfile);
    }
    if (message.type === 'ANALYZE_PAGE') {
      void analyzePage(true);
    }
    if (message.type === 'CONTEXT_SELECTION') {
      void analyzeSelection(message.selectionText);
    }
    if (message.type === 'ASK_CONTEXT') {
      const reply = answerContextualQuestion(message.question);
      chrome.runtime.sendMessage({ type: 'CHAT_REPLY', reply });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    attachGlossaryInteractions();
    highlightImportantElements();
  });
}

init();
