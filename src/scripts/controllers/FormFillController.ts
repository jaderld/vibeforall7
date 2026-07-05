import { DetectedForm, DetectedFormField } from '../services/FormDetectionService';

type CallAIFn = (systemPrompt: string, userPrompt: string, expectJson?: boolean) => Promise<any>;

interface FieldAnswerState {
  fieldId: string;
  value: string;
  confirmed: boolean;
}

interface VoiceFormSession {
  tabId: number;
  form: DetectedForm;
  currentIndex: number;
  answers: Map<string, FieldAnswerState>;
  awaitingConfirmation: boolean;
  pendingValue?: string;
}

export class FormFillController {
  private sessions = new Map<number, VoiceFormSession>();
  private callAI: CallAIFn;

  constructor(callAI: CallAIFn) {
    this.callAI = callAI;
  }

  handleMessage(message: any, sender: chrome.runtime.MessageSender, _sendResponse: (response?: any) => void): boolean {
    const tabId = sender.tab?.id ?? message.tabId;

    switch (message?.type) {
      case 'START_VOICE_FORM_FILL':
        if (typeof tabId === 'number' && message.form) {
          this.startSession(tabId, message.form);
        }
        return true;

      case 'VOICE_FORM_ANSWER':
        if (typeof tabId === 'number') {
          void this.handleAnswer(tabId, message.answerText);
        }
        return true;

      case 'VOICE_FORM_CONFIRM':
        if (typeof tabId === 'number') {
          void this.handleConfirmation(tabId, Boolean(message.confirmed));
        }
        return true;

      case 'VOICE_FORM_SUBMIT_CONFIRMED':
        if (typeof tabId === 'number') {
          this.submitForm(tabId);
        }
        return true;

      case 'VOICE_FORM_CANCEL':
        if (typeof tabId === 'number') {
          this.sessions.delete(tabId);
        }
        return true;

      default:
        return false;
    }
  }

  private startSession(tabId: number, form: DetectedForm) {
    this.sessions.set(tabId, {
      tabId,
      form,
      currentIndex: 0,
      answers: new Map(),
      awaitingConfirmation: false,
    });
    this.askNextQuestion(tabId);
  }

  private currentField(session: VoiceFormSession): DetectedFormField | undefined {
    return session.form.fields[session.currentIndex];
  }

  private askNextQuestion(tabId: number) {
    const session = this.sessions.get(tabId);
    if (!session) return;

    const field = this.currentField(session);
    if (!field) {
      this.finishSession(tabId);
      return;
    }

    chrome.runtime.sendMessage({
      type: 'VOICE_FORM_QUESTION',
      tabId,
      fieldId: field.fieldId,
      question: this.buildQuestionText(field),
      index: session.currentIndex,
      total: session.form.fields.length,
    }).catch(() => {});
  }

  private buildQuestionText(field: DetectedFormField): string {
    if (field.type === 'checkbox') {
        return `${field.label}. Répondez oui ou non.`;
    }

    if ((field.type === 'radio' || field.type === 'select') && field.options?.length) {
        const numbered = field.options.map((opt, idx) => `${idx + 1}. ${opt}`).join(', ');
        return `${field.label} Dites le numéro correspondant à votre choix : ${numbered}.`;
    }

    return `Quelle est votre réponse pour : ${field.label} ?`;
  }

  private async handleAnswer(tabId: number, answerText: string) {
    const session = this.sessions.get(tabId);
    const field = session && this.currentField(session);
    if (!session || !field) return;

    try {
        const systemPrompt = "Tu valides et normalises la réponse orale d'un utilisateur pour un champ de formulaire administratif français. "
        + "Réponds UNIQUEMENT en JSON, sans texte autour, au format : "
        + '{"valid": boolean, "value": string, "error": string, "confirmationText": string}. '
        + "Si des options numérotées sont fournies, l'utilisateur répond normalement par un numéro (ex: 'trois' ou '3') : dans ce cas 'value' doit être le TEXTE EXACT de l'option correspondante (pas le numéro). "
        + "Sinon, 'value' est la réponse normalisée prête à être insérée dans le champ (ex: date au format JJ/MM/AAAA, email en minuscules). "
        + "'error' explique simplement et gentiment ce qui ne va pas si valid=false (sinon chaîne vide). "
        + "'confirmationText' est une phrase courte à voix haute du type : 'Vous avez dit [valeur], c'est bien cela ?'.";

        const optionsText = field.options?.length
        ? ` Options numérotées : ${field.options.map((opt, idx) => `${idx + 1}=${opt}`).join(', ')}.`
        : '';

        const userPrompt = `Champ à remplir : "${field.label}" (type: ${field.type}${field.required ? ', obligatoire' : ''}).${optionsText}\nRéponse orale de l'utilisateur : "${answerText}"`;
        
        const result = await this.callAI(systemPrompt, userPrompt, true);

      if (!result?.valid) {
        chrome.runtime.sendMessage({
          type: 'VOICE_FORM_FIELD_ERROR',
          tabId,
          fieldId: field.fieldId,
          message: result?.error || "Je n'ai pas compris votre réponse, pouvez-vous répéter ?",
        }).catch(() => {});
        return;
      }

      session.pendingValue = String(result.value ?? answerText);
      session.awaitingConfirmation = true;

      chrome.tabs.sendMessage(tabId, {
        type: 'FILL_FIELD',
        selector: field.selector,
        value: session.pendingValue,
        fieldType: field.type,
      }).catch(() => {});

      chrome.runtime.sendMessage({
        type: 'VOICE_FORM_CONFIRM_REQUEST',
        tabId,
        fieldId: field.fieldId,
        confirmationText: result.confirmationText || `Vous avez dit ${session.pendingValue}, c'est bien cela ?`,
      }).catch(() => {});
    } catch (error: unknown) {
      chrome.runtime.sendMessage({
        type: 'VOICE_FORM_FIELD_ERROR',
        tabId,
        fieldId: field.fieldId,
        message: 'Une erreur est survenue pendant la vérification de votre réponse, réessayons.',
      }).catch(() => {});
    }
  }

  private async handleConfirmation(tabId: number, confirmed: boolean) {
    const session = this.sessions.get(tabId);
    const field = session && this.currentField(session);
    if (!session || !field) return;

    if (!confirmed) {
      session.awaitingConfirmation = false;
      session.pendingValue = undefined;
      chrome.tabs.sendMessage(tabId, { type: 'CLEAR_FIELD_HIGHLIGHT', selector: field.selector }).catch(() => {});
      this.askNextQuestion(tabId);
      return;
    }

    session.answers.set(field.fieldId, { fieldId: field.fieldId, value: session.pendingValue || '', confirmed: true });
    session.awaitingConfirmation = false;
    session.pendingValue = undefined;
    session.currentIndex += 1;

    chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_FIELD_SUCCESS', selector: field.selector }).catch(() => {});
    this.askNextQuestion(tabId);
  }

  private finishSession(tabId: number) {
    const session = this.sessions.get(tabId);
    if (!session) return;

    chrome.runtime.sendMessage({
      type: 'VOICE_FORM_COMPLETE',
      tabId,
      submitSelector: session.form.submitSelector,
      formSelector: session.form.formSelector,
    }).catch(() => {});
  }

  private submitForm(tabId: number) {
    const session = this.sessions.get(tabId);
    if (!session) return;

    chrome.tabs.sendMessage(tabId, {
      type: 'SUBMIT_FORM',
      formSelector: session.form.formSelector,
      submitSelector: session.form.submitSelector,
    }).catch(() => {});

    this.sessions.delete(tabId);
  }
}