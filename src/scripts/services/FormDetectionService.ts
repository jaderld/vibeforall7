// Détecte les formulaires présents sur la page et construit un schéma exploitable
// par le controller de remplissage vocal (background) et par sidebar.tsx.

export type FormFieldType =
  | 'text' | 'email' | 'tel' | 'number' | 'date' | 'password'
  | 'select' | 'radio' | 'checkbox' | 'textarea' | 'unknown';

export interface DetectedFormField {
  fieldId: string;
  selector: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  currentValue?: string;
}

export interface DetectedForm {
  formSelector: string;
  fields: DetectedFormField[];
  submitSelector?: string;
}

const FIELD_ID_ATTR = 'data-failc-field-id';
let fieldCounter = 0;

function nextFieldId(): string {
  fieldCounter += 1;
  return `failc-field-${fieldCounter}`;
}

function guessLabel(el: HTMLElement): string {
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }

  const parentLabel = el.closest('label');
  if (parentLabel?.textContent?.trim()) {
    return parentLabel.textContent.replace((el as HTMLInputElement).value || '', '').trim();
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder.trim();

  let sibling = el.previousElementSibling;
  while (sibling) {
    const text = sibling.textContent?.trim();
    if (text && text.length > 0 && text.length < 100) return text;
    sibling = sibling.previousElementSibling;
  }

  return el.getAttribute('name') || 'ce champ';
}

function detectFieldType(el: HTMLElement): FormFieldType {
  const tag = el.tagName.toLowerCase();
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    if (['email', 'tel', 'number', 'date', 'password', 'text'].includes(type)) return type as FormFieldType;
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    return 'text';
  }
  return 'unknown';
}

function findSubmitButton(form: HTMLElement): HTMLElement | null {
  const explicit = form.querySelector('[type="submit"]');
  if (explicit instanceof HTMLElement) return explicit;

  const candidates = Array.from(form.querySelectorAll('button, [role="button"], a'));
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    const text = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase();
    if (/envoyer|valider|confirmer|suivant|continuer|soumettre/.test(text)) {
      return el;
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Regroupement des <input type="radio"> : chaque bouton radio d'un même
// groupe (même attribut "name") ne doit PAS devenir une question séparée.
// On construit un seul DetectedFormField par groupe, avec toutes les
// options empilées dans field.options.
// --------------------------------------------------------------------------

function guessRadioOptionLabel(el: HTMLElement): string {
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const parentLabel = el.closest('label');
  if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();

  // Fallback : texte visible juste après/autour du radio (structure classique <input><span>Texte</span>)
  let sibling = el.nextElementSibling;
  while (sibling) {
    const text = sibling.textContent?.trim();
    if (text) return text;
    sibling = sibling.nextElementSibling;
  }
  return el.getAttribute('value') || 'option';
}

function guessRadioGroupLabel(el: HTMLElement, name: string): string {
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend?.textContent?.trim()) return legend.textContent.trim();
  }

  // Remonte quelques niveaux pour trouver un texte de question au-dessus du groupe
  let node: HTMLElement | null = el.closest('div, li, tr, section') as HTMLElement | null;
  let depth = 0;
  while (node && depth < 4) {
    const directText = Array.from(node.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join(' ');
    if (directText && directText.length > 2 && directText.length < 150) return directText;
    node = node.parentElement;
    depth += 1;
  }
  return `Choisissez une option (${name})`;
}

export function detectForms(): DetectedForm[] {
  const forms = Array.from(document.querySelectorAll('form'));
  const results: DetectedForm[] = [];

  forms.forEach((form, formIndex) => {
    if (!(form instanceof HTMLElement)) return;

    const fieldEls = Array.from(form.querySelectorAll('input, select, textarea')).filter(
      (el): el is HTMLElement => {
        if (!(el instanceof HTMLElement)) return false;
        const type = (el as HTMLInputElement).type;
        if (['hidden', 'submit', 'button', 'image'].includes(type)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
      },
    );

    if (fieldEls.length === 0) return;

    if (!form.getAttribute(FIELD_ID_ATTR)) {
      form.setAttribute(FIELD_ID_ATTR, `failc-form-${formIndex}`);
    }

    const fields: DetectedFormField[] = [];
    const radioGroups = new Map<string, DetectedFormField>();

    fieldEls.forEach((el) => {
      const type = detectFieldType(el);

      // --- Cas particulier : radios regroupés par name ---
      if (type === 'radio') {
        const name = (el as HTMLInputElement).name || 'radio-group';
        const optionLabel = guessRadioOptionLabel(el);

        if (radioGroups.has(name)) {
          radioGroups.get(name)!.options!.push(optionLabel);
          return; // pas de champ séparé : on ajoute juste l'option au groupe existant
        }

        let fieldId = el.getAttribute(FIELD_ID_ATTR);
        if (!fieldId) {
          fieldId = nextFieldId();
          el.setAttribute(FIELD_ID_ATTR, fieldId);
        }

        const groupField: DetectedFormField = {
          fieldId,
          selector: `[name="${CSS.escape(name)}"]`,
          label: guessRadioGroupLabel(el, name),
          type: 'radio',
          required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
          options: [optionLabel],
        };
        radioGroups.set(name, groupField);
        fields.push(groupField);
        return;
      }

      // --- Cas générique (text, email, select, textarea, checkbox...) ---
      let fieldId = el.getAttribute(FIELD_ID_ATTR);
      if (!fieldId) {
        fieldId = nextFieldId();
        el.setAttribute(FIELD_ID_ATTR, fieldId);
      }

      let options: string[] | undefined;
      if (type === 'select') {
        options = Array.from((el as HTMLSelectElement).options)
          .map((opt) => opt.textContent?.trim() || '')
          .filter(Boolean);
      }

      fields.push({
        fieldId,
        selector: `[${FIELD_ID_ATTR}="${fieldId}"]`,
        label: guessLabel(el),
        type,
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        options,
        currentValue: (el as HTMLInputElement).value || '',
      });
    });

    const submitEl = findSubmitButton(form);
    let submitSelector: string | undefined;
    if (submitEl) {
      if (!submitEl.getAttribute(FIELD_ID_ATTR)) {
        submitEl.setAttribute(FIELD_ID_ATTR, nextFieldId());
      }
      submitSelector = `[${FIELD_ID_ATTR}="${submitEl.getAttribute(FIELD_ID_ATTR)}"]`;
    }

    const formFieldId = form.getAttribute(FIELD_ID_ATTR)!;
    results.push({
      formSelector: `[${FIELD_ID_ATTR}="${formFieldId}"]`,
      fields,
      submitSelector,
    });
  });

  return results;
}