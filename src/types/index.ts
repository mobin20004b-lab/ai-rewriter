export type Provider = 'openrouter' | 'gemini';

export interface Settings {
  apiKey: string;
  provider: Provider;
  model?: string;
}

export interface AIResponse {
  success: boolean;
  content: string;
  error?: string;
  isStreaming?: boolean;
  errorHandled?: boolean;
}

export interface Message {
  type:
    | 'REWRITE_TEXT'
    | 'REPLACE_TEXT'
    | 'SHOW_ERROR'
    | 'STREAM_START'
    | 'STREAM_TOKEN'
    | 'STREAM_END'
    | 'STREAM_ERROR'
    | 'STREAM_CANCEL'
    | 'GET_SELECTED_TEXT'
    | 'GET_LAST_SELECTION'
    | 'REWRITE_SELECTED_TEXT';
  payload: {
    text?: string;
    error?: string;
    selectedText?: string;
    token?: string;
  };
}

export interface AIRequestPayload {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}
