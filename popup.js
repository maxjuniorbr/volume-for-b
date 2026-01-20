let currentTabId = null;
let isControlling = false;
let currentVolume = 100;
let isMuted = false;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const muteBtn = document.getElementById('muteBtn');
const resetBtn = document.getElementById('resetBtn');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const domainInfo = document.getElementById('domainInfo');
const currentDomain = document.getElementById('currentDomain');
const tabsList = document.getElementById('tabsList');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const darkModeToggle = document.getElementById('darkModeToggle');

document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();
  setupEventListeners();
  await loadInitialState();
  await loadDarkModePreference();
  await updateTabsList();
  setupTabsUpdateListener();
});

// Aplicar internacionalização aos elementos
function applyI18n() {
  // Atualizar lang do documento baseado na locale
  const uiLocale = chrome.i18n.getUILanguage();
  document.documentElement.lang = uiLocale.startsWith('pt') ? 'pt-BR' : 'en';

  // Aplicar texto traduzido
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) el.textContent = message;
  });

  // Aplicar aria-label traduzido
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    const message = chrome.i18n.getMessage(key);
    if (message) el.setAttribute('aria-label', message);
  });

  // Aplicar title traduzido
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = chrome.i18n.getMessage(key);
    if (message) el.setAttribute('title', message);
  });
}

// Obter mensagem i18n com fallback
function i18n(key, fallback = '') {
  return chrome.i18n.getMessage(key) || fallback;
}

function setupEventListeners() {
  startBtn.addEventListener('click', async () => {
    if (!currentTabId) {
      showError(i18n('msgSelectTab', 'Selecione uma aba para controlar'));
      return;
    }
    await startVolumeControl();
  });

  stopBtn.addEventListener('click', async () => {
    await stopVolumeControl();
  });

  muteBtn.addEventListener('click', async () => {
    await toggleMute();
  });

  volumeSlider.addEventListener('input', (e) => {
    const volume = parseInt(e.target.value);
    volumeValue.textContent = `${volume}%`;
  });

  volumeSlider.addEventListener('change', async (e) => {
    const volume = parseInt(e.target.value);
    await setVolume(volume);
  });

  resetBtn.addEventListener('click', async () => {
    if (!isControlling) return;
    await setVolume(100);
    volumeSlider.value = 100;
    volumeValue.textContent = '100%';
  });

  darkModeToggle.addEventListener('click', () => {
    toggleDarkMode();
  });
}

// Carregar estado inicial
async function loadInitialState() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      currentTabId = tabs[0].id;
    }

    const response = await sendMessage({ action: 'getControlledTabs' });
    if (response.success && response.tabs.length > 0) {
      const controlledTab = response.tabs.find(tab => tab.id === currentTabId);
      if (controlledTab) {
        updateControlState(true, controlledTab.currentGain, controlledTab.isMuted);
        showDomainInfo(controlledTab.domain);
      }
    }

  } catch (error) {
    console.error('Erro ao carregar estado inicial:', error);
  }
}

// Iniciar controle de volume
async function startVolumeControl() {
  try {
    setLoading(startBtn, true);

    const response = await sendMessage({
      action: 'startVolumeControl',
      tabId: currentTabId
    });

    if (response.success) {
      updateControlState(true, response.defaultGain || 100, false);
      showDomainInfo(response.domain);
      showSuccess(i18n('msgVolumeStarted', 'Controle de volume iniciado!'));
      await updateTabsList();
    } else {
      updateControlState(false, 100, false);
      hideDomainInfo();
      showError(response.error || i18n('msgCommunicationError', 'Erro ao iniciar controle de volume'));
      await updateTabsList();
    }

  } catch (error) {
    console.error('Erro ao iniciar controle:', error);
    updateControlState(false, 100, false);
    hideDomainInfo();
    showError(i18n('msgCommunicationError', 'Erro de comunicação com a extensão'));
    await updateTabsList();
  } finally {
    setLoading(startBtn, false);
  }
}

