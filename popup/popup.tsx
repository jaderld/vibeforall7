import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

type Profile = 'standard' | 'dyslexia' | 'low-vision' | 'anti-epilepsy';
type ContactInfo = {
  telephone: string;
  email: string;
  adresse: string;
  horaires: string;
};

type AnalysisData = {
  summary: string;
  steps: string[];
  glossary: { term: string; definition: string }[];
  contactInfo: ContactInfo;
  voiceFormAvailable: boolean;
  highlightedSelectors: string[];
};

const profiles: Array<{ id: Profile; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'dyslexia', label: 'Dyslexie' },
  { id: 'low-vision', label: 'Basse vision' },
  { id: 'anti-epilepsy', label: 'Anti-épilepsie' }
];

const Popup = () => {
  const [activeProfile, setActiveProfile] = useState<Profile>('standard');
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [chatInput, setChatInput] = useState('');
  const [chatReply, setChatReply] = useState('');

  useEffect(() => {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'CHAT_REPLY') {
        setChatReply(message.reply);
      }
    });

    chrome.storage.local.get(['failcProfile'], (result) => {
      setActiveProfile((result.failcProfile as Profile) || 'standard');
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url || '';
      setActiveUrl(tabUrl);
      if (!tabUrl) return;
      const urlKey = new URL(tabUrl).href;
      chrome.storage.local.get([`failc:${urlKey}`], (result) => {
        const data = result[`failc:${urlKey}`] as AnalysisData | undefined;
        setAnalysis(data || null);
      });
      chrome.tabs.sendMessage(tabs[0].id!, { type: 'ANALYZE_PAGE', source: 'popup' });
    });
  }, []);

  const applyProfile = (profile: Profile) => {
    setActiveProfile(profile);
    chrome.storage.local.set({ failcProfile: profile });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_PROFILE', profile });
      }
    });
  };

  const analyzePage = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE', source: 'popup' });
      }
    });
  };

  const askContextualQuestion = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ASK_CONTEXT', question: chatInput });
      }
    });
  };

  return (
    <div style={{ width: 340, padding: 16, fontFamily: 'Arial, sans-serif', background: '#fff', color: '#111' }}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 20 }}>FAILC</h2>
      <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: '#4b5563' }}>{activeUrl ? activeUrl : 'Aucune page active'}</p>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => applyProfile(profile.id)}
            style={{
              minHeight: 44,
              border: activeProfile === profile.id ? '2px solid #0b5fff' : '1px solid #c7c7c7',
              borderRadius: 8,
              background: activeProfile === profile.id ? '#eaf2ff' : '#fff',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 600,
              padding: '10px 12px'
            }}
          >
            {profile.label}
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #ddd', paddingTop: 12 }}>
        {analysis ? (
          <>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Résumé intelligent</h3>
            <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.4 }}>{analysis.summary}</p>
            {analysis.steps.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong>À faire</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {analysis.steps.map((step) => <li key={step} style={{ marginBottom: 4 }}>{step}</li>)}
                </ul>
              </div>
            )}
            <h3 style={{ margin: '10px 0 8px', fontSize: 16 }}>Coordonnées de ce site</h3>
            {[
              ['telephone', '📞'],
              ['email', '✉️'],
              ['adresse', '📍'],
              ['horaires', '🕒']
            ].map(([key, icon]) => {
              const value = analysis.contactInfo[key as keyof ContactInfo];
              if (!value) return null;
              return (
                <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 14 }}>
                  <span>{icon}</span>
                  <span>{value}</span>
                </div>
              );
            })}
            {analysis.glossary.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 15 }}>Termes expliqués</h4>
                {analysis.glossary.map((entry) => (
                  <div key={entry.term} style={{ marginBottom: 6, fontSize: 13 }}>
                    <strong>{entry.term}</strong> : {entry.definition}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <strong>Guide rapide</strong>
              <div style={{ fontSize: 13, marginTop: 4 }}>{analysis.highlightedSelectors.length > 0 ? analysis.highlightedSelectors.join(', ') : 'Aucun repère particulier détecté.'}</div>
            </div>
            <div style={{ marginTop: 10 }}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                style={{ width: '100%', minHeight: 36, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}
                placeholder="Posez une question sur cette page"
              />
              <button onClick={askContextualQuestion} style={{ minHeight: 40, width: '100%', borderRadius: 8, border: '1px solid #0b5fff', background: '#0b5fff', color: '#fff', cursor: 'pointer' }}>
                Demander à FAILC
              </button>
              {chatReply ? <p style={{ fontSize: 13, marginTop: 6 }}>{chatReply}</p> : null}
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 14 }}>Cette page n'a pas encore été analysée par FAILC</p>
            <button
              onClick={analyzePage}
              style={{ minHeight: 44, borderRadius: 8, border: '1px solid #0b5fff', background: '#0b5fff', color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}
            >
              Analyser cette page maintenant
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Popup /></React.StrictMode>
);
