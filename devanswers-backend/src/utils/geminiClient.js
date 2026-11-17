import { GoogleGenAI } from '@google/genai';
import { createAppError } from './createAppError.js';

// Single place for the model name. Google retires models over time (e.g.
// gemini-2.5-flash is no longer available to new users) and some versions get
// overloaded, so it can be changed with GEMINI_MODEL in .env without a code
// change. The default is a "lite" model: for rewriting a question or
// summarising answers it is as good as the full model and much faster.
// Read lazily (like the API key) because .env may load after this module.
export const getModelName = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const REQUEST_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 2;

const isTemporary = (error) =>
    [429, 500, 503, 504].includes(error?.status) || /fetch failed/i.test(error?.message || '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One call to the model with a timeout (so the page never hangs) and a single
// retry for temporary failures (overload, deadline, dropped connection).
export async function generateText(prompt) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await getAI().models.generateContent({
                model: getModelName(),
                contents: prompt,
                config: { httpOptions: { timeout: REQUEST_TIMEOUT_MS } },
            });
            if (!response.text) {
                throw createAppError('AI returned an empty response.', 502);
            }
            return response.text;
        } catch (error) {
            lastError = error;
            if (error.statusCode || !isTemporary(error) || attempt === MAX_ATTEMPTS) break;
            await sleep(RETRY_DELAY_MS);
        }
    }

    if (lastError.statusCode) throw lastError;
    if (isTemporary(lastError)) {
        throw createAppError('The AI service is busy right now. Please try again in a moment.', 503);
    }
    throw createAppError(`The AI request failed (${lastError.status || 'network error'}).`, 502);
}

let ai;
export function getAI() {
    if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai;
}

export function extractJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw createAppError('AI returned an unexpected response format.', 502);
    return JSON.parse(match[0]);
}
