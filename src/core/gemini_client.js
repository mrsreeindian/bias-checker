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
   * Quick validation test for the user's Gemini API key
   */
  static async testApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return { valid: false, error: 'API key is empty or too short' };
    }

    const testUrl = `${API_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey.trim()}`;
    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with "PONG"' }] }]
        })
      });

      if (response.ok) {
        return { valid: true };
      }

      // If model not found (404), try fallback to test if key itself is valid
      if (response.status === 404) {
        for (const fallback of FALLBACK_MODELS) {
          const fbUrl = `${API_BASE}/${fallback}:generateContent?key=${apiKey.trim()}`;
          const fbRes = await fetch(fbUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Respond with "PONG"' }] }]
            })
          });
          if (fbRes.ok) {
            return { valid: true, note: `Key verified with fallback model ${fallback}` };
          }
        }
      }

      const errData = await response.json().catch(() => ({}));
      const message = errData?.error?.message || `HTTP ${response.status} ${response.statusText}`;
      return { valid: false, error: message };
    } catch (err) {
      return { valid: false, error: err.message || 'Network error connecting to Google API' };
    }
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

    // Use previously resolved working model if available to avoid repeating 404s
    const startModel = GeminiClient.resolvedWorkingModel || this.preferredModel;
    const remainingModels = [this.preferredModel, ...FALLBACK_MODELS].filter(m => m !== startModel);
    const modelsToTry = [startModel, ...remainingModels];
    let lastError = null;

    for (const model of modelsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000); // 18s timeout

      try {
        const url = `${API_BASE}/${model}:generateContent?key=${this.apiKey.trim()}`;

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
          headers: { 'Content-Type': 'application/json' },
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
        lastError = err;
        // If not a 404, don't silently loop through all models unless it's a model specific issue
        if (!err.message?.includes('not found') && !err.message?.includes('HTTP 404')) {
          throw err;
        }
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
