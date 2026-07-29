let currentTabId = null;
let isControlling = false;
let isMuted = false;
let isCurrentTabAudible = false;

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
  await loadDarkModePreference();
  await loadInitialState();
  await updateTabsList();
  setupTabsUpdateListener();

  // Release the anti-flash transition lock after the first paint settles.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('preload');
    });
  });
});

// Aplicar internacionalização aos elementos
function applyI18n() {
  // Atualizar lang do documento baseado na locale
  const uiLocale = chrome.i18n.getUILanguage();
  document.documentElement.lang = uiLocale.startsWith('pt') ? 'pt-BR' : 'en';

  // Aplicar texto traduzido
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const message = chrome.i18n.getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });

  // Aplicar aria-label traduzido
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.dataset.i18nAria;
    const message = chrome.i18n.getMessage(key);
    if (message) {
      el.setAttribute('aria-label', message);
    }
  });

  // Aplicar title traduzido
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    const message = chrome.i18n.getMessage(key);
    if (message) {
      el.setAttribute('title', message);
    }
  });
}

// Obter mensagem i18n com fallback
function i18n(key, fallback = '') {
  return chrome.i18n.getMessage(key) || fallback;
}

// Map service-worker error codes to localized, user-facing strings.
function translateError(code) {
  const map = {
    [ErrorCodes.TAB_NOT_AUDIBLE]: i18n('errTabNotAudible', 'This tab is not playing audio'),
    [ErrorCodes.TAB_NOT_CONTROLLED]: i18n('errTabNotControlled', 'Volume control is not active for this tab'),
    [ErrorCodes.INVALID_DOMAIN]: i18n('errInvalidDomain', 'Invalid domain'),
    [ErrorCodes.NO_PROCESSOR]: i18n('errNoProcessor', 'Audio processor unavailable'),
    [ErrorCodes.CAPTURE_FAILED]: i18n('errCaptureFailed', 'Could not capture tab audio'),
    [ErrorCodes.INTERNAL]: i18n('errInternal', 'Something went wrong. Please try again.')
  };
  return map[code] || i18n('errInternal', 'Something went wrong. Please try again.');
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
    const volume = Number.parseInt(e.target.value, 10);
    volumeValue.textContent = `${volume}%`;
  });

  volumeSlider.addEventListener('change', async (e) => {
    const volume = Number.parseInt(e.target.value, 10);
    await setVolume(volume);
  });

  resetBtn.addEventListener('click', async () => {
    if (!isControlling) {
      return;
    }
    await setVolume(VOLUME_DEFAULT);
    volumeSlider.value = VOLUME_DEFAULT;
    volumeValue.textContent = `${VOLUME_DEFAULT}%`;
  });

  darkModeToggle.addEventListener('click', () => {
    toggleDarkMode();
  });

  tabsList.addEventListener('click', (event) => {
    const item = event.target.closest('.tab-item');
    if (item && tabsList.contains(item)) {
      const tabId = Number.parseInt(item.dataset.tabId, 10);
      selectTab(tabId);
    }
  });
}

// Carregar estado inicial
async function loadInitialState() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      currentTabId = tabs[0].id;
      isCurrentTabAudible = tabs[0].audible === true;
    }

    const response = await sendMessage({ action: 'getControlledTabs' });
    const controlledTab = response.success
      ? response.tabs.find(tab => tab.id === currentTabId)
      : null;

    if (controlledTab) {
      updateControlState(true, controlledTab.currentGain, controlledTab.isMuted);
      showDomainInfo(controlledTab.domain);
    } else {
      // Garante que o botão Iniciar reflita a audibilidade da aba atual
      updateControlState(false, VOLUME_DEFAULT, false);
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
      updateControlState(true, resolveGain(response.defaultGain), false);
      showDomainInfo(response.domain);
      showSuccess(i18n('msgVolumeStarted', 'Controle de volume iniciado!'));
      await updateTabsList();
    } else {
      updateControlState(false, VOLUME_DEFAULT, false);
      hideDomainInfo();
      showError(translateError(response.error));
      await updateTabsList();
    }

  } catch (error) {
    console.error('Erro ao iniciar controle:', error);
    updateControlState(false, VOLUME_DEFAULT, false);
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
      updateControlState(false, VOLUME_DEFAULT, false);
      hideDomainInfo();
      showSuccess(i18n('msgVolumeStopped', 'Controle de volume parado'));
      await updateTabsList();
    } else {
      await checkTabControlStatus();
      showError(translateError(response.error));
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
  // Bloqueio reentrante para evitar cliques sucessivos disparando estados conflitantes.
  if (muteBtn.disabled) {
    return;
  }

  const previousDisabled = muteBtn.disabled;
  muteBtn.disabled = true;

  try {
    const newMutedState = !isMuted;

    const response = await sendMessage({
      action: 'muteTab',
      tabId: currentTabId,
      muted: newMutedState
    });

    if (response.success) {
      updateMuteState(newMutedState);
      showSuccess(newMutedState ? i18n('msgTabMuted', 'Aba silenciada') : i18n('msgTabUnmuted', 'Som da aba ativado'));
    } else {
      await checkTabControlStatus();
      showError(translateError(response.error));
    }

  } catch (error) {
    console.error('Erro ao alternar mute:', error);
    await checkTabControlStatus();
    showError(i18n('msgCommunicationError', 'Erro de comunicação com a extensão'));
  } finally {
    // Só reabilita se ainda fizer sentido (controle ativo).
    // checkTabControlStatus pode ter mudado isControlling para false, nesse caso
    // o updateControlState mantém o botão desabilitado.
    if (isControlling) {
      muteBtn.disabled = previousDisabled;
    }
  }
}

