chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'failc-selection',
    title: 'Simplifier cette sélection avec FAILC',
    contexts: ['selection']
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.windowId) return;
  try {
    if ((chrome as any).sidePanel && (chrome as any).sidePanel.setOptions) {
      await (chrome as any).sidePanel.setOptions({
        tabId: tab.id,
        path: 'popup/popup.html',
        enabled: true
      });
      await (chrome as any).sidePanel.open({ tabId: tab.id });
    } else {
      await chrome.windows.create({ url: chrome.runtime.getURL('popup/popup.html'), type: 'popup', width: 420, height: 900 });
    }
  } catch (error) {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
    } catch (fallbackError) {
      console.error('FAILC side panel error', error, fallbackError);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle fetch and badge requests from content scripts
  if (message?.type === 'FETCH_ANALYSIS') {
    (async () => {
      try {
        const cfg = await new Promise<string>((resolve) => {
          chrome.storage.local.get(['failcApiUrl'], (result) => {
            const value = typeof result.failcApiUrl === 'string' ? result.failcApiUrl : '';
            resolve((value || 'http://127.0.0.1:8787').replace(/\/$/, ''));
          });
        });
        const resp = await fetch(`${cfg}/api/analyze-page`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload || {})
        });
        if (resp.ok) {
          const data = await resp.json();
          sendResponse(data);
        } else {
          sendResponse(null);
        }
      } catch (err) {
        sendResponse(null);
      }
    })();
    return true; // indicate async response
  }

  if (message?.type === 'SET_BADGE') {
    try {
      const status = message.status;
      chrome.action.setBadgeText({ text: status === 'ok' ? '✓' : '!' });
      chrome.action.setBadgeBackgroundColor({ color: status === 'ok' ? '#2e7d32' : '#c62828' });
    } catch (e) {
      // ignore
    }
  }
  if (message?.type === 'OPEN_SIDEPANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;
      try {
        if ((chrome as any).sidePanel && (chrome as any).sidePanel.setOptions) {
          await (chrome as any).sidePanel.setOptions({ tabId: activeTab.id, path: 'popup/popup.html', enabled: true });
          await (chrome as any).sidePanel.open({ tabId: activeTab.id });
        } else {
          chrome.windows.create({ url: chrome.runtime.getURL('popup/popup.html'), type: 'popup', width: 420, height: 900 });
        }
      } catch (error) {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
      }
    });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'failc-selection' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_SELECTION', selectionText: info.selectionText, tabId: tab.id });
  }
});
