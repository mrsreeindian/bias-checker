/**
 * ollama_client.js
 * Communicates with Ollama Cloud / API servers
 */

import { DEFAULT_OLLAMA_ENDPOINT, DEFAULT_MODEL, FALLBACK_MODELS } from './types.js';

export class OllamaClient {
  constructor({ endpoint = DEFAULT_OLLAMA_ENDPOINT, apiKey = '', model = DEFAULT_MODEL } = {}) {
    this.endpoint = OllamaClient.normalizeEndpoint(endpoint);
    this.apiKey = (apiKey || '').trim();
    this.preferredModel = (model || DEFAULT_MODEL).trim();
  }

  static normalizeEndpoint(url) {
    if (!url || typeof url !== 'string') return DEFAULT_OLLAMA_ENDPOINT;
    let trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'http://' + trimmed;
    }
    return trimmed;
  }

  /**
   * Tests connectivity to Ollama server, lists available models, and verifies endpoint
   */
  static async testConnection({ endpoint = DEFAULT_OLLAMA_ENDPOINT, apiKey = '', model = DEFAULT_MODEL } = {}) {
    const normalizedEndpoint = OllamaClient.normalizeEndpoint(endpoint);
    const trimmedKey = (apiKey || '').trim();
    const targetModel = (model || DEFAULT_MODEL).trim();

    const headers = { 'Content-Type': 'application/json' };
    if (trimmedKey) {
      headers['Authorization'] = `Bearer ${trimmedKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      // 1. Fetch available models from GET /api/tags
      const tagsUrl = `${normalizedEndpoint}/api/tags`;
      const tagsResponse = await fetch(tagsUrl, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!tagsResponse.ok) {
        if (tagsResponse.status === 401 || tagsResponse.status === 403) {
          return { valid: false, error: `Authentication failed (HTTP ${tagsResponse.status}). Please check your API key.` };
        }
        return { valid: false, error: `Ollama server returned HTTP ${tagsResponse.status}: ${tagsResponse.statusText}` };
      }

      const tagsData = await tagsResponse.json().catch(() => ({}));
      const modelsList = (tagsData.models || []).map(m => m.name || m.model || '');

      let workingModel = targetModel;
      if (modelsList.length > 0) {
        // Find if target model is installed or choose best match
        const found = modelsList.find(m => m.toLowerCase().startsWith(targetModel.toLowerCase()))
          || modelsList.find(m => m.toLowerCase().includes('llama'))
          || modelsList.find(m => m.toLowerCase().includes('deepseek'))
          || modelsList.find(m => m.toLowerCase().includes('mistral'))
          || modelsList[0];
        if (found) workingModel = found;
      }

      // 2. Perform a test ping with POST /api/chat
      const chatController = new AbortController();
      const chatTimeout = setTimeout(() => chatController.abort(), 15000);

      try {
        const chatRes = await fetch(`${normalizedEndpoint}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: workingModel,
            messages: [{ role: 'user', content: 'Ping' }],
            stream: false
          }),
          signal: chatController.signal
        });
        clearTimeout(chatTimeout);

        if (chatRes.ok) {
          return {
            valid: true,
            workingModel,
            availableModels: modelsList,
            note: `Connected successfully! Active model: ${workingModel}`
          };
        }
      } catch (chatErr) {
        clearTimeout(chatTimeout);
        console.warn('Test chat failed, but server is reachable:', chatErr);
      }

      return {
        valid: true,
        workingModel,
        availableModels: modelsList,
        note: `Ollama server connected (${modelsList.length} models available).`
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { valid: false, error: `Connection timed out connecting to ${normalizedEndpoint}. Is the server running?` };
      }
      return { valid: false, error: `Cannot reach Ollama at ${normalizedEndpoint}: ${err.message}` };
    }
  }

  /**
   * Generates response from Ollama chat endpoint with fallback resilience and JSON parsing
   */
  async generateContent({
    prompt,
    systemInstruction = '',
    temperature = 0.1,
    responseJson = true
  }) {
    const modelsToTry = Array.from(new Set([
      this.preferredModel,
      ...FALLBACK_MODELS
    ]));

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let lastError = null;

    for (const model of modelsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s for local/cloud LLM inference

      try {
        const url = `${this.endpoint}/api/chat`;

        const messages = [];
        if (systemInstruction) {
          messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        const payload = {
          model,
          messages,
          stream: false,
          options: {
            temperature: temperature
          }
        };

        if (responseJson) {
          payload.format = 'json';
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          if (response.status === 404) {
            console.warn(`Model ${model} not found on Ollama server, trying fallback...`);
            lastError = new Error(`Model ${model} not found`);
            continue;
          }
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Authentication error on ${this.endpoint}: Invalid API key or token`);
          }
          throw new Error(`Ollama Error (${model}): HTTP ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const rawText = data.message?.content || data.response || '';

        if (!rawText.trim()) {
          throw new Error('Empty response received from Ollama model');
        }

        if (responseJson) {
          return {
            data: this.cleanAndParseJson(rawText),
            rawText,
            modelUsed: model
          };
        }

        return {
          text: rawText,
          modelUsed: model
        };
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err.name === 'AbortError') {
          lastError = new Error(`Inference timed out on model ${model} at ${this.endpoint}`);
        }

        // Fatal auth errors fail fast
        if (lastError.message?.includes('Authentication error')) {
          throw lastError;
        }

        console.warn(`Ollama attempt with ${model} failed: ${lastError.message}. Trying next fallback...`);
      }
    }

    throw lastError || new Error('Failed to generate response across available Ollama models');
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
