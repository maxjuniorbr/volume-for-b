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
  setupEventListeners();
  await loadInitialState();
  await loadDarkModePreference();
  await updateTabsList();
  setupTabsUpdateListener();
});

function setupEventListeners() {
  startBtn.addEventListener('click', async () => {
    if (!currentTabId) {
      showError('Selecione uma aba para controlar');
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
      showSuccess('Controle de volume iniciado!');
      await updateTabsList();
    } else {
      updateControlState(false, 100, false);
      hideDomainInfo();
      showError(response.error || 'Erro ao iniciar controle de volume');
      await updateTabsList();
    }

  } catch (error) {
    console.error('Erro ao iniciar controle:', error);
    updateControlState(false, 100, false);
    hideDomainInfo();
    showError('Erro de comunicação com a extensão');
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
      showSuccess('Controle de volume parado');
      await updateTabsList();
    } else {
      await checkTabControlStatus();
      showError(response.error || 'Erro ao parar controle de volume');
    }

  } catch (error) {
    console.error('Erro ao parar controle:', error);
    await checkTabControlStatus();
    showError('Erro de comunicação com a extensão');
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
      showSuccess(newMutedState ? 'Aba mutada' : 'Aba desmutada');
    } else {
      await checkTabControlStatus();
      showError(response.error || 'Erro ao mutar aba');
    }

  } catch (error) {
    console.error('Erro ao alternar mute:', error);
    await checkTabControlStatus();
    showError('Erro de comunicação com a extensão');
  }
}

// Definir volume
async function setVolume(volume) {
  try {
    // Validação de entrada
    const validVolume = Math.max(0, Math.min(600, parseInt(volume) || 100));
    
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
      showError(response.error || 'Erro ao definir volume');
    }

  } catch (error) {
    console.error('Erro ao definir volume:', error);
    showError('Erro de comunicação com a extensão');
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
    tabsList.innerHTML = '<div class="no-tabs">Nenhuma aba com áudio encontrada</div>';
    return;
  }

  tabsList.innerHTML = tabs.map(tab => `
    <div class="tab-item ${tab.controlled ? 'controlled' : ''}" data-tab-id="${tab.id}" title="Clique para navegar para esta aba">
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-domain">${escapeHtml(tab.domain)}</div>
      </div>
      <div class="tab-status">${tab.controlled ? 'Controlada' : 'Audível'}</div>
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
    showError('Erro ao navegar para a aba');
  }

  tabsList.querySelectorAll('.tab-item').forEach(item => {
    item.style.background = parseInt(item.dataset.tabId) === tabId ? '#e3f2fd' : '';
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

  if (volume <= 100) {
    volumeValue.style.color = '#007AFF';
  } else if (volume <= 300) {
    volumeValue.style.color = '#FF9500';
  } else {
    volumeValue.style.color = '#FF3B30';
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
    button.textContent = 'Carregando...';
  } else {
    button.disabled = false;
    if (button === startBtn) button.textContent = 'Iniciar';
    if (button === stopBtn) button.textContent = 'Parar';
  }
}

// Enviar mensagem para service worker
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
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
      toggleLabel.textContent = '☀️';
    } else {
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

  saveDarkModePreference(isDarkMode);
}

async function saveDarkModePreference(isDarkMode) {
  try {
    await chrome.storage.local.set({ darkMode: isDarkMode });
  } catch (error) {
    console.error('Erro ao salvar preferência do modo dark:', error);
  }
}
