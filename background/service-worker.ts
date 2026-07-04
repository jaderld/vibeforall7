chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'failc-selection',
    title: 'Simplifier cette sélection avec FAILC',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'failc-selection' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_SELECTION', selectionText: info.selectionText, tabId: tab.id });
  }
});
