import { extractPageContent } from './webExtraction';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type ContactInfo = {
  contactLink?: string;
  contactLabel?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  horaires?: string;
};
type StorageData = {
  contactInfo?: ContactInfo;
  [key: string]: any;
};

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

// Zones techniques à ignorer (jamais de contenu visible pertinent à modifier).
// Volontairement PAS de header/nav/footer ici : ces zones contiennent parfois des
// boutons utiles (connexion, recharge de compte, etc.). Le tri se fait uniquement
// par mot-clé reconnu (voir simplifyUIButton), pas par emplacement dans la page.
const IGNORED_ZONES_SELECTOR = 'script, style, noscript, svg, iframe, textarea, input';

let activeProfile: Profile = 'standard';
let currentPopover: HTMLDivElement | null = null;
let observer: MutationObserver | null = null;

const TEXTUAL_ELEMENTS_SELECTOR = [
  'p', 'li', 'dt', 'dd', 'blockquote', 'figcaption', 'caption', 'td', 'th', 'label',
  'legend', 'small', 'strong', 'em', 'b', 'u', 'mark', 'time', 'summary', 'details',
  'a', 'button', 'input', 'textarea', 'select', 'option', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'pre', 'code', 'kbd', 'samp', 'article', 'section', 'main', 'aside', 'nav', 'header', 'footer', 'address'
].join(', ');

const APP_UI_TEXT_SELECTOR = [
  'div[class]',
  'span[class]',
  'section[class]',
  'article[class]',
  'nav[class]',
  'form[class]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="heading"]',
  '[role="textbox"]',
  '[role="option"]',
  '[role="listitem"]',
  '[class*="card"]',
  '[class*="panel"]',
  '[class*="tile"]',
  '[class*="field"]',
  '[class*="form"]',
  '[class*="input"]',
  '[class*="select"]',
  '[class*="btn"]',
  '[class*="button"]',
  '[class*="menu"]',
  '[class*="dropdown"]',
  '[class*="accordion"]',
  '[class*="tabs"]',
  '[class*="dsfr"]',
  '.fr-btn',
  '.fr-card',
  '.fr-input',
  '.fr-select',
  '.fr-label',
  '.fr-fieldset'
].join(', ');

const DYSLEXIA_BLOCK_SELECTOR = [
  'p', 'li', 'dt', 'dd', 'blockquote', 'figcaption', 'caption', 'td', 'th', 'label', 'legend'
].join(', ');

const LOW_VISION_TEXT_SELECTOR = [
  'p', 'li', 'dt', 'dd', 'blockquote', 'figcaption', 'caption', 'td', 'th', 'label',
  'legend', 'small', 'strong', 'em', 'b', 'u', 'mark', 'time', 'summary', 'details',
  'a', 'button', 'input', 'textarea', 'select', 'option', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
].join(', ');

const ICON_FONT_SELECTOR = [
  '.material-icons',
  '.material-icons-outlined',
  '.material-icons-round',
  '.material-icons-sharp',
  '.material-symbols-outlined',
  '.material-symbols-rounded',
  '.material-symbols-sharp',
  '.fa',
  '[class^="fa-"]',
  '[class*=" fa-"]',
  '.bi',
  '[class^="bi-"]',
  '[class*=" bi-"]',
  '.icon',
  '[class*=" icon-"]'
].join(', ');

const INTERACTIVE_SELECTOR = [
  'a', 'button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]',
  'input[type="reset"]', 'summary', 'select', 'textarea'
].join(', ');

type RgbColor = { r: number; g: number; b: number };

function parseRgbColor(value: string): RgbColor | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

function isFullyTransparent(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent') return true;

  const match = normalized.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/);
  if (!match) return false;

  return Number(match[1]) === 0;
}

