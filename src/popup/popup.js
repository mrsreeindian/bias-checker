/**
 * popup.js
 * Logic for Fact-Checker extension popup
 */

document.addEventListener('DOMContentLoaded', async () => {
  let activeTab = null;
  let currentReport = null;

  // Query active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tabs[0];

  // UI View Elements
  const viewSetup = document.getElementById('view-setup');
  const viewReady = document.getElementById('view-ready');
  const viewAnalyzing = document.getElementById('view-analyzing');
  const viewReport = document.getElementById('view-report');

  // Input & Buttons
  const endpointInput = document.getElementById('ollama-endpoint-input');
  const keyInput = document.getElementById('ollama-key-input');
  const modelSelect = document.getElementById('ollama-model-select');
  const customModelInput = document.getElementById('ollama-custom-model');
  const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const keyStatusMsg = document.getElementById('key-status-msg');
  const settingsBtn = document.getElementById('settings-btn');
  const conveneBtn = document.getElementById('convene-council-btn');
  const recheckBtn = document.getElementById('recheck-btn');
  const viewChamberBtn = document.getElementById('view-chamber-btn');

  // Open settings
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Toggle model select custom input
  modelSelect?.addEventListener('change', () => {
    if (modelSelect.value === 'custom') {
      customModelInput.style.display = 'block';
    } else {
      customModelInput.style.display = 'none';
    }
  });

  // Toggle API key visibility
  toggleKeyVisibilityBtn?.addEventListener('click', () => {
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      toggleKeyVisibilityBtn.innerText = '🔒';
    } else {
      keyInput.type = 'password';
      toggleKeyVisibilityBtn.innerText = '👁️';
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Save Ollama Settings Click
  saveKeyBtn.addEventListener('click', async () => {
    const endpoint = (endpointInput?.value || '').trim() || 'http://localhost:11434';
    const key = (keyInput?.value || '').trim();
    const model = modelSelect?.value === 'custom'
      ? (customModelInput?.value.trim() || 'llama3.2')
      : (modelSelect?.value || 'llama3.2');

    saveKeyBtn.disabled = true;
    saveKeyBtn.innerText = 'Connecting to Ollama...';
    showKeyStatus('Testing connection & checking models...', null);

    chrome.runtime.sendMessage({
      type: 'SAVE_AND_VERIFY_OLLAMA_CONFIG',
      endpoint,
      apiKey: key,
      model
    }, (res) => {
      saveKeyBtn.disabled = false;
      saveKeyBtn.innerText = 'Test & Connect Ollama';

      if (res && res.valid) {
        showKeyStatus(res.note ? `✅ ${res.note}` : '✅ Connected & saved successfully!', true);
        setTimeout(() => {
          checkPageStatus();
        }, 600);
      } else {
        showKeyStatus(`❌ ${res?.error || 'Connection failed'}`, false);
      }
    });
  });

  // Convene Council Click
  conveneBtn.addEventListener('click', () => {
    triggerFactCheck();
  });

  // Re-check Article Click
  recheckBtn.addEventListener('click', () => {
    triggerFactCheck();
  });

  // View Council Chamber
  viewChamberBtn.addEventListener('click', () => {
    if (currentReport) {
      chrome.runtime.sendMessage({
        type: 'OPEN_COUNCIL_CHAMBER',
        reportId: currentReport.id
      });
    }
  });

  // Message listener for progress updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FACT_CHECK_PROGRESS') {
      updateAnalyzingProgress(message.data);
    } else if (message.type === 'FACT_CHECK_COMPLETE') {
      currentReport = message.data;
      showView(viewReport);
      renderReport(currentReport);
    } else if (message.type === 'FACT_CHECK_ERROR') {
      const stageDesc = document.getElementById('progress-stage-desc');
      if (stageDesc) {
        stageDesc.innerText = `Error: ${message.error || 'Deliberation failed'}`;
        stageDesc.style.color = '#ef4444';
      }
      setTimeout(() => {
        showView(viewReady);
      }, 2500);
    }
  });

  // Initial check
  checkPageStatus();

  /**
   * Checks Ollama settings and page analysis status
   */
  async function checkPageStatus() {
    const data = await chrome.storage.local.get(['ollamaEndpoint', 'ollamaApiKey', 'modelPreference', 'isConfigured']);
    
    if (endpointInput && data.ollamaEndpoint) {
      endpointInput.value = data.ollamaEndpoint;
    }
    if (keyInput && data.ollamaApiKey) {
      keyInput.value = data.ollamaApiKey;
    }
    if (modelSelect && data.modelPreference) {
      if (['llama3.2', 'llama3.1', 'deepseek-r1', 'mistral', 'qwen2.5'].includes(data.modelPreference)) {
        modelSelect.value = data.modelPreference;
        if (customModelInput) customModelInput.style.display = 'none';
      } else {
        modelSelect.value = 'custom';
        if (customModelInput) {
          customModelInput.style.display = 'block';
          customModelInput.value = data.modelPreference;
        }
      }
    }

    if (!data.isConfigured && !data.ollamaEndpoint) {
      showView(viewSetup);
      return;
    }

    const pageUrl = activeTab?.url || '';
    chrome.runtime.sendMessage({
      type: 'GET_PAGE_STATUS',
      url: pageUrl
    }, (res) => {
      if (!res.hasApiKey && !res.isConfigured) {
        showView(viewSetup);
      } else if (res.isAnalyzing) {
        showView(viewAnalyzing);
        updateAnalyzingProgress({
          stepName: 'Council Deliberating...',
          message: 'Agents are actively analyzing article...'
        });
      } else if (res.cachedReport) {
        currentReport = res.cachedReport;
        showView(viewReport);
        renderReport(currentReport);
      } else {
        showView(viewReady);
        renderReadyPage();
      }
    });
  }

  function showView(targetView) {
    [viewSetup, viewReady, viewAnalyzing, viewReport].forEach(v => {
      v.style.display = (v === targetView) ? 'block' : 'none';
    });
  }

  function showKeyStatus(msg, isSuccess) {
    keyStatusMsg.innerText = msg;
    keyStatusMsg.style.display = 'block';
    if (isSuccess === true) {
      keyStatusMsg.style.color = '#10b981';
    } else if (isSuccess === false) {
      keyStatusMsg.style.color = '#ef4444';
    } else {
      keyStatusMsg.style.color = '#94a3b8';
    }
  }

  async function renderReadyPage() {
    const domainEl = document.getElementById('ready-domain');
    const titleEl = document.getElementById('ready-title');
    const forumWarning = document.getElementById('ready-forum-warning');
    const forumText = document.getElementById('ready-forum-text');

    const settings = await chrome.storage.local.get(['councilSize']);
    const councilSize = settings.councilSize || 5;
    const btn = document.getElementById('convene-council-btn');
    if (btn) {
      btn.innerText = `🏛️ Convene AI Council (${councilSize} Agents)`;
    }

    const url = activeTab?.url || '';
    try {
      domainEl.innerText = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      domainEl.innerText = 'Current Webpage';
    }

    titleEl.innerText = activeTab?.title || 'Article Content';

    // Forum detection check
    const isReddit = url.includes('reddit.com');
    const isTwitter = url.includes('twitter.com') || url.includes('x.com');
    const isHackerNews = url.includes('news.ycombinator.com');

    if (isReddit || isTwitter || isHackerNews) {
      forumWarning.style.display = 'flex';
      if (isReddit) {
        forumText.innerText = 'This is a Reddit forum thread. Content represents unverified user submissions and claims.';
      } else if (isTwitter) {
        forumText.innerText = 'This is an X/Twitter post. Social media posts are personal assertions without editorial review.';
      } else {
        forumText.innerText = 'This is an online community discussion. Claims are unverified user opinions.';
      }
    } else {
      forumWarning.style.display = 'none';
    }
  }

  async function triggerFactCheck() {
    showView(viewAnalyzing);
    resetStepper();

    const targetTabId = activeTab?.id;
    const tabUrl = activeTab?.url || '';
    let tabDomain = 'Current Page';
    if (tabUrl) {
      try {
        tabDomain = new URL(tabUrl).hostname.replace(/^www\./, '');
      } catch {}
    }

    try {
      if (!targetTabId) {
        throw new Error('No active tab identified');
      }

      // Execute extraction in active tab
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => {
          const article = window.ArticleExtractor ? window.ArticleExtractor.extract() : {
            title: document.title,
            url: window.location.href,
            domain: window.location.hostname
          };
          const forum = window.ForumDetector ? window.ForumDetector.detect() : { isForum: false };
          article.isForum = forum.isForum;
          article.forumDetails = forum;
          return article;
        }
      });

      const articleData = results?.[0]?.result || {
        title: activeTab?.title || 'Web Article',
        url: tabUrl,
        domain: tabDomain
      };

      chrome.runtime.sendMessage({
        type: 'START_FACT_CHECK',
        articleData: articleData,
        tabId: targetTabId
      }, (res) => {
        if (res && res.error) {
          if (res.error === 'API_KEY_REQUIRED' || res.error === 'OLLAMA_CONFIG_REQUIRED') {
            showView(viewSetup);
          } else {
            const desc = document.getElementById('progress-stage-desc');
            if (desc) {
              desc.innerText = `Notice: ${res.error}`;
              desc.style.color = '#ef4444';
            }
            setTimeout(() => showView(viewReady), 2500);
          }
        } else if (res && res.success && res.report) {
          currentReport = res.report;
          showView(viewReport);
          renderReport(currentReport);
        }
      });
    } catch (err) {
      console.warn('Script injection fallback:', err);
      const fallbackData = {
        title: activeTab?.title || 'Web Article',
        head: activeTab?.title || 'No lead paragraph available',
        tail: activeTab?.title || 'No concluding paragraph available',
        url: tabUrl,
        domain: tabDomain,
        context: activeTab?.title || 'Page Content',
        isForum: false
      };
      chrome.runtime.sendMessage({
        type: 'START_FACT_CHECK',
        articleData: fallbackData,
        tabId: targetTabId
      }, (res) => {
        if (res && res.error) {
          if (res.error === 'API_KEY_REQUIRED' || res.error === 'OLLAMA_CONFIG_REQUIRED') {
            showView(viewSetup);
          } else {
            const desc = document.getElementById('progress-stage-desc');
            if (desc) {
              desc.innerText = `Notice: ${res.error}`;
              desc.style.color = '#ef4444';
            }
            setTimeout(() => showView(viewReady), 2500);
          }
        } else if (res && res.success && res.report) {
          currentReport = res.report;
          showView(viewReport);
          renderReport(currentReport);
        }
      });
    }
  }

  function resetStepper() {
    ['step-1', 'step-2', 'step-3'].forEach((id, idx) => {
      const el = document.getElementById(id);
      if (idx === 0) el.classList.add('active');
      else el.classList.remove('active');
    });
    document.getElementById('progress-stage-title').innerText = 'Convening AI Council...';
    document.getElementById('progress-stage-desc').innerText = 'Deploying 5 specialized Ollama AI agents in parallel...';
  }

  function updateAnalyzingProgress(data) {
    const stageTitle = document.getElementById('progress-stage-title');
    const stageDesc = document.getElementById('progress-stage-desc');

    if (stageTitle) stageTitle.innerText = data.stepName || `Stage ${data.stage} / 3`;
    if (stageDesc) stageDesc.innerText = data.message || '';

    if (data.stage >= 1) document.getElementById('step-1')?.classList.add('active');
    if (data.stage >= 2) document.getElementById('step-2')?.classList.add('active');
    if (data.stage >= 3) document.getElementById('step-3')?.classList.add('active');
  }

  function renderReport(report) {
    const verdict = report.verdict;
    const tier = verdict.tier;
    const forumWarning = document.getElementById('report-forum-warning');
    const forumText = document.getElementById('report-forum-text');

    // Forum Warning
    if (report.forumWarning) {
      forumWarning.style.display = 'flex';
      forumText.innerText = report.forumWarning;
    } else {
      forumWarning.style.display = 'none';
    }

    // Gauge Score
    const scoreNum = document.getElementById('report-score-num');
    const gaugeFill = document.getElementById('gauge-fill');
    scoreNum.innerText = verdict.score;

    // Stroke Dash calculation: circumference = 2 * PI * 42 ≈ 263.89
    const circumference = 264;
    const offset = circumference - (circumference * (verdict.score / 100));
    gaugeFill.style.strokeDashoffset = offset;
    gaugeFill.style.stroke = tier.color || '#3b82f6';

    // Verdict Badge & Summary
    const badge = document.getElementById('report-verdict-badge');
    badge.innerText = `${tier.icon || '🏛️'} ${tier.label}`;
    badge.style.background = tier.color || '#3b82f6';
    badge.style.color = '#ffffff';

    const summary = document.getElementById('report-executive-summary');
    summary.innerText = verdict.executiveSummary || 'Consensus reached by 5-agent AI Council.';

    // Political Spectrum
    const spectrum = report.biasSpectrum;
    const ratios = report.biasRatios || { left: 20, center: 60, right: 20 };

    document.getElementById('spectrum-dominant').innerText = spectrum.dominantLean || 'Balanced';
    document.getElementById('bar-left').style.width = `${ratios.left}%`;
    document.getElementById('bar-center').style.width = `${ratios.center}%`;
    document.getElementById('bar-right').style.width = `${ratios.right}%`;

    document.getElementById('pct-left').innerText = `${ratios.left}%`;
    document.getElementById('pct-center').innerText = `${ratios.center}%`;
    document.getElementById('pct-right').innerText = `${ratios.right}%`;

    // Claims List
    const claimsList = document.getElementById('claims-list');
    claimsList.innerHTML = '';

    const verified = report.claims.verified || [];
    const disputed = report.claims.disputed || [];
    const falseClaims = report.claims.falseOrMisleading || [];

    if (verified.length === 0 && disputed.length === 0 && falseClaims.length === 0) {
      claimsList.innerHTML = '<div class="claim-item">No specific discrete claims evaluated.</div>';
    } else {
      verified.slice(0, 2).forEach(c => {
        claimsList.innerHTML += `<div class="claim-item claim-item-verified"><span>✓</span><span>${escapeHtml(c)}</span></div>`;
      });
      disputed.slice(0, 2).forEach(c => {
        claimsList.innerHTML += `<div class="claim-item claim-item-disputed"><span>⚠️</span><span>${escapeHtml(c)}</span></div>`;
      });
      falseClaims.slice(0, 1).forEach(c => {
        claimsList.innerHTML += `<div class="claim-item claim-item-false"><span>❌</span><span>${escapeHtml(c)}</span></div>`;
      });
    }
  }
});