// Definir volume
async function setVolume(volume) {
  try {
    const validVolume = clampVolume(volume);

    const response = await sendMessage({
      action: 'setVolume',
      tabId: currentTabId,
      volume: validVolume
    });

    if (response.success) {
      if (isControlling && currentDomain.textContent) {
        await sendMessage({
          action: 'saveDomainGain',
          domain: currentDomain.textContent,
          gain: validVolume
        });
      }
    } else {
      showError(translateError(response.error));
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

    const tabs = response.success ? response.tabs : [];
    const wasAudible = isCurrentTabAudible;
    isCurrentTabAudible = tabs.some(tab => tab.id === currentTabId);

    renderTabsList(tabs);

    // Se a audibilidade da aba atual mudou e não estamos controlando,
    // reaplica o estado dos botões para refletir o novo cenário.
    if (wasAudible !== isCurrentTabAudible && !isControlling) {
      updateControlState(false, VOLUME_DEFAULT, false);
    }

  } catch (error) {
    console.error('Erro ao atualizar lista de abas:', error);
    renderTabsList([]);
  }
}

// Renderizar lista de abas
function renderTabsList(tabs) {
  // Limpa de forma segura (sem innerHTML).
  while (tabsList.firstChild) {
    tabsList.firstChild.remove();
  }

  if (tabs.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-tabs';
    li.textContent = i18n('noTabsFound', 'Nenhuma aba com áudio encontrada');
    tabsList.append(li);
    return;
  }

  const statusControlled = i18n('statusControlled', 'Controlada');
  const statusAudible = i18n('statusAudible', 'Audível');

  const fragment = document.createDocumentFragment();

  tabs.forEach(tab => {
    const li = document.createElement('li');
    li.className = `tab-item${tab.controlled ? ' controlled' : ''}`;
    li.dataset.tabId = String(tab.id);

    li.append(buildFavicon(tab));

    const info = document.createElement('div');
    info.className = 'tab-info';

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || '';
    info.append(title);

    const domain = document.createElement('div');
    domain.className = 'tab-domain';
    domain.textContent = tab.domain || '';
    info.append(domain);

    li.append(info);

    const status = document.createElement('div');
    status.className = 'tab-status';
    status.textContent = tab.controlled ? statusControlled : statusAudible;
    li.append(status);

    fragment.append(li);
  });

  tabsList.append(fragment);
}

function buildFavicon(tab) {
  const initial = (tab.domain || '?').replace(/^www\./, '').charAt(0).toUpperCase() || '?';

  if (!tab.favIconUrl || !isSafeFaviconUrl(tab.favIconUrl)) {
    return buildFaviconFallback(initial);
  }

  const img = document.createElement('img');
  img.className = 'tab-favicon';
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.src = tab.favIconUrl;
  img.addEventListener('error', () => {
    img.replaceWith(buildFaviconFallback(initial));
  }, { once: true });
  return img;
}

function buildFaviconFallback(initial) {
  const span = document.createElement('span');
  span.className = 'tab-favicon-fallback';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = initial;
  return span;
}

// Aceita apenas esquemas seguros para uso em <img src>.
function isSafeFaviconUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) {
    return false;
  }
  return /^(https?:|data:image\/)/i.test(url);
}