function channelToLinear(channel: number) {
  const normalized = channel / 255;
  if (normalized <= 0.03928) return normalized / 12.92;
  return Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(color: RgbColor) {
  const r = channelToLinear(color.r);
  const g = channelToLinear(color.g);
  const b = channelToLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: RgbColor, background: RgbColor) {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function detectSiteTheme(): 'dark' | 'light' {
  const bodyColor = parseRgbColor(window.getComputedStyle(document.body).backgroundColor);
  const htmlColor = parseRgbColor(window.getComputedStyle(document.documentElement).backgroundColor);
  const background = bodyColor || htmlColor || { r: 255, g: 255, b: 255 };
  return relativeLuminance(background) < 0.35 ? 'dark' : 'light';
}

function detectPageType(): 'textual' | 'application' {
  const textBlocks = document.querySelectorAll('p, article p, main p, section p, li, blockquote, h1, h2, h3, h4, h5, h6').length;
  const controls = document.querySelectorAll('form, input, textarea, select, button, [role="button"], [role="tab"], [role="menuitem"], [role="dialog"], [contenteditable="true"], [class*="btn"], [class*="card"], [class*="form"], [class*="input"], [class*="menu"], [class*="tabs"], .fr-btn, .fr-card, .fr-input, .fr-select').length;
  const appContainers = document.querySelectorAll('div[class], section[class], article[class], nav[class], [class*="dsfr"], [data-testid], [data-component]').length;

  if (controls > Math.max(10, textBlocks * 1.2) || (controls >= 8 && appContainers >= 30)) {
    return 'application';
  }

  return 'textual';
}

function resolveBackgroundColor(element: HTMLElement): RgbColor {
  let current: HTMLElement | null = element;
  while (current) {
    const bgValue = window.getComputedStyle(current).backgroundColor;
    const color = parseRgbColor(bgValue);
    if (color) {
      if (!isFullyTransparent(bgValue)) {
        return color;
      }
    }
    current = current.parentElement;
  }

  const bodyColor = parseRgbColor(window.getComputedStyle(document.body).backgroundColor);
  const htmlColor = parseRgbColor(window.getComputedStyle(document.documentElement).backgroundColor);
  return bodyColor || htmlColor || { r: 255, g: 255, b: 255 };
}

function ensureReadableContrast(element: HTMLElement, minRatio: number) {
  const computed = window.getComputedStyle(element);
  const foreground = parseRgbColor(computed.color);
  if (!foreground) return;

  const background = resolveBackgroundColor(element);
  if (contrastRatio(foreground, background) >= minRatio) return;

  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const blackRatio = contrastRatio(black, background);
  const whiteRatio = contrastRatio(white, background);
  const bestColor = blackRatio >= whiteRatio ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';

  if (!element.dataset.failcOriginalColor) {
    element.dataset.failcOriginalColor = element.style.color || '';
  }

  element.style.setProperty('color', bestColor, 'important');
  element.dataset.failcContrastAdjusted = '1';
}

function enhanceLowVisionContrast(root: ParentNode = document) {
  const textElements = root.querySelectorAll(LOW_VISION_TEXT_SELECTOR);
  textElements.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.closest('svg, img, video, canvas, [aria-hidden="true"]')) return;
    const minRatio = node.tagName.toLowerCase() === 'a' ? 3 : 4.5;
    ensureReadableContrast(node, minRatio);
  });
}

function resetLowVisionContrastAdjustments() {
  const adjusted = document.querySelectorAll('[data-failc-contrast-adjusted="1"]');
  adjusted.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const previous = node.dataset.failcOriginalColor || '';
    if (previous) {
      node.style.color = previous;
    } else {
      node.style.removeProperty('color');
    }
    delete node.dataset.failcOriginalColor;
    delete node.dataset.failcContrastAdjusted;
  });
}

function pauseAutoplayMedia() {
  const mediaNodes = document.querySelectorAll('video, audio');
  mediaNodes.forEach((node) => {
    if (!(node instanceof HTMLMediaElement)) return;
    if (!node.dataset.failcMediaProcessed) {
      node.dataset.failcMediaProcessed = '1';
      node.dataset.failcHadAutoplay = node.hasAttribute('autoplay') ? '1' : '0';
    }
    node.removeAttribute('autoplay');
    try {
      node.pause();
      if (!Number.isNaN(node.currentTime)) {
        node.currentTime = 0;
      }
    } catch {
      // Ignore media controls blocked by site policies.
    }
  });

  const marquees = document.querySelectorAll('marquee');
  marquees.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.failcMarqueeProcessed === '1') return;
    node.dataset.failcMarqueeProcessed = '1';
    if (typeof (node as any).stop === 'function') {
      (node as any).stop();
    }
  });
}