// Parar controle de volume
async function stopVolumeControl() {
  try {
    setLoading(stopBtn, true);

    const response = await sendMessage({
      action: 'stopVolumeControl',
      tabId: currentTabId
    });

    if (response.success) {
      updateControlState(false, 100, false);
      hideDomainInfo();
      showSuccess(i18n('msgVolumeStopped', 'Controle de volume parado'));
      await updateTabsList();
    } else {
      await checkTabControlStatus();
      showError(response.error || i18n('msgCommunicationError', 'Erro ao parar controle de volume'));
    }

  } catch (error) {
    console.error('Erro ao parar controle:', error);
    await checkTabControlStatus();
    showError(i18n('msgCommunicationError', 'Erro de comunicação com a extensão'));
  } finally {
    setLoading(stopBtn, false);
  }
}

// Alternar mute
async function toggleMute() {
  try {
    const newMutedState = !isMuted;

    const response = await sendMessage({
      action: 'muteTab',
      tabId: currentTabId,
      muted: newMutedState
    });

    if (response.success) {
      updateMuteState(newMutedState);
      showSuccess(newMutedState ? i18n('msgTabMuted', 'Aba mutada') : i18n('msgTabUnmuted', 'Aba desmutada'));
    } else {
      await checkTabControlStatus();
      showError(response.error || i18n('msgCommunicationError', 'Erro ao mutar aba'));
    }

  } catch (error) {
    console.error('Erro ao alternar mute:', error);
    await checkTabControlStatus();
    showError(i18n('msgCommunicationError', 'Erro de comunicação com a extensão'));
  }
}

// Definir volume
async function setVolume(volume) {
  try {
    // Validação de entrada - usar Number.isNaN para aceitar 0 corretamente
    const parsed = parseInt(volume, 10);
    const validVolume = Math.max(0, Math.min(600, Number.isNaN(parsed) ? 100 : parsed));

    const response = await sendMessage({
      action: 'setVolume',
      tabId: currentTabId,
      volume: validVolume
    });

    if (response.success) {
      currentVolume = validVolume;
      if (isControlling && currentDomain.textContent) {
        await sendMessage({
          action: 'saveDomainGain',
          domain: currentDomain.textContent,
          gain: validVolume
        });
      }
    } else {
      showError(response.error || i18n('msgVolumeError', 'Erro ao definir volume'));
    }

  } catch (error) {
    console.error('Erro ao definir volume:', error);
    showError(i18n('msgCommunicationError', 'Erro de comunicação com a extensão'));
  }
}

// Atualizar lista de abas
async function updateTabsList() {
  try {
    const response = await sendMessage({ action: 'getAudibleTabs' });

    if (response.success) {
      renderTabsList(response.tabs);
    } else {
      renderTabsList([]);
    }

  } catch (error) {
    console.error('Erro ao atualizar lista de abas:', error);
    renderTabsList([]);
  }
}

// Renderizar lista de abas
function renderTabsList(tabs) {
  if (tabs.length === 0) {
    tabsList.innerHTML = `<div class="no-tabs">${i18n('noTabsFound', 'Nenhuma aba com áudio encontrada')}</div>`;
    return;
  }

  const statusControlled = i18n('statusControlled', 'Controlada');
  const statusAudible = i18n('statusAudible', 'Audível');

  tabsList.innerHTML = tabs.map(tab => `
    <div class="tab-item ${tab.controlled ? 'controlled' : ''}" data-tab-id="${tab.id}" role="listitem">
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-domain">${escapeHtml(tab.domain)}</div>
      </div>
      <div class="tab-status">${tab.controlled ? statusControlled : statusAudible}</div>
    </div>
  `).join('');

  tabsList.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = parseInt(item.dataset.tabId);
      selectTab(tabId);
    });
  });
}

async function selectTab(tabId) {
  currentTabId = tabId;

  try {
    await chrome.tabs.update(tabId, { active: true });

    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });

  } catch (error) {
    console.error('Erro ao navegar para a aba:', error);
    showError(i18n('msgNavigateError', 'Erro ao navegar para a aba'));
  }

  tabsList.querySelectorAll('.tab-item').forEach(item => {
    item.classList.toggle('selected', parseInt(item.dataset.tabId) === tabId);
  });

  checkTabControlStatus();
}

// Verificar status de controle da aba
async function checkTabControlStatus() {
  try {
    const response = await sendMessage({ action: 'getControlledTabs' });

    if (response.success) {
      const controlledTab = response.tabs.find(tab => tab.id === currentTabId);

      if (controlledTab) {
        updateControlState(true, controlledTab.currentGain, controlledTab.isMuted);
        showDomainInfo(controlledTab.domain);
      } else {
        updateControlState(false, 100, false);
        hideDomainInfo();
      }
    }

  } catch (error) {
    console.error('Erro ao verificar status de controle:', error);
  }
}

