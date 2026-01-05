import { AIResponse, AIRequestPayload, Settings, StreamCallbacks } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class AIService {
  private static instance: AIService;
  private readonly OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly OPENAPI_API_URL = 'https://api.openai.com/v1/chat/completions';
  private abortController: AbortController | null = null;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  private async getSettings(): Promise<Settings> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiKey', 'provider'], (result) => {
        resolve({
          apiKey: result.apiKey || '',
          provider: result.provider || 'openrouter',
        });
      });
    });
  }

  public async rewriteText(text: string, callbacks?: StreamCallbacks): Promise<AIResponse> {
    try {
      const settings = await this.getSettings();
      
      if (!settings.apiKey) {
        return {
          success: false,
          content: '',
          error: 'API key not found. Please set your API key in the extension settings.',
        };
      }

      if (settings.provider === 'gemini') {
        return this.rewriteWithGemini(text, settings.apiKey, callbacks);
      }

      const model = settings.provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';

      const payload: AIRequestPayload = {
        model,
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content: `refine it in basic english and only return the text: 
            ${text}`,
          },
        ],
      };

      this.abortController = new AbortController();
      
      const API_URL = settings.provider === 'openrouter' ? this.OPENROUTER_API_URL : this.OPENAPI_API_URL;
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({ ...payload, stream: !!callbacks }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      // Handle streaming response
      if (callbacks) {
        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const token = parsed.choices[0]?.delta?.content || '';
                  if (token) {
                    fullContent += token;
                    callbacks.onToken(token);
                  }
                } catch (e) {
                  console.error('Error parsing streaming response:', e);
                }
              }
            }
          }
          callbacks.onComplete();
          return { success: true, content: fullContent, isStreaming: true };
        } catch (error) {
          if (error instanceof Error) {
            callbacks.onError(error.message);
          }
          throw error;
        }
      }

      // Handle non-streaming response
      const data = await response.json();
      return {
        success: true,
        content: data.choices[0].message.content.trim(),
        isStreaming: false,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'An unknown error occurred',
        isStreaming: false,
      };
    }
  }

  private async rewriteWithGemini(text: string, apiKey: string, callbacks?: StreamCallbacks): Promise<AIResponse> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `refine it in basic english and only return the text:
      ${text}`;

      if (callbacks) {
        const result = await model.generateContentStream(prompt);
        let fullContent = '';

        try {
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullContent += chunkText;
            callbacks.onToken(chunkText);
          }
          callbacks.onComplete();
          return { success: true, content: fullContent, isStreaming: true };
        } catch (error) {
           if (error instanceof Error) {
            callbacks.onError(error.message);
          }
          throw error;
        }
      } else {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return {
          success: true,
          content: text.trim(),
          isStreaming: false
        };
      }
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'An unknown error occurred with Gemini',
        isStreaming: false
      };
    }
  }

  public cancelStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
