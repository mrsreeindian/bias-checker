/**
 * council.js
 * Logic for the deep-dive Council Chamber UI
 */

document.addEventListener('DOMContentLoaded', async () => {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('reportId');

  // Load report from background
  chrome.runtime.sendMessage({
    type: 'GET_REPORT',
    reportId: reportId
  }, (res) => {
    if (res && res.report) {
      renderChamber(res.report);
    } else {
      renderEmptyState();
    }
  });

  // Listen for live completion updates while Council Chamber tab is open
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FACT_CHECK_COMPLETE' && message.data) {
      renderChamber(message.data);
    }
  });

  setupTabs();
  setupActionButtons();

  function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(targetTab)?.classList.add('active');
      });
    });
  }

  function setupActionButtons() {
    document.getElementById('close-chamber-btn')?.addEventListener('click', () => {
      window.close();
    });

    document.getElementById('copy-report-btn')?.addEventListener('click', () => {
      if (!window.__currentReport) return;
      const report = window.__currentReport;
      const md = `
# 🏛️ Fact-Checker AI Council Report
**Article:** ${report.article.title}
**Domain:** ${report.article.domain}
**Consensus Credibility Score:** ${report.verdict.score}/100 (${report.verdict.label})
**Analyzed by:** Ollama AI Council (5 Agents)

## Executive Summary
${report.verdict.executiveSummary}

## Political Framing Spectrum
- **Dominant Stance:** ${report.biasSpectrum.dominantLean}
- **Left Framing:** ${report.biasSpectrum.leftFraming}
- **Center Grounding:** ${report.biasSpectrum.centerGrounding}
- **Right Framing:** ${report.biasSpectrum.rightFraming}
- **Balanced Synthesis:** ${report.biasSpectrum.neutralSummary}

## Core Claims
- **Verified Facts:**
${(report.claims.verified || []).map(c => `  - ✓ ${c}`).join('\n')}
- **Disputed Assertions:**
${(report.claims.disputed || []).map(c => `  - ⚠️ ${c}`).join('\n')}
- **Misinformation/False:**
${(report.claims.falseOrMisleading || []).map(c => `  - ❌ ${c}`).join('\n')}

${report.forumWarning ? `\n> **Forum Alert:** ${report.forumWarning}\n` : ''}
Report Generated: ${new Date(report.timestamp).toLocaleString()}
`.trim();

      navigator.clipboard.writeText(md).then(() => {
        const btn = document.getElementById('copy-report-btn');
        btn.innerText = '✅ Copied to Clipboard!';
        setTimeout(() => { btn.innerText = '📋 Copy Report'; }, 2000);
      });
    });
  }

  function renderChamber(report) {
    window.__currentReport = report;

    // Banner
    document.getElementById('banner-domain').innerText = report.article.domain || 'WEB ARTICLE';
    document.getElementById('banner-title').innerText = report.article.title || 'Untitled Article';
    document.getElementById('banner-model').innerText = `Model: ${report.modelUsed || 'Llama 3.2 (Ollama)'}`;
    document.getElementById('banner-elapsed').innerText = `Duration: ${report.elapsedSeconds || '1.8'}s`;
    document.getElementById('banner-time').innerText = new Date(report.timestamp).toLocaleTimeString();

    // Forum Warning Alert
    const forumAlert = document.getElementById('chamber-forum-alert');
    if (report.forumWarning) {
      forumAlert.style.display = 'flex';
      document.getElementById('chamber-forum-msg').innerText = report.forumWarning;
    } else {
      forumAlert.style.display = 'none';
    }

    // Podiums
    renderPodiums(report);

    // Tab 1: Debate Timeline
    renderDebateTimeline(report);

    // Tab 2: Neutrality Matrix
    renderNeutrality(report);

    // Tab 3: Fact-Check Claims
    renderClaims(report);

    // Tab 4: Extracted Evidence
    renderEvidence(report);
  }

  function renderPodiums(report) {
    const grid = document.getElementById('podiums-grid');
    grid.innerHTML = '';

    const round1Findings = report.debateTimeline?.[0]?.findings || [];

    round1Findings.forEach(agent => {
      const card = document.createElement('div');
      card.className = 'podium-card';
      card.innerHTML = `
        <div class="podium-top-bar" style="background: ${escapeHtml(agent.color || '#3b82f6')};"></div>
        <div class="podium-avatar">${escapeHtml(agent.avatar || '🤖')}</div>
        <div class="podium-name">${escapeHtml(agent.agentName)}</div>
        <div class="podium-role">${escapeHtml(agent.agentRole)}</div>
        <div class="podium-score" style="color: ${escapeHtml(agent.color || '#3b82f6')};">
          ${Math.round(agent.score)} <span style="font-size: 11px; color: #94a3b8;">/ 100</span>
        </div>
      `;
      grid.appendChild(card);
    });

    // Also include Chairman podium
    const chairCard = document.createElement('div');
    chairCard.className = 'podium-card';
    chairCard.innerHTML = `
      <div class="podium-top-bar" style="background: #10b981;"></div>
      <div class="podium-avatar">🏛️</div>
      <div class="podium-name">Chairman Aristotle</div>
      <div class="podium-role">Council Chairman & Synthesizer</div>
      <div class="podium-score" style="color: #10b981;">
        ${Math.round(report.verdict.score)} <span style="font-size: 11px; color: #94a3b8;">Consensus</span>
      </div>
    `;
    grid.appendChild(chairCard);
  }

  function renderDebateTimeline(report) {
    const timeline = document.getElementById('debate-timeline');
    timeline.innerHTML = '';

    const stages = report.debateTimeline || [];

    // Stage 1
    const s1 = stages[0];
    if (s1 && s1.findings) {
      let findingsHtml = '';
      s1.findings.forEach(f => {
        findingsHtml += `
          <div style="margin-bottom: 14px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div style="font-weight: 700; color: ${escapeHtml(f.color || '#38bdf8')}; font-size: 13px;">
              ${escapeHtml(f.avatar || '•')} ${escapeHtml(f.agentName)} (${Math.round(f.score)}/100):
            </div>
            <p style="margin: 4px 0; font-size: 13px;">${escapeHtml(f.specificPerspective)}</p>
            <div style="font-size: 12px; color: #94a3b8;"><strong>Concerns:</strong> ${escapeHtml((f.concerns || []).join('; '))}</div>
          </div>
        `;
      });

      timeline.innerHTML += `
        <div class="timeline-stage">
          <div class="stage-header">
            <span class="stage-number">1</span>
            <h3 class="stage-title">Round 1: Parallel Independent Examination</h3>
          </div>
          ${findingsHtml}
        </div>
      `;
    }

    // Stage 2
    const s2 = stages[1];
    if (s2 && s2.exchanges) {
      let exchangesHtml = '';
      s2.exchanges.forEach(ex => {
        exchangesHtml += `
          <div class="debate-exchange-item">
            <div class="exchange-speakers">${escapeHtml(ex.speaker)} ➔ ${escapeHtml(ex.target)}</div>
            <div class="exchange-argument">"${escapeHtml(ex.argument)}"</div>
            <div class="exchange-rebuttal"><strong>Rebuttal:</strong> "${escapeHtml(ex.rebuttal)}"</div>
          </div>
        `;
      });

      timeline.innerHTML += `
        <div class="timeline-stage">
          <div class="stage-header">
            <span class="stage-number">2</span>
            <h3 class="stage-title">Round 2: Council Cross-Examination & Critique</h3>
          </div>
          ${exchangesHtml}
        </div>
      `;
    }

    // Stage 3
    const s3 = stages[2];
    if (s3) {
      timeline.innerHTML += `
        <div class="timeline-stage">
          <div class="stage-header">
            <span class="stage-number">3</span>
            <h3 class="stage-title">Round 3: Chairman Synthesis & Verdict</h3>
          </div>
          <p style="font-size: 14px; line-height: 1.6;">
            <strong>Consensus Credibility:</strong> ${Math.round(report.verdict.score)}/100 (${escapeHtml(report.verdict.label)})<br>
            <strong>Chairman Notes:</strong> ${escapeHtml(s3.chairmanReview || report.verdict.executiveSummary)}
          </p>
        </div>
      `;
    }
  }

  function renderNeutrality(report) {
    const spec = report.biasSpectrum || {};
    document.getElementById('neutrality-left').innerText = spec.leftFraming || 'No distinct left framing detected.';
    document.getElementById('neutrality-center').innerText = spec.centerGrounding || 'Neutral core events.';
    document.getElementById('neutrality-right').innerText = spec.rightFraming || 'No distinct right framing detected.';
    document.getElementById('neutrality-summary').innerText = spec.neutralSummary || 'Balanced overview.';
  }

  function renderClaims(report) {
    const verifiedCol = document.getElementById('col-verified');
    const disputedCol = document.getElementById('col-disputed');
    const falseCol = document.getElementById('col-false');

    verifiedCol.innerHTML = (report.claims.verified || []).map(c => 
      `<div class="claim-box">${escapeHtml(c)}</div>`
    ).join('') || '<div class="claim-box">None highlighted</div>';

    disputedCol.innerHTML = (report.claims.disputed || []).map(c => 
      `<div class="claim-box">${escapeHtml(c)}</div>`
    ).join('') || '<div class="claim-box">None highlighted</div>';

    falseCol.innerHTML = (report.claims.falseOrMisleading || []).map(c => 
      `<div class="claim-box">${escapeHtml(c)}</div>`
    ).join('') || '<div class="claim-box">None detected</div>';
  }

  function renderEvidence(report) {
    document.getElementById('evidence-head').innerText = report.article.head || 'No lead paragraph available.';
    document.getElementById('evidence-tail').innerText = report.article.tail || 'No concluding paragraph available.';
    document.getElementById('evidence-context').innerText = report.article.context || 'No body excerpt available.';
  }

  function renderEmptyState() {
    const container = document.querySelector('.chamber-container');
    if (!container) return;
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <span style="font-size: 48px;">🏛️</span>
        <h2>No Active Council Report Found</h2>
        <p style="color: #94a3b8;">Run a fact-check from the extension popup or in-page pill to convene the AI Council.</p>
        <button id="empty-close-btn" class="btn btn-secondary">Close Window</button>
      </div>
    `;
    document.getElementById('empty-close-btn')?.addEventListener('click', () => {
      window.close();
    });
  }
});
