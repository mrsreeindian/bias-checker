/**
 * gemini_client.js
 * Communicates with the Google Generative Language API (Gemini 3.8 Flash)
 */

import { DEFAULT_MODEL, FALLBACK_MODELS } from './types.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiClient {
  constructor(apiKey, preferredModel = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.preferredModel = preferredModel;
  }

  /**
   * Quick validation test for the user's Gemini API key.
   * Verifies against Google API models list and auto-detects the active working model.
   */
  static async testApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return { valid: false, error: 'API key is empty or too short' };
    }

    const trimmedKey = apiKey.trim();

    // 1. Primary validation: Query available models list via GET request
    // This verifies key validity without burning content generation tokens or guessing model availability
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const modelsUrl = `${API_BASE}?key=${trimmedKey}`;
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': trimmedKey
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const availableModels = (data.models || []).map(m => m.name ? m.name.replace(/^models\//, '') : '');
        
        // Find best match among default and fallbacks
        const preferredList = [DEFAULT_MODEL, ...FALLBACK_MODELS];
        const matchedModel = preferredList.find(m => availableModels.includes(m))
          || availableModels.find(m => m.includes('flash'))
          || DEFAULT_MODEL;

        GeminiClient.resolvedWorkingModel = matchedModel;
        return {
          valid: true,
          workingModel: matchedModel,
          note: `Key verified! Active model: ${matchedModel}`
        };
      }

      // If response failed with authentication or key error, return clear message
      if (response.status === 400 || response.status === 403) {
        const errData = await response.json().catch(() => ({}));
        const message = errData?.error?.message || `Invalid API Key (HTTP ${response.status})`;
        return { valid: false, error: message };
      }
    } catch (modelsErr) {
      console.warn('GET /models verification failed, attempting POST generateContent test...', modelsErr);
      if (modelsErr.name === 'AbortError') {
        return { valid: false, error: 'Connection timed out connecting to Google API' };
      }
    }

    // 2. Secondary fallback test: POST generateContent against candidate models
    const candidateModels = Array.from(new Set([DEFAULT_MODEL, ...FALLBACK_MODELS]));
    for (const model of candidateModels) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const testUrl = `${API_BASE}/${model}:generateContent?key=${trimmedKey}`;
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': trimmedKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with "PONG"' }] }]
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          GeminiClient.resolvedWorkingModel = model;
          return { valid: true, workingModel: model, note: `Key verified with model ${model}` };
        }

        // If 404 (model not found), continue to next fallback model
        if (response.status === 404) {
          continue;
        }

        const errData = await response.json().catch(() => ({}));
        const message = errData?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        return { valid: false, error: message };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          return { valid: false, error: 'Connection timed out connecting to Google API' };
        }
      }
    }

    return { valid: false, error: 'Unable to connect to Google API or verify API key' };
  }

  /**
   * Generates content with Gemini 3.8 Flash, fallback resilience, and structured JSON parsing
   */
  async generateContent({
    prompt,
    systemInstruction = '',
    temperature = 0.2,
    useGrounding = false,
    responseJson = true
  }) {
    if (!this.apiKey) {
      throw new Error('Google Gemini API Key is missing. Please enter your key in settings.');
    }

    const trimmedKey = this.apiKey.trim();

    // Use previously resolved working model if available to avoid repeating 404s
    const startModel = GeminiClient.resolvedWorkingModel || this.preferredModel;
    const modelsToTry = Array.from(new Set([startModel, this.preferredModel, ...FALLBACK_MODELS]));
    let lastError = null;

    for (const model of modelsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000); // 18s timeout

      try {
        const url = `${API_BASE}/${model}:generateContent?key=${trimmedKey}`;

        const payload = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: 2048
          }
        };

        if (systemInstruction) {
          payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        if (responseJson) {
          payload.generationConfig.responseMimeType = 'application/json';
        }

        if (useGrounding) {
          // Add Google Search grounding tool
          payload.tools = [{ google_search: {} }];
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': trimmedKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          const errMsg = errBody?.error?.message || `HTTP ${response.status}`;
          
          // If model not found or deprecated, try next fallback
          if (response.status === 404 || errMsg.toLowerCase().includes('not found')) {
            console.warn(`Model ${model} not available, attempting fallback...`);
            lastError = new Error(errMsg);
            continue;
          }

          // If rate limit (429), try a fallback model or wait slightly
          if (response.status === 429) {
            console.warn(`Rate limit hit on ${model}, attempting fallback model...`);
            lastError = new Error(`Rate limit exceeded (${model}). Please wait a moment.`);
            continue;
          }

          throw new Error(`Google API Error (${model}): ${errMsg}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (!candidate || !candidate.content?.parts?.length) {
          throw new Error('Gemini returned an empty candidate or was blocked by safety filters');
        }

        // Cache this working model for all subsequent agent requests!
        GeminiClient.resolvedWorkingModel = model;

        const rawText = candidate.content.parts.map(p => p.text || '').join('');
        const groundingMetadata = candidate.groundingMetadata || null;

        if (responseJson) {
          return {
            data: this.cleanAndParseJson(rawText),
            rawText,
            modelUsed: model,
            groundingMetadata
          };
        }

        return {
          text: rawText,
          modelUsed: model,
          groundingMetadata
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          lastError = new Error(`Request timed out after 18s while connecting to Gemini (${model})`);
        } else {
          lastError = err;
        }

        // If fatal auth/key error, fail immediately without cycling through models
        if (lastError.message?.includes('API_KEY_INVALID') || lastError.message?.includes('API key not valid')) {
          throw lastError;
        }

        // For model not found (404), rate limit (429), or timeout, log and continue to next fallback
        console.warn(`Model ${model} attempt failed (${lastError.message}), attempting fallback...`);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error('Failed to generate content across available models');
  }

  /**
   * Helper to clean markdown code blocks around JSON and parse safely
   */
  cleanAndParseJson(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Empty text received from model');
    }

    let cleaned = text.trim();
    // Remove ```json and ``` fences if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/```\s*$/, '');
    }
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // Find the first { or [ and last } or ]
      const firstCurly = cleaned.indexOf('{');
      const lastCurly = cleaned.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        try {
          return JSON.parse(cleaned.substring(firstCurly, lastCurly + 1));
        } catch (innerErr) {
          // ignore
        }
      }
      throw new Error(`Failed to parse model JSON: ${e.message}\nRaw response: ${text.substring(0, 300)}...`);
    }
  }
}
