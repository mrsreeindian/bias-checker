/**
 * options.js
 * Settings manager for Fact-Checker AI Council (Ollama Cloud Edition)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const endpointInput = document.getElementById('endpoint-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const toggleKeyBtn = document.getElementById('toggle-key-btn');
  const testKeyBtn = document.getElementById('test-key-btn');
  const apiKeyStatus = document.getElementById('api-key-status');

  const modelSelect = document.getElementById('model-select');
  const fetchModelsBtn = document.getElementById('fetch-models-btn');
  const customModelGroup = document.getElementById('custom-model-group');
  const customModelInput = document.getElementById('custom-model-input');

  const forumWarningToggle = document.getElementById('toggle-forum-warning');

  const cacheCountLabel = document.getElementById('cache-count-label');
  const clearCacheBtn = document.getElementById('clear-cache-btn');

  const saveAllBtn = document.getElementById('save-all-btn');
  const saveSuccessMsg = document.getElementById('save-success-msg');

  // Load existing settings
  const settings = await chrome.storage.local.get([
    'ollamaEndpoint',
    'ollamaApiKey',
    'modelPreference',
    'councilSize',
    'showForumWarning',
    'reportsCache',
    'isConfigured'
  ]);

  if (settings.ollamaEndpoint) {
    endpointInput.value = settings.ollamaEndpoint;
  }
  if (settings.ollamaApiKey) {
    apiKeyInput.value = settings.ollamaApiKey;
  }
  if (settings.ollamaEndpoint || settings.ollamaApiKey) {
    showKeyStatus('✅ Ollama connection configured', true);
  }

  // Model preference
  const currentModel = settings.modelPreference || 'llama3.2';
  const standardModels = ['llama3.2', 'llama3.1', 'deepseek-r1', 'mistral', 'qwen2.5'];
  if (standardModels.includes(currentModel)) {
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

  // Warnings
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

  function updateModelDropdown(modelsList, selectedModel) {
    if (!modelsList || modelsList.length === 0) return;
    
    // Clear existing options except custom
    modelSelect.innerHTML = '';
    modelsList.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.innerText = m;
      if (m === selectedModel) opt.selected = true;
      modelSelect.appendChild(opt);
    });

    // Add custom option
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.innerText = 'Custom Model Identifier...';
    if (!modelsList.includes(selectedModel)) {
      customOpt.selected = true;
      customModelGroup.style.display = 'block';
      customModelInput.value = selectedModel || '';
    } else {
      customModelGroup.style.display = 'none';
    }
    modelSelect.appendChild(customOpt);
  }

  // Fetch installed models
  fetchModelsBtn?.addEventListener('click', () => {
    const endpoint = (endpointInput.value.trim() || 'http://localhost:11434');
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value === 'custom'
      ? (customModelInput.value.trim() || 'llama3.2')
      : modelSelect.value;

    fetchModelsBtn.disabled = true;
    fetchModelsBtn.innerText = 'Fetching...';
    showKeyStatus('Fetching installed models from Ollama...', null);

    chrome.runtime.sendMessage({
      type: 'SAVE_AND_VERIFY_OLLAMA_CONFIG',
      endpoint,
      apiKey: key,
      model
    }, (res) => {
      fetchModelsBtn.disabled = false;
      fetchModelsBtn.innerText = 'Fetch Installed';

      if (res && res.valid) {
        if (res.availableModels && res.availableModels.length > 0) {
          updateModelDropdown(res.availableModels, res.workingModel || model);
          showKeyStatus(`✅ Fetched ${res.availableModels.length} models from server`, true);
        } else {
          showKeyStatus('✅ Server connected, but no local models found in /api/tags', true);
        }
      } else {
        showKeyStatus(`❌ Failed to fetch models: ${res?.error || 'Unknown error'}`, false);
      }
    });
  });

  // Test & Connect
  testKeyBtn.addEventListener('click', () => {
    const endpoint = (endpointInput.value.trim() || 'http://localhost:11434');
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value === 'custom'
      ? (customModelInput.value.trim() || 'llama3.2')
      : modelSelect.value;

    testKeyBtn.disabled = true;
    testKeyBtn.innerText = 'Testing...';
    showKeyStatus('Testing connection to Ollama server...', null);

    chrome.runtime.sendMessage({
      type: 'SAVE_AND_VERIFY_OLLAMA_CONFIG',
      endpoint,
      apiKey: key,
      model
    }, (res) => {
      testKeyBtn.disabled = false;
      testKeyBtn.innerText = 'Test & Connect';

      if (res && res.valid) {
        if (res.availableModels && res.availableModels.length > 0) {
          updateModelDropdown(res.availableModels, res.workingModel || model);
        }
        showKeyStatus(res.note ? `✅ ${res.note}` : '✅ Ollama connected & saved successfully!', true);
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
      ? (customModelInput.value.trim() || 'llama3.2')
      : modelSelect.value;

    const councilSizeRadio = document.querySelector('input[name="council-size"]:checked');
    const councilSize = councilSizeRadio ? parseInt(councilSizeRadio.value, 10) : 5;

    const endpoint = (endpointInput.value.trim() || 'http://localhost:11434');
    const key = apiKeyInput.value.trim();

    const payload = {
      ollamaEndpoint: endpoint,
      ollamaApiKey: key,
      modelPreference: selectedModel,
      councilSize: councilSize,
      showForumWarning: forumWarningToggle.checked,
      isConfigured: true
    };

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
