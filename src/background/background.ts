import { AIService } from '../services/ai.service';
import { Message } from '../types';

const menuItems = [
  {
    id: 'rewriteText',
    title: 'Rewrite it',
    instruction: 'Rewrite the following text in clear, basic English.',
  },
  {
    id: 'rewriteShorter',
    title: 'Make it shorter',
    instruction: 'Shorten the following text while preserving the meaning.',
  },
  {
    id: 'rewriteLonger',
    title: 'Make it longer',
    instruction: 'Expand the following text with more detail while keeping the meaning.',
  },
  {
    id: 'rewriteFormal',
    title: 'Make it formal',
    instruction: 'Rewrite the following text in a formal, professional tone.',
  },
  {
    id: 'rewriteCasual',
    title: 'Make it casual',
    instruction: 'Rewrite the following text in a friendly, casual tone.',
  },
  {
    id: 'rewriteGrammar',
    title: 'Fix grammar',
    instruction: 'Fix grammar, spelling, and punctuation while keeping the same tone.',
  },
  {
    id: 'rewriteSimplify',
    title: 'Simplify',
    instruction: 'Simplify the following text to be easier to understand.',
  },
];

// Remove existing menu items if any
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'aiRewriter',
      title: 'AI Rewriter',
      contexts: ['selection', 'editable'],
      documentUrlPatterns: ['<all_urls>']
    });
    menuItems.forEach((item) => {
      chrome.contextMenus.create({
        id: item.id,
        parentId: 'aiRewriter',
        title: item.title,
        contexts: ['selection', 'editable'],
        documentUrlPatterns: ['<all_urls>'],
      });
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItem = menuItems.find((item) => item.id === info.menuItemId);
  if (menuItem && tab?.id) {
    let selectedText = info.selectionText || '';
    const tabId = tab.id; // Store tab.id to ensure it's defined throughout the callbacks

    if (!selectedText) {
      try {
        const response = (await chrome.tabs.sendMessage(tabId, {
          type: 'GET_SELECTED_TEXT',
          payload: {},
        } as Message)) as { selectedText?: string };
        selectedText = response?.selectedText?.trim() || '';
      } catch (error) {
        selectedText = '';
      }
    }

    if (!selectedText) return;

    try {
      const aiService = AIService.getInstance();

      // Start streaming
      chrome.tabs.sendMessage(tabId, {
        type: 'STREAM_START',
        payload: {},
      } as Message);

      const response = await aiService.rewriteText(selectedText, { instruction: menuItem.instruction }, {
        onToken: (token: string) => {
          chrome.tabs.sendMessage(tabId, {
            type: 'STREAM_TOKEN',
            payload: {
              token,
            },
          } as Message);
        },
        onComplete: () => {
          chrome.tabs.sendMessage(tabId, {
            type: 'STREAM_END',
            payload: {},
          } as Message);
        },
        onError: (error: string) => {
          chrome.tabs.sendMessage(tabId, {
            type: 'STREAM_ERROR',
            payload: {
              error,
            },
          } as Message);
        },
      });

      if (!response.success) {
        chrome.tabs.sendMessage(tabId, {
          type: 'STREAM_ERROR',
          payload: {
            error: response.error || 'Failed to rewrite text',
          },
        } as Message);
      }
    } catch (error) {
      chrome.tabs.sendMessage(tabId, {
        type: 'STREAM_ERROR',
        payload: {
          error: 'Failed to rewrite text. Please try again.',
        },
      } as Message);
    }
  }
});