function restoreAutoplayMedia() {
  const mediaNodes = document.querySelectorAll('video[data-failc-media-processed="1"], audio[data-failc-media-processed="1"]');
  mediaNodes.forEach((node) => {
    if (!(node instanceof HTMLMediaElement)) return;
    if (node.dataset.failcHadAutoplay === '1') {
      node.setAttribute('autoplay', 'autoplay');
    }
    delete node.dataset.failcMediaProcessed;
    delete node.dataset.failcHadAutoplay;
  });

  const marquees = document.querySelectorAll('marquee[data-failc-marquee-processed="1"]');
  marquees.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (typeof (node as any).start === 'function') {
      (node as any).start();
    }
    delete node.dataset.failcMarqueeProcessed;
  });
}

function applyAntiEpilepsyRuntime() {
  pauseAutoplayMedia();
}

function resetAntiEpilepsyRuntime() {
  restoreAutoplayMedia();
}

// ==========================================
// 1. GESTION DES PROFILS (CSS)
// ==========================================
const SUPPORTED_SITES = [
  'impots.gouv.fr',
  'caf.fr',
  'ameli.fr',
  'ants.gouv.fr',
  'urssaf.fr'
];

function isSupportedSite() {
  return SUPPORTED_SITES.some(site => location.hostname.includes(site));
}

function applyProfileStyles(profile: Profile, previousProfile: Profile = activeProfile) {
  const existing = document.getElementById('failc-profile-style');
  if (existing) existing.remove();

  if (previousProfile === 'anti-epilepsy' && profile !== 'anti-epilepsy') {
    resetAntiEpilepsyRuntime();
  }

  if (previousProfile === 'low-vision' && profile !== 'low-vision') {
    resetLowVisionContrastAdjustments();
  }

  const theme = detectSiteTheme();
  const pageType = detectPageType();
  document.documentElement.setAttribute('data-failc-theme', theme);
  document.documentElement.setAttribute('data-failc-page-type', pageType);

  const baseStyle = document.getElementById('failc-base-style') || document.createElement('style');
  baseStyle.id = 'failc-base-style';
  baseStyle.textContent = `
    .failc-term { border-bottom: 2px dotted #0b5fff; cursor: help; text-decoration: none; color: #0b5fff; font-weight: bold; }
    .failc-popover { position: fixed; z-index: 2147483647; background: #0f172a; color: #fff; padding: 10px 12px; border-radius: 8px; max-width: 260px; font-size: 14px; line-height: 1.4; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
  `;
  if (!document.getElementById('failc-base-style')) document.head.appendChild(baseStyle);

  if (profile === 'standard') return;

  const style = document.createElement('style');
  style.id = 'failc-profile-style';
  style.textContent = profile === 'dyslexia'
    ? `
      ${TEXTUAL_ELEMENTS_SELECTOR} {
        font-family: Verdana, Arial, sans-serif !important;
        line-height: 1.6 !important;
        letter-spacing: 0.05em !important;
        word-spacing: 0.16em !important;
        text-align: left !important;
      }

      html[data-failc-page-type="application"] ${APP_UI_TEXT_SELECTOR} {
        font-family: Verdana, Arial, sans-serif !important;
        line-height: 1.6 !important;
        letter-spacing: 0.05em !important;
        word-spacing: 0.16em !important;
      }

      html[data-failc-page-type="textual"] ${DYSLEXIA_BLOCK_SELECTOR} {
        max-width: 70ch !important;
      }

      p {
        margin-bottom: 1.5em !important;
      }

      ${ICON_FONT_SELECTOR} {
        font-family: revert !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
      }
    `
    : profile === 'low-vision'
      ? `
        ${LOW_VISION_TEXT_SELECTOR} {
          font-size: max(1.25rem, 1em) !important;
          font-weight: 550 !important;
          line-height: 1.6 !important;
        }

        html[data-failc-page-type="application"] ${APP_UI_TEXT_SELECTOR} {
          font-size: max(1.12rem, 1em) !important;
          font-weight: 550 !important;
          line-height: 1.55 !important;
        }

        ${INTERACTIVE_SELECTOR} {
          min-width: 2.75rem !important;
          min-height: 2.75rem !important;
          padding: 0.35rem 0.65rem !important;
        }

        :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
          outline: 3px solid #f59e0b !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.32) !important;
        }
      `
      : `
        :where(html, body, body *) {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
          caret-color: auto !important;
        }

        :where(*:hover, *:focus, *:active) {
          transition: none !important;
          animation: none !important;
        }
      `;
  document.head.appendChild(style);

  if (profile === 'low-vision') {
    enhanceLowVisionContrast();
  }

  if (profile === 'anti-epilepsy') {
    applyAntiEpilepsyRuntime();
  }
}

