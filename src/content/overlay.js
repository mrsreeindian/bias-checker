/**
 * overlay.js
 * In-page floating pill, drawer, and interactive fact-check trigger
 */

(function() {
  // Prevent duplicate injections
  if (window.FactCheckerOverlayInjected) return;
  window.FactCheckerOverlayInjected = true;

  class FactCheckerOverlay {
    constructor() {
      this.currentReport = null;
      this.isAnalyzing = false;
      this.hasApiKey = false;
      this.isDrawerOpen = false;

      this.init();
    }

    async init() {
      // 1. Run forum detection and inject banner if on Reddit/forum
      if (window.ForumDetector) {
        const forumInfo = window.ForumDetector.detect();
        if (forumInfo && forumInfo.isForum) {
          window.ForumDetector.injectWarningBannerIfNeeded(forumInfo);
        }
      }

      // 2. Inject floating widget UI
      this.injectRootElement();

      // 3. Query background script for cached report & API key status
      this.queryInitialStatus();

      // 4. Setup runtime message listener
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'FACT_CHECK_PROGRESS') {
          this.handleProgress(message.data);
        } else if (message.type === 'FACT_CHECK_COMPLETE') {
          this.handleComplete(message.data);
        } else if (message.type === 'FACT_CHECK_ERROR') {
          this.handleError(message.error);
        }
      });
    }

    injectRootElement() {
      if (document.getElementById('factchecker-root')) return;

      const root = document.createElement('div');
      root.id = 'factchecker-root';
      root.innerHTML = `
        <div id="fc-floating-pill" class="fc-floating-pill" title="Fact-Checker AI Council">
          <span class="fc-pill-logo">🏛️</span>
          <span id="fc-pill-text" class="fc-pill-text">Fact-Check</span>
        </div>
        <div id="fc-drawer" class="fc-drawer" style="display: none;"></div>
      `;

      document.body.appendChild(root);

      document.getElementById('fc-floating-pill')?.addEventListener('click', () => {
        this.onPillClick();
      });
    }

    async queryInitialStatus() {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_PAGE_STATUS',
          url: window.location.href
        });

        if (response) {
          this.hasApiKey = !!response.hasApiKey;
          if (response.cachedReport) {
            this.currentReport = response.cachedReport;
            this.renderCompletedState(this.currentReport);
          } else if (!this.hasApiKey) {
            this.renderMissingKeyPill();
          }
        }
      } catch (err) {
        console.warn('Fact-Checker status check:', err);
      }
    }

    onPillClick() {
      if (this.isAnalyzing) return;

      if (!this.hasApiKey) {
        this.showApiKeyModal();
        return;
      }

      if (this.currentReport) {
        this.toggleDrawer();
      } else {
        this.triggerFactCheck();
      }
    }

    triggerFactCheck() {
      if (!this.hasApiKey) {
        this.showApiKeyModal();
        return;
      }

      this.isAnalyzing = true;
      this.renderAnalyzingState('Extracting article...');

      const articleData = window.ArticleExtractor ? window.ArticleExtractor.extract() : {
        title: document.title,
        url: window.location.href,
        domain: window.location.hostname
      };

      const forumInfo = window.ForumDetector ? window.ForumDetector.detect() : { isForum: false };
      articleData.isForum = forumInfo.isForum;
      articleData.forumDetails = forumInfo;

      chrome.runtime.sendMessage({
        type: 'START_FACT_CHECK',
        articleData: articleData
      }, (response) => {
        if (response && response.error) {
          if (response.error === 'API_KEY_REQUIRED') {
            this.hasApiKey = false;
            this.showApiKeyModal();
          } else {
            this.handleError(response.error);
          }
        }
      });
    }

    handleProgress(data) {
      if (!this.isAnalyzing) this.isAnalyzing = true;
      this.renderAnalyzingState(data.stepName || data.message || 'Council Debating...');
    }

    handleComplete(report) {
      this.isAnalyzing = false;
      this.currentReport = report;
      this.renderCompletedState(report);
      this.renderDrawerContent(report);
    }

    handleError(errMsg) {
      this.isAnalyzing = false;
      const pillText = document.getElementById('fc-pill-text');
      if (pillText) {
        pillText.innerText = 'Analysis Error';
      }
      console.error('Fact-Checker Error:', errMsg);
    }

    renderAnalyzingState(msg) {
      const pill = document.getElementById('fc-floating-pill');
      if (!pill) return;
      pill.innerHTML = `
        <div class="fc-spinner"></div>
        <span class="fc-pill-text">${msg}</span>
      `;
    }

    renderMissingKeyPill() {
      const pill = document.getElementById('fc-floating-pill');
      if (!pill) return;
      pill.innerHTML = `
        <span class="fc-pill-logo">🔑</span>
        <span class="fc-pill-text">Setup Gemini Key</span>
      `;
    }

    renderCompletedState(report) {
      const pill = document.getElementById('fc-floating-pill');
      if (!pill) return;

      const score = report.verdict.score;
      const tier = report.verdict.tier;
      const badgeClass = `badge-${tier.badgeClass}`;

      pill.innerHTML = `
        <span class="fc-pill-logo">${tier.icon || '🏛️'}</span>
        <span class="fc-pill-text">${score}%</span>
        <span class="fc-pill-badge ${badgeClass}">${tier.label}</span>
      `;

      this.renderDrawerContent(report);
    }

    toggleDrawer() {
      const drawer = document.getElementById('fc-drawer');
      if (!drawer) return;

      this.isDrawerOpen = !this.isDrawerOpen;
      drawer.style.display = this.isDrawerOpen ? 'flex' : 'none';
    }

    renderDrawerContent(report) {
      const drawer = document.getElementById('fc-drawer');
      if (!drawer) return;

      const verdict = report.verdict;
      const spectrum = report.biasSpectrum;
      const ratios = report.biasRatios || { left: 20, center: 60, right: 20 };

      const verifiedHtml = (report.claims.verified || []).slice(0, 2).map(c => 
        `<div class="fc-claim-item fc-claim-verified">✓ ${c}</div>`
      ).join('') || '<div class="fc-claim-item">No major verified claims highlighted</div>';

      const warningHtml = report.forumWarning ? `
        <div style="background: rgba(234, 88, 12, 0.2); border-left: 3px solid #ea580c; padding: 8px; border-radius: 4px; font-size: 11px; color: #fdba74;">
          ${report.forumWarning}
        </div>
      ` : '';

      drawer.innerHTML = `
        <div class="fc-drawer-header">
          <div class="fc-drawer-title">
            <span>🏛️</span>
            <span>Gemini AI Council Verdict</span>
          </div>
          <button id="fc-drawer-close-btn" class="fc-drawer-close">&times;</button>
        </div>

        <div class="fc-drawer-body">
          ${warningHtml}

          <div class="fc-score-row">
            <div class="fc-score-circle" style="border-color: ${verdict.tier.color || '#3b82f6'};">
              <span class="fc-score-num" style="color: ${verdict.tier.color || '#3b82f6'};">${verdict.score}</span>
              <span class="fc-score-max">/ 100</span>
            </div>
            <div class="fc-verdict-info">
              <h4 style="color: ${verdict.tier.color || '#3b82f6'};">${verdict.label}</h4>
              <p>${verdict.executiveSummary || 'Council evaluated article credibility across 5 Gemini 3.8 Flash agents.'}</p>
            </div>
          </div>

          <div class="fc-spectrum-box">
            <div class="fc-spectrum-title">
              <span>Political Framing Spectrum</span>
              <span style="color: #38bdf8;">${spectrum.dominantLean || 'Neutral'}</span>
            </div>
            <div class="fc-spectrum-bar">
              <div class="fc-bar-left" style="width: ${ratios.left}%;" title="Left Framing: ${ratios.left}%"></div>
              <div class="fc-bar-center" style="width: ${ratios.center}%;" title="Center Grounding: ${ratios.center}%"></div>
              <div class="fc-bar-right" style="width: ${ratios.right}%;" title="Right Framing: ${ratios.right}%"></div>
            </div>
            <div class="fc-spectrum-labels">
              <span>Left (${ratios.left}%)</span>
              <span>Center (${ratios.center}%)</span>
              <span>Right (${ratios.right}%)</span>
            </div>
          </div>

          <div class="fc-claims-section">
            <h5>Core Fact Check</h5>
            ${verifiedHtml}
          </div>

          <button id="fc-open-chamber-btn" class="fc-action-btn">
            Enter Council Chamber & View Debate ↗
          </button>
        </div>
      `;

      document.getElementById('fc-drawer-close-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDrawer();
      });

      document.getElementById('fc-open-chamber-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: 'OPEN_COUNCIL_CHAMBER',
          reportId: report.id
        });
      });
    }

    showApiKeyModal() {
      if (document.getElementById('fc-api-key-modal')) return;

      const modal = document.createElement('div');
      modal.id = 'fc-api-key-modal';
      modal.className = 'fc-modal-overlay';
      modal.innerHTML = `
        <div class="fc-modal-card">
          <h3><span>🔑</span> Enter Google Gemini API Key</h3>
          <p>
            The Fact-Checker Council requires a Google Gemini API key to evaluate articles with Gemini 3.8 Flash.
            You can generate a free key in 30 seconds at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a>.
          </p>
          <div class="fc-input-group">
            <input type="password" id="fc-modal-key-input" placeholder="AIzaSy..." autocomplete="off" />
            <div id="fc-modal-key-status" style="font-size: 11px; margin-top: 4px; display: none;"></div>
          </div>
          <div class="fc-modal-actions">
            <button id="fc-modal-cancel-btn" class="fc-btn-secondary">Cancel</button>
            <button id="fc-modal-save-btn" class="fc-btn-primary">Test & Save Key</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const input = document.getElementById('fc-modal-key-input');
      const status = document.getElementById('fc-modal-key-status');
      const saveBtn = document.getElementById('fc-modal-save-btn');
      const cancelBtn = document.getElementById('fc-modal-cancel-btn');

      cancelBtn?.addEventListener('click', () => modal.remove());

      saveBtn?.addEventListener('click', async () => {
        const key = input.value.trim();
        if (!key) {
          status.innerText = 'Please enter a valid key';
          status.style.color = '#ef4444';
          status.style.display = 'block';
          return;
        }

        saveBtn.innerText = 'Verifying key...';
        saveBtn.disabled = true;

        chrome.runtime.sendMessage({
          type: 'SAVE_AND_VERIFY_API_KEY',
          apiKey: key
        }, (res) => {
          saveBtn.disabled = false;
          saveBtn.innerText = 'Test & Save Key';

          if (res && res.valid) {
            this.hasApiKey = true;
            modal.remove();
            this.triggerFactCheck();
          } else {
            status.innerText = `Invalid key: ${res?.error || 'Verification failed'}`;
            status.style.color = '#ef4444';
            status.style.display = 'block';
          }
        });
      });
    }
  }

  window.FactCheckerOverlay = new FactCheckerOverlay();
})();