async function selectTab(tabId) {
  currentTabId = tabId;
  // A lista só contém abas audíveis, então a aba selecionada é audível.
  isCurrentTabAudible = true;

  try {
    await chrome.tabs.update(tabId, { active: true });

    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });

  } catch (error) {
    console.error('Erro ao navegar para a aba:', error);
    showError(i18n('msgNavigateError', 'Erro ao navegar para a aba'));
  }

  tabsList.querySelectorAll('.tab-item').forEach(item => {
    item.classList.toggle('selected', Number.parseInt(item.dataset.tabId, 10) === tabId);
  });

  await checkTabControlStatus();
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
        updateControlState(false, VOLUME_DEFAULT, false);
        hideDomainInfo();
      }
    }

  } catch (error) {
    console.error('Erro ao verificar status de controle:', error);
  }
}

function updateControlState(controlling, volume, muted) {
  isControlling = controlling;
  // isMuted é gerenciado por updateMuteState abaixo (fonte única).

  // Iniciar só fica habilitado em abas audíveis e quando ainda não controlamos.
  startBtn.disabled = controlling || !isCurrentTabAudible;
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
  muteBtn.textContent = muted
    ? i18n('btnUnmute', 'Unmute')
    : i18n('btnMute', 'Mute');
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
  domainInfo.classList.remove('is-hidden');
}

// Esconder informações do domínio
function hideDomainInfo() {
  domainInfo.classList.add('is-hidden');
}

// Mostrar mensagem de erro
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('is-visible');
  successMessage.classList.remove('is-visible');

  setTimeout(() => {
    errorMessage.classList.remove('is-visible');
  }, ERROR_TOAST_MS);
}

// Mostrar mensagem de sucesso
function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.classList.add('is-visible');
  errorMessage.classList.remove('is-visible');

  setTimeout(() => {
    successMessage.classList.remove('is-visible');
  }, SUCCESS_TOAST_MS);
}

// Definir estado de loading do botão.
// Apenas o texto é responsabilidade desta função; o estado `disabled` é
// gerenciado por `updateControlState` para evitar que reabilitemos botões
// que já deveriam estar desabilitados após a operação.
function setLoading(button, loading) {
  if (loading) {
    button.disabled = true;
    button.textContent = i18n('btnLoading', 'Carregando...');
    return;
  }

  if (button === startBtn) {
    button.textContent = i18n('btnStart', 'Iniciar');
  } else if (button === stopBtn) {
    button.textContent = i18n('btnStop', 'Parar');
  }
}

// Send a message to the service worker with bounded retry + exponential backoff.
async function sendMessage(message, retries = SEND_MESSAGE_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, SEND_MESSAGE_BASE_DELAY_MS * Math.pow(2, attempt - 1)));
    }
  }
}

function setupTabsUpdateListener() {
  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message.action === 'tabsUpdated') {
      updateTabsList();
    }
  });

  // Padrão MV3 confiável para detectar abertura/fechamento do popup:
  // mantemos uma Port aberta; o SW recebe `onDisconnect` quando o popup fecha.
  // beforeunload em popups de extensão não é confiável.
  try {
    chrome.runtime.connect({ name: POPUP_PORT_NAME });
  } catch (error) {
    console.debug('Falha ao abrir Port com SW:', error);
  }
}

async function loadDarkModePreference() {
  try {
    const result = await chrome.storage.local.get(['darkMode']);
    let isDarkMode;

    if (result.darkMode === undefined) {
      // Primeira abertura: respeita preferência do sistema (com fallback para dark)
      const prefersDark = globalThis.matchMedia
        ? globalThis.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
      isDarkMode = prefersDark;
    } else {
      isDarkMode = Boolean(result.darkMode);
    }

    // theme-init.js already painted using the localStorage cache; here we just
    // reconcile with the canonical chrome.storage.local value and refresh the
    // cache so the next popup open paints correctly.
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
    try {
      localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
    } catch (storageError) {
      console.debug('localStorage indisponível ao espelhar dark mode:', storageError);
    }
    darkModeToggle.setAttribute('aria-pressed', isDarkMode ? 'true' : 'false');
  } catch (error) {
    console.error('Erro ao carregar preferência do modo dark:', error);
  }
}

function toggleDarkMode() {
  const isDarkMode = document.documentElement.classList.toggle('dark-mode');
  darkModeToggle.setAttribute('aria-pressed', isDarkMode ? 'true' : 'false');
  saveDarkModePreference(isDarkMode);
}

async function saveDarkModePreference(isDarkMode) {
  try {
    localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
  } catch (storageError) {
    console.debug('localStorage indisponível ao salvar dark mode:', storageError);
  }
  try {
    await chrome.storage.local.set({ darkMode: isDarkMode });
  } catch (error) {
    console.error('Erro ao salvar preferência do modo dark:', error);
  }
}