// ==========================================
// 2. LECTURE & ANALYSE SILENCIEUSE (IA & REGEX)
// ==========================================
function collectBlocks() {
  const elements = Array.from(document.querySelectorAll('p, li, td, h1, h2, h3, h4, h5, h6, label'));
  const blocks: Array<{ text: string }> = [];
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element.closest('script, style, noscript, svg, form, button, input, textarea, select, iframe')) return;
    const text = element.innerText?.trim() || element.textContent?.trim() || '';
    if (text.length > 5) {
      blocks.push({ text });
    }
  });
  return blocks.slice(0, 60);
}

// Mots-clés désignant un accès au contact/support/prise de rendez-vous
const CONTACT_KEYWORDS = [
  'contact', 'contactez', 'nous contacter', 'nous joindre',
  'aide', 'faq', 'support', 'assistance',
  'rendez-vous', 'rendezvous', 'rdv', 'prendre rendez-vous'
];

// Cherche le lien/bouton de contact sur la page et renvoie son libellé + son URL
// Cherche le premier lien/bouton de contact sur la page et renvoie son libellé + son URL
function findContactLink(): { label: string; url: string } | null {
  const candidates = Array.from(document.querySelectorAll('a, button'));

  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;

    // On exclut les éléments manifestement cachés à l'écran
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

    const rawText =
      el.innerText?.trim() ||
      el.getAttribute('aria-label') ||
      el.textContent?.trim() ||
      '';

    const text = normalize(rawText);
    if (!text) continue;

    const matched = CONTACT_KEYWORDS.some((kw) => text.includes(kw));
    if (!matched) continue;

    // On récupère le lien brut (dans le HTML) ET l'URL absolue résolue par le navigateur
    const rawHref = el.getAttribute('href') || '';
    const url = (el as HTMLAnchorElement).href || rawHref;
    
    // FILTRE 1 : On ignore directement les ancres brutes, la racine ou le JS
    if (
      !url || 
      rawHref === '#' || 
      rawHref === '/' || 
      rawHref.startsWith('#') || 
      rawHref.startsWith('javascript:')
    ) {
      continue;
    }

    // FILTRE 2 : On ignore les "tabs" (liens pointant vers la même page avec une ancre #)
    try {
      const parsedUrl = new URL(url, window.location.href);
      const currentUrl = new URL(window.location.href);
      
      // Si l'URL a le même chemin d'accès que la page actuelle et possède un "#", on ignore
      if (parsedUrl.pathname === currentUrl.pathname && parsedUrl.hash) {
        continue;
      }
    } catch (e) {
      // Si l'URL est mal formée, on l'ignore
      continue;
    }

    // Si on arrive ici, c'est un vrai lien vers une AUTRE page (la vraie page de contact)
    return { label: rawText, url };
  }

  return null;
}

