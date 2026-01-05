import { AIResponse, AIRequestPayload, Settings, StreamCallbacks, Provider } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export class AIService {
  private static instance: AIService;
  private readonly OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
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
      chrome.storage.sync.get(['apiKey', 'provider', 'model'], (result) => {
        resolve({
          apiKey: result.apiKey || '',
          provider: result.provider || 'openrouter',
          model: result.model,
        });
      });
    });
  }

  public async fetchModels(provider: Provider, apiKey: string): Promise<string[]> {
    try {
      if (provider === 'openrouter') {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (!response.ok) return [];
        const data = await response.json();
        return data.data.map((m: any) => m.id);
      } else if (provider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) return [];
        const data = await response.json();
        // Gemini returns model names like "models/gemini-1.5-flash".
        // We can just use them as is, or strip "models/".
        // The SDK usually accepts "gemini-1.5-flash" or "models/gemini-1.5-flash".
        // Let's strip "models/" for cleaner UI, but ensure we handle it correctly.
        return (data.models || [])
          .map((m: any) => m.name.replace(/^models\//, ''))
          .filter((name: string) => name.includes('gemini')); // Filter for gemini models to be safe
      }
      return [];
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
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
        return this.rewriteWithGemini(text, settings.apiKey, settings.model, callbacks);
      }

      const model = settings.model || 'openai/gpt-4o-mini';

      const payload: AIRequestPayload = {
        model,
        max_tokens: 1200,
        temperature: 0.2,
        top_p: 1,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        messages: this.buildPromptMessages(text),
      };

      this.abortController = new AbortController();
      const client = this.createOpenAIClient(settings);

      if (callbacks) {
        const stream = await client.chat.completions.create(
          { ...payload, stream: true },
          { signal: this.abortController.signal }
        );
        let fullContent = '';

        try {
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content || '';
            if (token) {
              fullContent += token;
              callbacks.onToken(token);
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

      const response = await client.chat.completions.create(payload, {
        signal: this.abortController.signal,
      });
      return {
        success: true,
        content: response.choices[0]?.message?.content?.trim() || '',
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

  private buildPromptMessages(text: string): AIRequestPayload['messages'] {
    return [
      {
        role: 'system',
        content:
          'You are a helpful editor. Rewrite text into clear, basic English. Only return the rewritten text without additional commentary.',
      },
      {
        role: 'user',
        content: 'Rewrite the following text in basic English: "We herein acknowledge receipt of the materials."',
      },
      {
        role: 'assistant',
        content: 'We confirm that we received the materials.',
      },
      {
        role: 'user',
        content: `Rewrite the following text in basic English and return only the rewritten text:\n${text}`,
      },
    ];
  }

  private createOpenAIClient(settings: Settings): OpenAI {
    return new OpenAI({
      apiKey: settings.apiKey,
      baseURL: this.OPENROUTER_BASE_URL,
      dangerouslyAllowBrowser: true,
    });
  }

  private async rewriteWithGemini(text: string, apiKey: string, modelName: string | undefined, callbacks?: StreamCallbacks): Promise<AIResponse> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName || "gemini-1.5-flash" });

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
