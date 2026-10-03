/**
 * service_worker.js
 * Cross-browser Background Service Worker for Fact-Checker AI Council
 */

import { CouncilDebateEngine } from '../core/council_debate.js';
import { GeminiClient } from '../core/gemini_client.js';
import { DEFAULT_MODEL } from '../core/types.js';

// Setup Context Menus upon installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fc_check_page',
    title: '🏛️ Fact-Check This Page with AI Council',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'fc_check_selection',
    title: '🔍 Fact-Check Selected Claim with AI Council',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'fc_check_page' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FACT_CHECK' }).catch(() => {});
  } else if (info.menuItemId === 'fc_check_selection' && tab?.id && info.selectionText) {
    // Check specific selection
    handleCustomClaimCheck(tab.id, info.selectionText, tab.url);
  }
});

// Track in-flight fact-check promises to prevent duplicate parallel debate executions
const inFlightChecks = new Map();

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'GET_PAGE_STATUS':
        return await handleGetPageStatus(message.url);

      case 'SAVE_AND_VERIFY_API_KEY':
        return await handleSaveAndVerifyKey(message.apiKey);

      case 'START_FACT_CHECK':
        const targetTabId = sender?.tab?.id || message.tabId;
        return await handleStartFactCheck(message.articleData, targetTabId);

      case 'GET_REPORT':
        return await handleGetReport(message.reportId, message.url);

      case 'OPEN_COUNCIL_CHAMBER':
        return await handleOpenCouncilChamber(message.reportId);

      case 'CLEAR_CACHE':
        return await handleClearCache();

      default:
        return { error: 'Unknown message type' };
    }
  };

  handler().then(sendResponse).catch(err => {
    console.error('Service worker error:', err);
    sendResponse({ error: err.message });
  });

  return true; // Keep asynchronous channel open
});

/**
 * Checks if API key is configured and if a cached report exists for the given URL
 */
async function handleGetPageStatus(url) {
  const data = await chrome.storage.local.get(['geminiApiKey', 'reportsCache', 'showForumWarning']);
  const hasApiKey = !!data.geminiApiKey;
  const reportsCache = data.reportsCache || {};
  const normalized = normalizeUrl(url);
  const cachedReport = url ? reportsCache[normalized] : null;
  const isAnalyzing = normalized ? inFlightChecks.has(normalized) : false;

  return {
    hasApiKey,
    cachedReport: cachedReport || null,
    showForumWarning: data.showForumWarning !== false,
    isAnalyzing
  };
}

/**
 * Validates and securely saves the Gemini API key
 */
async function handleSaveAndVerifyKey(apiKey) {
  const testResult = await GeminiClient.testApiKey(apiKey);
  if (testResult.valid) {
    const toSave = { geminiApiKey: apiKey.trim() };
    if (testResult.workingModel) {
      toSave.modelPreference = testResult.workingModel;
    }
    await chrome.storage.local.set(toSave);
    return {
      valid: true,
      note: testResult.note,
      workingModel: testResult.workingModel
    };
  }
  return { valid: false, error: testResult.error };
}

/**
 * Executes the full council debate
 */