// Extrait les coordonnées directement depuis le texte brut
function extractContactInfo(text: string): Partial<ContactInfo> {
  const info: Partial<ContactInfo> = {};

  // Téléphone (ex: 01 23 45 67 89 ou +33 1...)
  const phoneMatch = text.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
  if (phoneMatch) info.telephone = phoneMatch[0];

  // Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) info.email = emailMatch[0];

  // Horaires basiques (ex: "Du lundi au vendredi de 9h à 17h")
  const horairesMatch = text.match(/(?:du|de)\s+(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche).*?(?:à|a)\s+\d{1,2}h(?:\d{2})?/i);
  if (horairesMatch) info.horaires = horairesMatch[0];

  // Adresse (Recherche simplifiée : Numéro de rue + Code postal 5 chiffres + Ville)
  const addressMatch = text.match(/\d{1,4}\s+[a-zA-Z0-9\s,.-]+?\s+\d{5}\s+[a-zA-Z\s-]+/);
  if (addressMatch) info.adresse = addressMatch[0].trim();

  return info;
}

async function analyzePageSilent() {
  chrome.runtime.sendMessage({ type: 'ANALYSIS_STARTED' }).catch(() => {});
  const blocks = collectBlocks();
  const visibleText = blocks.map(b => b.text).join(' ');
  const contactLink = findContactLink();
  const extractedContact = extractContactInfo(visibleText);

  try {
    const response = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ type: 'FETCH_ANALYSIS', payload: { blocks } }, resolve);
    });

    const cleanUrl = location.href.split('#')[0];
    const storageKey = `${STORAGE_PREFIX}${cleanUrl}`;

    // On vérifie si l'IA a échoué, mais ON NE FAIT PLUS CRASHER LE SCRIPT (pas de "throw")
    const hasAiError = chrome.runtime.lastError || !response || response.error;
    const aiErrorMessage = chrome.runtime.lastError?.message || response?.error || '';

    // On prépare le paquet de données (IA + Local)
    const analysisData = {
      // Si l'IA a planté, on met un message par défaut, sinon on met le vrai résumé
      summary: hasAiError
        ? `Le résumé par IA est indisponible (${aiErrorMessage || 'Erreur de connexion ou quota'}).`
        : response.summary,
      steps: hasAiError ? ["Suivez les instructions affichées sur la page."] : (response.steps || []),

      // La partie locale (contacts et glossaire) fonctionnera TOUJOURS
      glossaire: TERM_DEFINITIONS.filter(e => visibleText.toLowerCase().includes(e.term.toLowerCase())),
      contactInfo: {
        contactLink: contactLink?.url || '',
        contactLabel: contactLink?.label || '',
        telephone: extractedContact.telephone || '',
        email: extractedContact.email || '',
        adresse: extractedContact.adresse || '',
        horaires: extractedContact.horaires || ''
      },
    };

    // On sauvegarde tout
    await chrome.storage.local.set({ [storageKey]: analysisData });

    // On envoie à la barre latérale
    chrome.runtime.sendMessage({ type: 'ANALYSIS_COMPLETE', data: analysisData }).catch(() => {});
  } catch (error) {
    chrome.runtime.sendMessage({ type: 'ANALYSIS_ERROR' }).catch(() => {});
  }
}

// ==========================================
// 3. MODIFICATION VISUELLE DE LA PAGE
// ==========================================
function showPopover(target: HTMLElement) {
  hidePopover();

  const definition =
    target.getAttribute('data-definition') ||
    target.title ||
    '';

  if (!definition) return;

  const popover = document.createElement('div');
  popover.className = 'failc-popover';
  popover.textContent = definition;

  document.body.appendChild(popover);

  const rect = target.getBoundingClientRect();

  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popover.style.left = `${rect.left + window.scrollX}px`;

  currentPopover = popover;
}

