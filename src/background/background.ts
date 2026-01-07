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

const runRewrite = async (tabId: number, selectedText: string, instruction: string) => {
  let streamErrorEmitted = false;
  try {
    const aiService = AIService.getInstance();

    chrome.tabs.sendMessage(tabId, {
      type: 'STREAM_START',
      payload: {},
    } as Message);

    const response = await aiService.rewriteText(selectedText, { instruction }, {
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
        streamErrorEmitted = true;
        chrome.tabs.sendMessage(tabId, {
          type: 'STREAM_ERROR',
          payload: {
            error,
          },
        } as Message);
      },
    });

    if (!response.success && !streamErrorEmitted && !response.errorHandled) {
      chrome.tabs.sendMessage(tabId, {
        type: 'STREAM_ERROR',
        payload: {
          error: response.error || 'Failed to rewrite text',
        },
      } as Message);
    }
  } catch (error) {
    if (streamErrorEmitted) return;
    chrome.tabs.sendMessage(tabId, {
      type: 'STREAM_ERROR',
      payload: {
        error: 'Failed to rewrite text. Please try again.',
      },
    } as Message);
  }
};

chrome.runtime.onMessage.addListener((message: Message, sender) => {
  if (message.type !== 'REWRITE_SELECTED_TEXT') return false;
  const tabId = sender.tab?.id;
  if (!tabId || !message.payload.text) return false;

  const defaultInstruction = menuItems[0]?.instruction ?? 'Rewrite the following text in clear, basic English.';
  void runRewrite(tabId, message.payload.text, defaultInstruction);
  return false;
});

const createContextMenus = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'aiRewriter',
      title: 'AI Rewriter',
      contexts: ['all'],
    });
    menuItems.forEach((item) => {
      chrome.contextMenus.create({
        id: item.id,
        parentId: 'aiRewriter',
        title: item.title,
        contexts: ['all'],
      });
    });
  });
};

// Ensure menu items exist on install/update and browser startup
chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
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

    await runRewrite(tabId, selectedText, menuItem.instruction);
  }
});
