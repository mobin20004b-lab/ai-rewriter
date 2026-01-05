import { Message } from '../types';

class ContentScript {
  private toast: HTMLDivElement | null = null;
  private suggestionCard: HTMLDivElement | null = null;
  private suggestionContent: HTMLDivElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private currentSelection: Selection | null = null;
  private rewrittenText: string = '';
  private originalText: string = '';
  private isStreaming: boolean = false;
  private streamContent: string = '';
  private typingSpeed: number = 1; // Adjust typing speed (lower = faster)
  private selectionButton: HTMLButtonElement | null = null;
  private selectionText: string = '';
  private pendingSelectionText: string = '';
  private isSelectionButtonPressed: boolean = false;
  private selectionUpdateRaf: number | null = null;
  private escapeKeyListenerAttached: boolean = false;
  private static readonly cursorStyleId = 'ai-rewriter-cursor-style';

  constructor() {
    this.initializeMessageListener();
    this.ensureCursorStyles();
    this.createToastElement();
    this.createOverlay();
    this.createSuggestionCard();
    this.initializeDismissListeners();
    this.createSelectionButton();
    this.initializeSelectionListeners();
  }

  private ensureCursorStyles(): void {
    if (document.getElementById(ContentScript.cursorStyleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = ContentScript.cursorStyleId;
    style.textContent = `
      @keyframes blink {
        50% { opacity: 0; }
      }

      .typing-cursor {
        display: inline-block;
        animation: blink 1s step-end infinite;
      }
    `;

    document.head?.appendChild(style);
  }

  private createToastElement(): void {
    this.toast = document.createElement('div');
    this.toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 16px;
      background: #333;
      color: white;
      border-radius: 8px;
      z-index: 10001;
      display: none;
      max-width: 300px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(this.toast);
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: none;
      backdrop-filter: blur(2px);
    `;
    this.overlay.addEventListener('click', () => this.hideSuggestionCard());
    document.body.appendChild(this.overlay);
  }

  private createSelectionButton(): void {
    this.selectionButton = document.createElement('button');
    this.selectionButton.type = 'button';
    this.selectionButton.setAttribute('aria-label', 'Rewrite selected text');
    this.selectionButton.style.cssText = `
      position: fixed;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: #3c3c3c;
      color: #fff;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
      z-index: 10002;
      transition: transform 0.15s ease, background-color 0.2s ease;
    `;
    this.selectionButton.textContent = 'AI';
    this.selectionButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.isSelectionButtonPressed = true;
      const selectionText = this.getSelectedText().trim();
      if (selectionText) {
        this.pendingSelectionText = selectionText;
        this.selectionText = selectionText;
      }
    });
    this.selectionButton.addEventListener('pointerup', () => {
      this.isSelectionButtonPressed = false;
      setTimeout(() => {
        if (!this.isSelectionButtonPressed) {
          this.pendingSelectionText = '';
        }
      }, 0);
    });
    this.selectionButton.addEventListener('pointercancel', () => {
      this.isSelectionButtonPressed = false;
      this.pendingSelectionText = '';
    });
    this.selectionButton.addEventListener('mouseenter', () => {
      if (this.selectionButton) {
        this.selectionButton.style.backgroundColor = '#4c4c4c';
        this.selectionButton.style.transform = 'scale(1.05)';
      }
    });
    this.selectionButton.addEventListener('mouseleave', () => {
      if (this.selectionButton) {
        this.selectionButton.style.backgroundColor = '#3c3c3c';
        this.selectionButton.style.transform = 'scale(1)';
      }
    });
    this.selectionButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text =
        this.pendingSelectionText.trim() ||
        this.getSelectedText().trim() ||
        this.selectionText.trim();
      if (!text) {
        this.hideSelectionButton();
        this.isSelectionButtonPressed = false;
        return;
      }
      chrome.runtime.sendMessage({
        type: 'REWRITE_SELECTED_TEXT',
        payload: { text },
      } as Message);
      this.pendingSelectionText = '';
      this.hideSelectionButton();
      this.isSelectionButtonPressed = false;
    });
    document.body.appendChild(this.selectionButton);
  }

  private createSuggestionCard(): void {
    this.suggestionCard = document.createElement('div');
    this.suggestionCard.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 20px;
      background: #2c2c2c;
      color: white;
      border-radius: 12px;
      z-index: 10001;
      display: none;
      width: 90%;
      max-width: 500px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      font-family: system-ui, -apple-system, sans-serif;
      border: 1px solid #3c3c3c;
      animation: fadeIn 0.3s ease-out;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #3c3c3c;
    `;

    const title = document.createElement('div');
    title.textContent = 'AI Rewriter';
    title.style.cssText = `
      font-weight: 600;
      font-size: 16px;
      color: #fff;
      flex-grow: 1;
    `;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.cssText = `
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 4px;
      font-size: 16px;
      line-height: 1;
      transition: color 0.2s;
    `;
    closeButton.addEventListener('mouseover', () => {
      closeButton.style.color = '#fff';
    });
    closeButton.addEventListener('mouseout', () => {
      closeButton.style.color = '#999';
    });
    closeButton.addEventListener('click', () => this.hideSuggestionCard());

    header.appendChild(title);
    header.appendChild(closeButton);

    const content = document.createElement('div');
    this.suggestionContent = content;
    content.style.cssText = `
      margin-bottom: 16px;
      color: #e0e0e0;
      font-size: 15px;
      line-height: 1.6;
      white-space: pre-wrap;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;

    const copyButton = this.createButton('Copy', '📋');
    copyButton.addEventListener('click', () => this.copyToClipboard());

    buttonContainer.appendChild(copyButton);

    this.suggestionCard.appendChild(header);
    this.suggestionCard.appendChild(content);
    this.suggestionCard.appendChild(buttonContainer);
    document.body.appendChild(this.suggestionCard);
  }

  private createButton(text: string, icon: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.innerHTML = `${icon} ${text}`;
    button.style.cssText = `
      background: #3c3c3c;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background-color 0.2s;
    `;
    button.addEventListener('mouseover', () => {
      button.style.backgroundColor = '#4c4c4c';
    });
    button.addEventListener('mouseout', () => {
      button.style.backgroundColor = '#3c3c3c';
    });
    return button;
  }

  private async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.rewrittenText);
      this.showToast('Copied to clipboard!');
    } catch (error) {
      this.showToast('Failed to copy text', true);
    }
  }

  private showSuggestionCard(text: string, isStreaming: boolean = false): void {
    if (!this.suggestionCard || !this.overlay) return;

    // Store the text
    this.rewrittenText = text;
    this.originalText = window.getSelection()?.toString() || '';

    // Update content
    const content = this.suggestionContent;
    if (content) {
      content.textContent = text;
    }

    // Show overlay and card if not already visible
    if (this.overlay.style.display !== 'block') {
      this.overlay.style.display = 'block';
      this.suggestionCard.style.display = 'block';
    }

    this.hideSelectionButton();
  }

  private startStreaming(): void {
    if (!this.suggestionCard) return;

    this.isStreaming = true;
    this.streamContent = '';
    this.showSuggestionCard('', true);

    // Update UI for streaming state
    const content = this.suggestionContent;
    if (content) {
      content.textContent = '';
      // Add blinking cursor effect
      const cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      cursor.textContent = '|';
      content.appendChild(cursor);
    }
  }

  private appendStreamToken(token: string): void {
    if (!this.suggestionCard || !this.isStreaming) return;

    const content = this.suggestionContent;
    if (!content) return;

    this.streamContent += token;
    
    // Remove existing cursor
    const cursor = content.querySelector('.typing-cursor');
    if (cursor) {
      cursor.remove();
    }

    // Update content with new token
    content.textContent = this.streamContent;

    // Add cursor back
    const newCursor = document.createElement('span');
    newCursor.className = 'typing-cursor';
    newCursor.textContent = '|';
    content.appendChild(newCursor);
  }

  private endStreaming(): void {
    if (!this.suggestionCard) return;

    this.isStreaming = false;
    this.rewrittenText = this.streamContent;

    // Remove cursor
    const content = this.suggestionContent;
    if (content) {
      const cursor = content.querySelector('.typing-cursor');
      if (cursor) {
        cursor.remove();
      }
    }
  }

  private hideSuggestionCard(): void {
    if (this.suggestionCard && this.overlay) {
      this.suggestionCard.style.display = 'none';
      this.overlay.style.display = 'none';
    }
  }

  private initializeDismissListeners(): void {
    if (this.escapeKeyListenerAttached) {
      return;
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.suggestionCard?.style.display === 'block') {
        this.hideSuggestionCard();
      }
    });

    this.escapeKeyListenerAttached = true;
  }

  private initializeSelectionListeners(): void {
    document.addEventListener('selectionchange', () => this.scheduleSelectionUpdate());
    document.addEventListener('mouseup', () => this.scheduleSelectionUpdate());
    document.addEventListener('keyup', () => this.scheduleSelectionUpdate());
    document.addEventListener('scroll', () => this.hideSelectionButton(), true);
    window.addEventListener('resize', () => this.hideSelectionButton());
  }

  private scheduleSelectionUpdate(): void {
    if (this.selectionUpdateRaf !== null) {
      cancelAnimationFrame(this.selectionUpdateRaf);
    }

    this.selectionUpdateRaf = requestAnimationFrame(() => {
      this.selectionUpdateRaf = null;
      this.handleSelectionChange();
    });
  }

  private handleSelectionChange(): void {
    if (!this.selectionButton) return;
    if (this.isSelectionButtonPressed) return;
    if (document.activeElement === this.selectionButton) return;
    if (this.overlay?.style.display === 'block') {
      this.hideSelectionButton();
      return;
    }

    const selectedText = this.getSelectedText();
    if (!selectedText) {
      this.hideSelectionButton();
      return;
    }

    const rect = this.getSelectionRect();
    if (!rect) {
      this.hideSelectionButton();
      return;
    }

    this.selectionText = selectedText;
    this.positionSelectionButton(rect);
  }

  private getSelectionRect(): DOMRect | null {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }

      const clientRects = range.getClientRects();
      if (clientRects.length > 0) {
        return clientRects[clientRects.length - 1];
      }
    }

    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      const start = activeElement.selectionStart ?? 0;
      const end = activeElement.selectionEnd ?? 0;
      if (start !== end) {
        return this.getInputSelectionRect(activeElement);
      }
    }

    return null;
  }

  private getInputSelectionRect(
    element: HTMLInputElement | HTMLTextAreaElement
  ): DOMRect | null {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    if (start === end) {
      return null;
    }

    const computedStyle = window.getComputedStyle(element);
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    mirror.style.overflow = 'hidden';
    mirror.style.whiteSpace =
      element instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre';
    mirror.style.wordBreak = 'break-word';
    mirror.style.boxSizing = computedStyle.boxSizing;
    mirror.style.width = computedStyle.width;
    mirror.style.height = computedStyle.height;
    mirror.style.fontFamily = computedStyle.fontFamily;
    mirror.style.fontSize = computedStyle.fontSize;
    mirror.style.fontWeight = computedStyle.fontWeight;
    mirror.style.fontStyle = computedStyle.fontStyle;
    mirror.style.letterSpacing = computedStyle.letterSpacing;
    mirror.style.lineHeight = computedStyle.lineHeight;
    mirror.style.textTransform = computedStyle.textTransform;
    mirror.style.textAlign = computedStyle.textAlign;
    mirror.style.paddingTop = computedStyle.paddingTop;
    mirror.style.paddingRight = computedStyle.paddingRight;
    mirror.style.paddingBottom = computedStyle.paddingBottom;
    mirror.style.paddingLeft = computedStyle.paddingLeft;
    mirror.style.borderTopWidth = computedStyle.borderTopWidth;
    mirror.style.borderRightWidth = computedStyle.borderRightWidth;
    mirror.style.borderBottomWidth = computedStyle.borderBottomWidth;
    mirror.style.borderLeftWidth = computedStyle.borderLeftWidth;

    const beforeText = element.value.slice(0, start);
    const selectionText = element.value.slice(start, end);
    const afterText = element.value.slice(end);

    mirror.append(document.createTextNode(beforeText));
    const selectionSpan = document.createElement('span');
    selectionSpan.textContent = selectionText || '\u200b';
    mirror.append(selectionSpan);
    mirror.append(document.createTextNode(afterText));

    document.body.append(mirror);

    const mirrorRect = mirror.getBoundingClientRect();
    const selectionRect = selectionSpan.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollLeft = element.scrollLeft;
    const scrollTop = element.scrollTop;

    const left = elementRect.left + (selectionRect.left - mirrorRect.left) - scrollLeft;
    const top = elementRect.top + (selectionRect.top - mirrorRect.top) - scrollTop;
    const width = Math.max(selectionRect.width, 1);
    const height = Math.max(selectionRect.height, 1);

    mirror.remove();

    return new DOMRect(left, top, width, height);
  }

  private positionSelectionButton(rect: DOMRect): void {
    if (!this.selectionButton) return;

    const buttonSize = 28;
    const padding = 8;
    let top = rect.top - buttonSize - padding;
    if (top < padding) {
      top = rect.bottom + padding;
    }

    let left = rect.left + rect.width - buttonSize;
    if (left < padding) {
      left = padding;
    }

    if (left + buttonSize > window.innerWidth - padding) {
      left = window.innerWidth - buttonSize - padding;
    }

    this.selectionButton.style.top = `${top}px`;
    this.selectionButton.style.left = `${left}px`;
    this.selectionButton.style.display = 'flex';
  }

  private hideSelectionButton(): void {
    if (this.selectionButton) {
      this.selectionButton.style.display = 'none';
    }
    this.selectionText = '';
    this.pendingSelectionText = '';
    this.isSelectionButtonPressed = false;
  }

  private showToast(message: string, isError: boolean = false): void {
    if (!this.toast) return;

    this.toast.textContent = message;
    this.toast.style.background = isError ? '#dc3545' : '#28a745';
    this.toast.style.display = 'block';

    setTimeout(() => {
      if (this.toast) {
        this.toast.style.display = 'none';
      }
    }, 3000);
  }

  private getSelectedText(): string {
    const selectionText = window.getSelection()?.toString().trim();
    if (selectionText) {
      return selectionText;
    }

    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (!activeElement) return '';

    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      const start = activeElement.selectionStart ?? 0;
      const end = activeElement.selectionEnd ?? 0;
      if (start !== end) {
        return activeElement.value.substring(start, end);
      }
    }

    if (activeElement.isContentEditable) {
      return window.getSelection()?.toString().trim() ?? '';
    }

    return '';
  }

  private initializeMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      switch (message.type) {
        case 'GET_SELECTED_TEXT':
          sendResponse({ selectedText: this.getSelectedText() });
          return true;
        case 'REWRITE_TEXT':
          if (message.payload.text) {
            this.showSuggestionCard(message.payload.text);
          }
          break;
        case 'STREAM_START':
          this.startStreaming();
          break;
        case 'STREAM_TOKEN':
          if (message.payload.token) {
            this.appendStreamToken(message.payload.token);
          }
          break;
        case 'STREAM_END':
          this.endStreaming();
          break;
        case 'STREAM_ERROR':
        case 'SHOW_ERROR':
          if (message.payload.error) {
            this.showToast(message.payload.error, true);
            this.hideSuggestionCard();
          }
          break;
      }
      return false;
    });
  }
}

// Initialize content script
new ContentScript();