function hidePopover() {
  currentPopover?.remove();
  currentPopover = null;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Détection simple par mot-clé, peu importe ce qu'il y a autour du mot-clé dans le texte du bouton
function simplifyUIButton(text: string): string | null {
  const t = normalize(text);

  // 🔐 CONNEXION (PRIORITÉ HAUTE)
  if (
    t.includes("connexion") ||
    t.includes("se connecter") ||
    t.includes("mon compte") ||
    t.includes("espace") ||
    t.includes("account")
  ) {
    return "CONNEXION";
  }

  // 🔍 RECHERCHE
  if (
    t.includes("chercher") ||
    t.includes("rechercher") ||
    t.includes("search")
  ) {
    return "RECHERCHE";
  }

  // ▶ COMMENCER
  if (
    t.includes("commencer") ||
    t.includes("demarrer") ||
    t.includes("lancer")
  ) {
    return "COMMENCER";
  }

  // ➡ SUIVANT
  if (
    t.includes("suivant") ||
    t.includes("continuer") ||
    t.includes("etape")
  ) {
    return "SUIVANT";
  }

  // ✔ CONFIRMER
  if (
    t.includes("valider") ||
    t.includes("confirmer") ||
    t.includes("envoyer")
  ) {
    return "CONFIRMER";
  }

  // ❌ RETOUR
  if (
    t.includes("retour") ||
    t.includes("annuler")
  ) {
    return "RETOUR";
  }

  return null;
}

// Détection tardive : certains sites chargent leur bouton de contact après coup
// (SPA, contenu lazy-loadé). Si on en trouve un après la première analyse, on met
// à jour le stockage ET on notifie le sidebar en direct.
function refreshContactLinkIfNeeded() {
  if ((window as any).__failcContactInjected) return;

  const found = findContactLink();
  if (!found) return;

  const cleanUrl = location.href.split('#')[0];
  const storageKey = `${STORAGE_PREFIX}${cleanUrl}`;

  chrome.storage.local.get([storageKey], (result) => {
    // AJOUT DU CAST "as StorageData" ICI
    const existing = result[storageKey] as StorageData; 
    
    if (!existing) return;

    // S'il n'y avait pas de lien de contact enregistré, on met à jour
    if (!existing.contactInfo || !existing.contactInfo.contactLink) {
      existing.contactInfo = existing.contactInfo || {};
      existing.contactInfo.contactLink = found.url;
      existing.contactInfo.contactLabel = found.label;

      chrome.storage.local.set({ [storageKey]: existing }, () => {
        (window as any).__failcContactInjected = true;
        // On renvoie l'analyse complète au popup pour qu'il mette à jour l'affichage
        chrome.runtime.sendMessage({ type: 'ANALYSIS_COMPLETE', data: existing }).catch(() => {});
      });
    } else {
      // Déjà traité
      (window as any).__failcContactInjected = true;
    }
  });
}

function startDomObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    // debounce simple
    clearTimeout((window as any).__failcTimeout);

    (window as any).__failcTimeout = setTimeout(() => {
      applyVisualModifications();
      refreshContactLinkIfNeeded();

      if (activeProfile === 'low-vision') {
        enhanceLowVisionContrast();
      }

      if (activeProfile === 'anti-epilepsy') {
        applyAntiEpilepsyRuntime();
      }
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Détecte les champs de recherche via leur placeholder / aria-label / type,
// invisibles pour le TreeWalker de texte (ce sont des attributs, pas du texte du DOM)
function simplifySearchFields() {
  const fields = document.querySelectorAll('input, textarea');

  fields.forEach((el) => {
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;

    const placeholder = el.getAttribute('placeholder') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const type = (el as HTMLInputElement).type || '';

    const combined = normalize(`${placeholder} ${ariaLabel} ${type}`);

    const isSearchField =
      combined.includes('cherch') ||
      combined.includes('search') ||
      type === 'search';

    if (!isSearchField) return;

    if (placeholder && placeholder !== 'RECHERCHE') {
      el.setAttribute('placeholder', 'RECHERCHE');
    }
    if (ariaLabel && ariaLabel !== 'RECHERCHE') {
      el.setAttribute('aria-label', 'RECHERCHE');
    }
    highlightElement(el);
  });
}

// Mots-clés désignant une démarche importante à mettre en avant.
// Contrairement à simplifyUIButton, on NE renomme PAS le texte ici (on perdrait
// l'info précise "quelle démarche"), on se contente d'encadrer l'élément.
const DEMARCHE_KEYWORDS = [
  'demarche', 'attestation', 'carte vitale', 'feuille de soins',
  'payer en ligne', 'complementaire sante', 'remboursement',
  'toutes les demarches', 'demander', 'obtenir un', 'obtenir une'
];

function isNoteworthyDemarcheLink(text: string): boolean {
  const t = normalize(text);
  if (t.length < 3) return false;
  return DEMARCHE_KEYWORDS.some((kw) => t.includes(kw));
}

// Remplace le texte visible d'un bouton/lien SANS casser une icône imbriquée
// (ex: <a><svg/><span>Se connecter</span></a>). On cherche le premier nœud de
// texte non vide, à quelque profondeur que ce soit, et on le remplace.
function setVisibleLabel(el: HTMLElement, label: string) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let firstTextNode: Text | null = null;
  const extraTextNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.nodeValue?.trim()) continue;
    if (!firstTextNode) {
      firstTextNode = node;
    } else {
      extraTextNodes.push(node);
    }
  }

  if (firstTextNode) {
    firstTextNode.nodeValue = label;
    extraTextNodes.forEach((node) => { node.nodeValue = ''; });
  } else {
    // Pas de nœud de texte trouvé (ex: icône seule) -> fallback sur le texte complet
    el.textContent = label;
  }

  el.setAttribute('aria-label', label);
  el.title = label;
}