async function handleStartFactCheck(articleData, tabId) {
  const normalized = normalizeUrl(articleData.url);
  if (normalized && inFlightChecks.has(normalized)) {
    return await inFlightChecks.get(normalized);
  }

  const job = (async () => {
    const settings = await chrome.storage.local.get([
      'geminiApiKey',
      'modelPreference',
      'councilSize',
      'useGrounding',
      'reportsCache'
    ]);

    const apiKey = settings.geminiApiKey;
    if (!apiKey) {
      return { error: 'API_KEY_REQUIRED' };
    }

    const model = settings.modelPreference || DEFAULT_MODEL;
    const councilSize = settings.councilSize || 5;
    const useGrounding = !!settings.useGrounding;

    const engine = new CouncilDebateEngine(apiKey, {
      model,
      councilSize,
      useGrounding
    });

    // Progress relay to runtime (popup) and tab content script (pill)
    const onProgress = (prog) => {
      chrome.runtime.sendMessage({
        type: 'FACT_CHECK_PROGRESS',
        data: prog
      }).catch(() => {});

      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'FACT_CHECK_PROGRESS',
          data: prog
        }).catch(() => {});
      }
    };

    try {
      const report = await engine.runCouncilDebate(articleData, onProgress);

      // Save report in cache with bounded size (max 60 keys / ~30 reports)
      const reportsCache = settings.reportsCache || {};
      reportsCache[normalized] = report;
      reportsCache[report.id] = report;

      const cacheKeys = Object.keys(reportsCache);
      let finalCache = reportsCache;
      if (cacheKeys.length > 60) {
        finalCache = {};
        cacheKeys.slice(-60).forEach(k => {
          finalCache[k] = reportsCache[k];
        });
      }

      // Cache latest report id for quick popup access
      await chrome.storage.local.set({
        reportsCache: finalCache,
        latestReportId: report.id
      });

      // Update Extension Badge
      updateBadge(report.verdict.score, tabId);

      // Broadcast completion to popup and council chamber
      chrome.runtime.sendMessage({
        type: 'FACT_CHECK_COMPLETE',
        data: report
      }).catch(() => {});

      // Notify tab content script
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'FACT_CHECK_COMPLETE',
          data: report
        }).catch(() => {});
      }

      return { success: true, report };
    } catch (err) {
      console.error('Council debate error:', err);
      chrome.runtime.sendMessage({
        type: 'FACT_CHECK_ERROR',
        error: err.message
      }).catch(() => {});

      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'FACT_CHECK_ERROR',
          error: err.message
        }).catch(() => {});
      }
      return { error: err.message };
    }
  })();

  if (normalized) {
    inFlightChecks.set(normalized, job);
  }

  try {
    return await job;
  } finally {
    if (normalized) {
      inFlightChecks.delete(normalized);
    }
  }
}

/**
 * Checks a specific user-selected sentence or claim
 */
async function handleCustomClaimCheck(tabId, selectedClaim, pageUrl) {
  let domain = 'Direct Claim';
  if (pageUrl) {
    try {
      domain = new URL(pageUrl).hostname || 'Direct Claim';
    } catch {
      domain = 'Direct Claim';
    }
  }

  const articleData = {
    title: `Claim Check: "${selectedClaim.substring(0, 60)}..."`,
    head: selectedClaim,
    tail: selectedClaim,
    context: selectedClaim,
    domain: domain,
    url: pageUrl || 'about:blank',
    isForum: false
  };

  await handleStartFactCheck(articleData, tabId);
}

/**
 * Retrieves report by reportId or URL
 */
async function handleGetReport(reportId, url) {
  const data = await chrome.storage.local.get(['reportsCache', 'latestReportId']);
  const cache = data.reportsCache || {};

  if (reportId && cache[reportId]) {
    return { report: cache[reportId] };
  }
  if (url && cache[normalizeUrl(url)]) {
    return { report: cache[normalizeUrl(url)] };
  }
  if (data.latestReportId && cache[data.latestReportId]) {
    return { report: cache[data.latestReportId] };
  }

  return { report: null };
}

/**
 * Opens Council Chamber in a full tab
 */
async function handleOpenCouncilChamber(reportId) {
  const url = chrome.runtime.getURL(`src/council/council.html?reportId=${encodeURIComponent(reportId || '')}`);
  await chrome.tabs.create({ url });
  return { opened: true };
}

/**
 * Clears cached fact-checks
 */
async function handleClearCache() {
  await chrome.storage.local.set({ reportsCache: {}, latestReportId: null });
  return { success: true };
}

function updateBadge(score, tabId) {
  const text = `${Math.round(score)}`;
  let color = '#3b82f6';
  if (score >= 85) color = '#10b981';
  else if (score >= 70) color = '#2563eb';
  else if (score >= 45) color = '#f59e0b';
  else if (score >= 25) color = '#ea580c';
  else color = '#ef4444';

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    // Strip tracking parameters
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}
