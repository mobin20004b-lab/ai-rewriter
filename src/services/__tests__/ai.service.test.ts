import { beforeEach, describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';
import { AIService } from '../ai.service';

vi.mock('openai', () => {
  return {
    default: vi.fn(),
  };
});

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn(),
  };
});

type OpenAIMockInstance = {
  chat: {
    completions: {
      create: ReturnType<typeof vi.fn>;
    };
  };
};

const openAIConstructor = OpenAI as unknown as ReturnType<typeof vi.fn>;

const setChromeSettings = (settings: { apiKey: string; provider: 'openrouter'; model?: string }) => {
  const chromeMock = {
    storage: {
      sync: {
        get: vi.fn((keys?: unknown, cb?: (result: typeof settings) => void) => {
          if (typeof keys === 'function') {
            keys(settings);
            return;
          }
          if (cb) {
            cb(settings);
          }
        }),
      },
    },
  };

  (globalThis as typeof globalThis & { chrome?: unknown }).chrome = chromeMock;
};

describe('AIService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the OpenAI SDK with prompt features for non-streaming responses', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Rewritten text.',
          },
        },
      ],
    });
    const openAIInstance: OpenAIMockInstance = {
      chat: {
        completions: {
          create,
        },
      },
    };
    openAIConstructor.mockReturnValue(openAIInstance);
    setChromeSettings({ apiKey: 'test-key', provider: 'openrouter', model: 'openai/gpt-4o-mini' });

    const service = AIService.getInstance();
    const response = await service.rewriteText('Original text.');

    expect(response).toEqual({
      success: true,
      content: 'Rewritten text.',
      isStreaming: false,
    });
    expect(openAIConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
      })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4o-mini',
        max_tokens: 1200,
        temperature: 0.2,
        top_p: 1,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'assistant' }),
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('streams tokens via callbacks', async () => {
    async function* streamChunks() {
      yield {
        choices: [{ delta: { content: 'Hello ' } }],
      };
      yield {
        choices: [{ delta: { content: 'world' } }],
      };
    }

    const create = vi.fn().mockResolvedValue(streamChunks());
    const openAIInstance: OpenAIMockInstance = {
      chat: {
        completions: {
          create,
        },
      },
    };
    openAIConstructor.mockReturnValue(openAIInstance);
    setChromeSettings({ apiKey: 'test-key', provider: 'openrouter' });

    const tokens: string[] = [];
    const callbacks = {
      onToken: (token: string) => tokens.push(token),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    const service = AIService.getInstance();
    const response = await service.rewriteText('Original text.', callbacks);

    expect(response).toEqual({
      success: true,
      content: 'Hello world',
      isStreaming: true,
    });
    expect(tokens).toEqual(['Hello ', 'world']);
    expect(callbacks.onComplete).toHaveBeenCalled();
    expect(openAIConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
      })
    );
  });
});