// Contour bien visible, réutilisé pour boutons ET liens de démarches
function highlightElement(el: HTMLElement) {
  el.style.outline = '3px solid #f97316';
  el.style.outlineOffset = '2px';
  el.style.boxShadow = '0 0 0 5px rgba(249, 115, 22, 0.18)';
}

function applyVisualModifications() {
  // Champs de recherche (placeholder / aria-label) — traités séparément du texte visible
  simplifySearchFields();

  // Uniquement des remplacements sûrs, ciblés sur la navigation d'une démarche
  // (on a retiré les remplacements trop larges type "documents" / "dossier" / "justificatif"
  // qui changeaient le sens de mots courants partout sur la page)
  const replacements: Array<[RegExp, string]> = [
    // 🔍 RECHERCHE
    [/\bque cherchez[- ]vous\s*\??/gi, 'RECHERCHE'],
    [/\brechercher\b/gi, 'RECHERCHE'],
    [/\bsearch\b/gi, 'RECHERCHE'],

    // ▶ ACTIONS PRINCIPALES
    [/\bcommencer\b/gi, 'COMMENCER'],
    [/\bdémarrer\b/gi, 'COMMENCER'],
    [/\blancer\b/gi, 'COMMENCER'],

    // ➡ NAVIGATION / PROGRESSION
    [/\bétape suivante\b/gi, 'SUIVANT'],
    [/\bsuivant(e)?\b/gi, 'SUIVANT'],
    [/\bpoursuivre\b/gi, 'SUIVANT'],
    [/\bcontinuer\b/gi, 'SUIVANT'],

    // ✔ VALIDATION / CONFIRMATION
    [/\bvalider\b/gi, 'CONFIRMER'],
    [/\bconfirmer\b/gi, 'CONFIRMER'],
    [/\benregistrer\b/gi, 'SAUVEGARDER'],
    [/\bsoumettre\b/gi, 'ENVOYER'],

    // ❌ RETOUR / ANNULATION
    [/\bannuler\b/gi, 'RETOUR'],
    [/\brevenir\b/gi, 'RETOUR'],
    [/\bretour\b/gi, 'RETOUR'],

    // 📄 ADMIN — termes précis uniquement, pas de mots génériques
    [/\bavis d['’]imposition\b/gi, 'document de l’administration'],
    [/\bcomplémentaire santé\b/gi, 'mutuelle (complémentaire santé)'],

    // 🧾 IMPÔTS / CAF / ADMIN
    [/\brevenu fiscal de référence\b/gi, 'revenu utilisé pour les aides'],
    [/\bnuméro fiscal\b/gi, 'identifiant impôts'],
    [/\bcaf\b/gi, 'CAF (aides familiales)'],
    [/\burssaf\b/gi, 'URSSAF (cotisations sociales)'],

    // ⚙ STATUTS
    [/\ben cours de traitement\b/gi, 'EN COURS'],
    [/\bvalidé\b/gi, 'ACCEPTÉ'],
    [/\brejeté\b/gi, 'REFUSÉ'],
    [/\bincomplet\b/gi, 'MANQUE DES DOCUMENTS'],

    // 📬 ACTIONS UTILISATEUR
    [/\bse connecter\b/gi, 'CONNEXION'],
    [/\bconnexion\b/gi, 'CONNEXION'],
    [/\bdéconnexion\b/gi, 'DÉCONNEXION']
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;

    if (
      !node.nodeValue?.trim() ||
      node.parentElement?.closest(IGNORED_ZONES_SELECTOR + ', button')
    ) continue;

    textNodes.push(node);
  }

  textNodes.forEach((node) => {
    let text = node.nodeValue || '';
    let modified = text;

    // 1. simplification texte simple (SAFE) — remplacements ciblés uniquement
    replacements.forEach(([pattern, replacement]) => {
      modified = modified.replace(pattern, replacement);
    });

    if (modified !== text) {
      node.nodeValue = modified;
    }

    // 2. glossaire → highlight léger sans casser DOM
    TERM_DEFINITIONS.forEach((entry) => {
      const regex = new RegExp(`\\b${entry.term}\\b`, 'i');
      if (regex.test(node.nodeValue || '')) {
        const parent = node.parentElement;
        if (!parent) return;

        // éviter double processing
        if (parent.dataset.failcProcessed === '1') return;
        parent.dataset.failcProcessed = '1';

        parent.style.background = 'rgba(255, 243, 176, 0.5)';
        parent.style.cursor = 'help';
        parent.title = entry.definition;

        if ((parent as any).dataset.failcListeners === '1') return;
        (parent as any).dataset.failcListeners = '1';

        parent.addEventListener('mouseenter', () => showPopover(parent));
        parent.addEventListener('mouseleave', hidePopover);
      }
    });
  });

  // 3. Boutons/liens : deux cas mis en avant, chacun où qu'il soit dans la page
  // (header, nav, footer inclus) :
  //   a) mot-clé générique d'action (connexion, recherche, suivant...) -> texte remplacé
  //   b) lien vers une démarche importante -> encadré, texte conservé tel quel
  document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.closest(IGNORED_ZONES_SELECTOR)) return;

    const text =
      el.innerText?.trim() ||
      el.getAttribute("aria-label") ||
      el.textContent?.trim() ||
      "";

    const simplified = simplifyUIButton(text);
    const isDemarche = !simplified && isNoteworthyDemarcheLink(text);

    if (!simplified && !isDemarche) return;

    const labelForTracking = simplified || 'DEMARCHE';
    if (el.getAttribute('data-failc-label') === labelForTracking) return;
    el.setAttribute('data-failc-label', labelForTracking);

    if (simplified) {
      setVisibleLabel(el, simplified);
    }

    highlightElement(el);
  });
}

// ==========================================
// 4. INITIALISATION & ÉCOUTE
// ==========================================
function init() {
  startDomObserver();

  if (!isSupportedSite()) return;

  // Apply simplification immediately so users don't need to click in the popup.
  applyVisualModifications();
  refreshContactLinkIfNeeded();

  chrome.storage.local.get(['failcProfile'], (result) => {
    activeProfile = (result.failcProfile as Profile) || 'standard';
    applyProfileStyles(activeProfile);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SET_PROFILE') {
      const previousProfile = activeProfile;
      activeProfile = message.profile;
      applyProfileStyles(activeProfile, previousProfile);
      applyVisualModifications();
    }
    if (message.type === 'EXTRACT_PAGE_CONTENT') {
      sendResponse({ pageContent: extractPageContent() });
      return false;
    }
    if (message.type === 'ANALYZE_PAGE') {
      void analyzePageSilent();
    }
    if (message.type === 'MODIFY_PAGE') {
      applyVisualModifications();
    }
  });
}

init();