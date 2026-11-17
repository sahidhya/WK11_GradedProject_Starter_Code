import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent };
    }
  },
}));

import { generateText, getModelName } from '../../../src/utils/geminiClient.js';

const apiError = (status, message = 'boom') => Object.assign(new Error(message), { status });

describe('geminiClient', () => {
  beforeEach(() => {
    generateContent.mockReset();
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    delete process.env.GEMINI_MODEL;
  });

  describe('getModelName', () => {
    it('should default to the fast gemini-3.5-flash-lite model', () => {
      expect(getModelName()).toBe('gemini-3.5-flash-lite');
    });

    it('should use GEMINI_MODEL when it is set (read lazily, after .env loads)', () => {
      process.env.GEMINI_MODEL = 'gemini-3.5-flash';
      // (any other model name works the same way)

      expect(getModelName()).toBe('gemini-3.5-flash');
    });
  });

  describe('generateText', () => {
    it('should return the model text and send the model, prompt and a timeout', async () => {
      generateContent.mockResolvedValue({ text: 'hello' });

      const result = await generateText('say hi');

      expect(result).toBe('hello');
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(generateContent).toHaveBeenCalledWith({
        model: 'gemini-3.5-flash-lite',
        contents: 'say hi',
        config: { httpOptions: { timeout: expect.any(Number) } },
      });
    });

    it('should retry once after a temporary 503 and succeed', async () => {
      generateContent
        .mockRejectedValueOnce(apiError(503, 'high demand'))
        .mockResolvedValueOnce({ text: 'second time lucky' });

      const result = await generateText('prompt');

      expect(result).toBe('second time lucky');
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it('should retry once after a dropped connection (fetch failed)', async () => {
      generateContent
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce({ text: 'recovered' });

      expect(await generateText('prompt')).toBe('recovered');
    });

    it('should give up after two temporary failures with a friendly 503', async () => {
      generateContent.mockRejectedValue(apiError(504, 'deadline'));

      await expect(generateText('prompt')).rejects.toMatchObject({
        statusCode: 503,
        message: 'The AI service is busy right now. Please try again in a moment.',
      });
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it('should not retry a permanent error such as a retired model (404)', async () => {
      generateContent.mockRejectedValue(apiError(404, 'model gone'));

      await expect(generateText('prompt')).rejects.toMatchObject({
        statusCode: 502,
        message: 'The AI request failed (404).',
      });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('should not retry an invalid API key (400)', async () => {
      generateContent.mockRejectedValue(apiError(400, 'API key not valid'));

      await expect(generateText('prompt')).rejects.toMatchObject({ statusCode: 502 });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('should throw 502 when the model returns an empty response', async () => {
      generateContent.mockResolvedValue({ text: undefined });

      await expect(generateText('prompt')).rejects.toMatchObject({
        statusCode: 502,
        message: 'AI returned an empty response.',
      });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });
  });
});
