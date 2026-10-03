/**
 * options.js
 * Settings manager for Fact-Checker AI Council
 */

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key-input');
  const toggleKeyBtn = document.getElementById('toggle-key-btn');
  const testKeyBtn = document.getElementById('test-key-btn');
  const apiKeyStatus = document.getElementById('api-key-status');

  const modelSelect = document.getElementById('model-select');
  const customModelGroup = document.getElementById('custom-model-group');
  const customModelInput = document.getElementById('custom-model-input');

  const groundingToggle = document.getElementById('toggle-grounding');
  const forumWarningToggle = document.getElementById('toggle-forum-warning');

  const cacheCountLabel = document.getElementById('cache-count-label');
  const clearCacheBtn = document.getElementById('clear-cache-btn');

  const saveAllBtn = document.getElementById('save-all-btn');
  const saveSuccessMsg = document.getElementById('save-success-msg');

  // Load existing settings
  const settings = await chrome.storage.local.get([
    'geminiApiKey',
    'modelPreference',
    'customModel',
    'councilSize',
    'useGrounding',
    'showForumWarning',
    'reportsCache'
  ]);

  if (settings.geminiApiKey) {
    apiKeyInput.value = settings.geminiApiKey;
    showKeyStatus('✅ Gemini API key is configured', true);
  }

  // Model preference
  const currentModel = settings.modelPreference || 'gemini-3.8-flash';
  if (['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].includes(currentModel)) {
    modelSelect.value = currentModel;
    customModelGroup.style.display = 'none';
  } else {
    modelSelect.value = 'custom';
    customModelGroup.style.display = 'block';
    customModelInput.value = currentModel;
  }

  // Council Size Radio
  const currentSize = settings.councilSize || 5;
  const radio = document.querySelector(`input[name="council-size"][value="${currentSize}"]`);
  if (radio) radio.checked = true;

  // Grounding & Warnings
  groundingToggle.checked = !!settings.useGrounding;
  forumWarningToggle.checked = settings.showForumWarning !== false;

  // Cache count
  updateCacheCount(settings.reportsCache);

  // Toggle API key visibility
  toggleKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyBtn.innerText = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleKeyBtn.innerText = 'Show';
    }
  });

  // Model Select Change
  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === 'custom') {
      customModelGroup.style.display = 'block';
    } else {
      customModelGroup.style.display = 'none';
    }
  });

  // Test & Save API Key
  testKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showKeyStatus('Please enter an API key', false);
      return;
    }

    testKeyBtn.disabled = true;
    testKeyBtn.innerText = 'Testing...';
    showKeyStatus('Testing key with Gemini 3.8 Flash...', null);

    chrome.runtime.sendMessage({
      type: 'SAVE_AND_VERIFY_API_KEY',
      apiKey: key
    }, (res) => {
      testKeyBtn.disabled = false;
      testKeyBtn.innerText = 'Test & Save';

      if (res && res.valid) {
        if (res.workingModel) {
          if (['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].includes(res.workingModel)) {
            modelSelect.value = res.workingModel;
            customModelGroup.style.display = 'none';
          } else {
            modelSelect.value = 'custom';
            customModelGroup.style.display = 'block';
            customModelInput.value = res.workingModel;
          }
        }
        showKeyStatus(res.note ? `✅ ${res.note}` : '✅ Key verified & saved successfully!', true);
      } else {
        showKeyStatus(`❌ Verification failed: ${res?.error || 'Unknown error'}`, false);
      }
    });
  });

  // Clear Cache
  clearCacheBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
      updateCacheCount({});
      clearCacheBtn.innerText = 'Cache Cleared!';
      setTimeout(() => { clearCacheBtn.innerText = 'Clear Cache'; }, 1500);
    });
  });

  // Save All Settings
  saveAllBtn.addEventListener('click', async () => {
    const selectedModel = modelSelect.value === 'custom'
      ? (customModelInput.value.trim() || 'gemini-3.8-flash')
      : modelSelect.value;

    const councilSizeRadio = document.querySelector('input[name="council-size"]:checked');
    const councilSize = councilSizeRadio ? parseInt(councilSizeRadio.value, 10) : 5;

    const payload = {
      modelPreference: selectedModel,
      councilSize: councilSize,
      useGrounding: groundingToggle.checked,
      showForumWarning: forumWarningToggle.checked
    };

    const key = apiKeyInput.value.trim();
    if (key) {
      payload.geminiApiKey = key;
    }

    await chrome.storage.local.set(payload);

    saveSuccessMsg.innerText = '✅ Settings saved successfully!';
    setTimeout(() => {
      saveSuccessMsg.innerText = '';
    }, 2500);
  });

  function showKeyStatus(msg, isSuccess) {
    apiKeyStatus.innerText = msg;
    if (isSuccess === true) apiKeyStatus.style.color = '#10b981';
    else if (isSuccess === false) apiKeyStatus.style.color = '#ef4444';
    else apiKeyStatus.style.color = '#94a3b8';
  }

  function updateCacheCount(cache) {
    const count = cache ? Object.keys(cache).filter(k => k.startsWith('http')).length : 0;
    cacheCountLabel.innerText = `Cached Reports: ${count}`;
  }
});