function updateControlState(controlling, volume, muted) {
  isControlling = controlling;
  currentVolume = volume;
  isMuted = muted;

  startBtn.disabled = controlling;
  stopBtn.disabled = !controlling;
  muteBtn.disabled = !controlling;
  resetBtn.disabled = !controlling;
  volumeSlider.disabled = !controlling;

  volumeSlider.value = volume;
  updateVolumeDisplay(volume);

  updateMuteState(muted);
}

// Atualizar estado do mute
function updateMuteState(muted) {
  isMuted = muted;
  muteBtn.textContent = muted ? 'Desmute' : 'Mute';
  muteBtn.className = muted ? 'btn btn-primary' : 'btn btn-secondary';
}

function updateVolumeDisplay(volume) {
  volumeValue.textContent = `${volume}%`;

  // Atualizar aria-valuenow para acessibilidade
  volumeSlider.setAttribute('aria-valuenow', volume);

  // Usar classes CSS para cores que respeitam dark mode
  volumeValue.classList.remove('volume-normal', 'volume-high', 'volume-extreme');

  if (volume <= 100) {
    volumeValue.classList.add('volume-normal');
  } else if (volume <= 300) {
    volumeValue.classList.add('volume-high');
  } else {
    volumeValue.classList.add('volume-extreme');
  }
}

// Mostrar informações do domínio
function showDomainInfo(domain) {
  currentDomain.textContent = domain;
  domainInfo.style.display = 'block';
}

// Esconder informações do domínio
function hideDomainInfo() {
  domainInfo.style.display = 'none';
}

// Mostrar mensagem de erro
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  successMessage.style.display = 'none';

  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 5000);
}

// Mostrar mensagem de sucesso
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.style.display = 'block';
  errorMessage.style.display = 'none';

  setTimeout(() => {
    successMessage.style.display = 'none';
  }, 3000);
}

// Definir estado de loading do botão
function setLoading(button, loading) {
  if (loading) {
    button.disabled = true;
    button.textContent = i18n('btnLoading', 'Carregando...');
  } else {
    button.disabled = false;
    if (button === startBtn) button.textContent = i18n('btnStart', 'Iniciar');
    if (button === stopBtn) button.textContent = i18n('btnStop', 'Parar');
  }
}

// Enviar mensagem para service worker com retry
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function sendMessage(message, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
    }
  }
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
  if (typeof text !== 'string') return '';

  const div = document.createElement('div');
  div.textContent = text.substring(0, 500); // Limita tamanho
  return div.innerHTML;
}

function setupTabsUpdateListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'tabsUpdated') {
      updateTabsList();
    }
  });

  chrome.runtime.sendMessage({ action: 'popupOpened' }).catch(() => {
  });
}

window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({ action: 'popupClosed' }).catch(() => {
  });
});

async function loadDarkModePreference() {
  try {
    const result = await chrome.storage.local.get(['darkMode']);
    const isDarkMode = result.darkMode !== undefined ? result.darkMode : true;

    const toggleLabel = darkModeToggle.querySelector('.toggle-label');

    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      darkModeToggle.setAttribute('aria-checked', 'true');
      toggleLabel.textContent = '☀️';
    } else {
      darkModeToggle.setAttribute('aria-checked', 'false');
      toggleLabel.textContent = '🌙';
    }
  } catch (error) {
    console.error('Erro ao carregar preferência do modo dark:', error);
  }
}

function toggleDarkMode() {
  const isDarkMode = document.body.classList.toggle('dark-mode');
  const toggleLabel = darkModeToggle.querySelector('.toggle-label');

  toggleLabel.textContent = isDarkMode ? '☀️' : '🌙';
  darkModeToggle.setAttribute('aria-checked', isDarkMode.toString());

  saveDarkModePreference(isDarkMode);
}

async function saveDarkModePreference(isDarkMode) {
  try {
    await chrome.storage.local.set({ darkMode: isDarkMode });
  } catch (error) {
    console.error('Erro ao salvar preferência do modo dark:', error);
  }
}
