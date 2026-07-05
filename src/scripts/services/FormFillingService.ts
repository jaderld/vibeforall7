// Applique les valeurs dictées à la voix dans le DOM réel, et gère le feedback
// visuel (succès/erreur) ainsi que la soumission finale.

export function fillField(selector: string, value: string, type: string): boolean {
  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (!el) return false;

  // 1. On modifie la valeur de l'élément
  el.value = value;

  // 2. L'astuce magique pour les sites modernes (React / Angular) :
  // Les frameworks modernes ne "voient" pas le changement si on modifie juste el.value en JS.
  // Il faut simuler une vraie frappe clavier en déclenchant ces événements manuellement.
  
  // Pour les champs texte/textarea
  el.dispatchEvent(new Event('input', { bubbles: true }));
  
  // Pour tous les champs (y compris les listes déroulantes)
  el.dispatchEvent(new Event('change', { bubbles: true }));

  // Optionnel : un petit effet visuel pour montrer à l'utilisateur que le champ a été rempli
  el.style.transition = 'background-color 0.3s';
  el.style.backgroundColor = '#E7F3EC'; // Un fond vert très clair
  setTimeout(() => {
    el.style.backgroundColor = '';
  }, 1000);

  return true;
}

export function highlightField(selector: string, status: 'success' | 'error') {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return;
  el.style.outline = status === 'success' ? '3px solid #2e7d4f' : '3px solid #b3411f';
  el.style.outlineOffset = '2px';
  el.style.boxShadow = status === 'success'
    ? '0 0 0 5px rgba(46, 125, 79, 0.18)'
    : '0 0 0 5px rgba(179, 65, 31, 0.18)';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function clearFieldHighlight(selector: string) {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return;
  el.style.outline = '';
  el.style.boxShadow = '';
}

export function submitOrAdvance(formSelector: string, submitSelector?: string): boolean {
  const target = submitSelector ? document.querySelector(submitSelector) : null;
  if (target instanceof HTMLElement) {
    target.click();
    return true;
  }

  const form = document.querySelector(formSelector);
  if (form instanceof HTMLFormElement) {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.submit();
    }
    return true;
  }

  return false;
}