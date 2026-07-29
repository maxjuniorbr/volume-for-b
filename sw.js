// Load shared constants and helpers (single source of truth across SW, popup
// and offscreen). Must be the first statement: importScripts is synchronous
// and only available before any await in module-less service workers.
importScripts('constants.js');

const tabControllers = new Map();
let popupIsOpen = false;
let stateRestorePromise = null;

function formatErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

// Validação estrutural de hostname para evitar persistir lixo no storage.
// Aceita apenas hostnames válidos (RFC 1123 simplificado) ou IPv4.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function isValidHostname(input) {
  return typeof input === 'string' && input.length >= 1 && input.length <= 253 && HOSTNAME_RE.test(input);
}

// Cap user-supplied strings (tab titles) to a defensive size before exposing
// them to the popup, so a pathological page cannot break the layout.
function clipString(input, max = TAB_TITLE_MAX) {
  if (typeof input !== 'string') {
    return '';
  }
  return input.length > max ? input.slice(0, max) : input;
}

// Aceita mensagens apenas de componentes da própria extensão.
function isFromOwnExtension(sender) {
  return Boolean(sender) && sender.id === chrome.runtime.id;
}

// Restaura o estado em memória a partir do storage. Roda na primeira mensagem
// após o SW acordar do idle, sem precisar do onStartup.
//
// Memoiza a *promise*, não um booleano: com uma flag setada antes do await, uma
// segunda mensagem concorrente (o popup dispara getControlledTabs e
// getAudibleTabs quase juntos) passava direto com tabControllers ainda vazio e
// o popup exibia a aba como não controlada.
function ensureStateRestored() {
  stateRestorePromise ??= restoreControllerState();
  return stateRestorePromise;
}

chrome.runtime.onStartup.addListener(async () => {
  await ensureStateRestored();
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStateRestored();
  await cleanupOldDomains();
  await scheduleCleanupAlarm();
});

// Limpar domínios não acessados há mais de 30 dias

async function scheduleCleanupAlarm() {
  try {
    const existing = await chrome.alarms.get(CLEANUP_ALARM_NAME);
    if (!existing) {
      chrome.alarms.create(CLEANUP_ALARM_NAME, {
        delayInMinutes: CLEANUP_PERIOD_MINUTES,
        periodInMinutes: CLEANUP_PERIOD_MINUTES
      });
    }
  } catch (error) {
    console.debug(`Falha ao agendar alarm de cleanup: ${formatErrorMessage(error)}`);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLEANUP_ALARM_NAME) {
    cleanupOldDomains();
  }
});

async function cleanupOldDomains() {
  try {
    const storage = await chrome.storage.local.get(null);
    const now = Date.now();
    const maxAgeMs = DOMAIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const keysToRemove = [];
    const migrations = {};

    for (const [key, value] of Object.entries(storage)) {
      if (key.startsWith(DOMAIN_KEY_PREFIX)) {
        if (typeof value === 'object' && value.lastAccessed) {
          if (now - value.lastAccessed > maxAgeMs) {
            keysToRemove.push(key);
          }
        } else if (typeof value === 'number') {
          // Migra formato legado (número) para novo formato (objeto).
          migrations[key] = { gain: value, lastAccessed: now };
        }
      }
    }

    if (Object.keys(migrations).length > 0) {
      await chrome.storage.local.set(migrations);
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (error) {
    console.error('Erro ao limpar domínios antigos:', error);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
  // Navegar para outro site na mesma aba deixava o controller apontando para o
  // domínio anterior, e o ganho passava a ser gravado no domínio errado.
  if (changeInfo.url !== undefined) {
    syncControllerDomain(tabId, changeInfo.url);
  }

  if (changeInfo.audible !== undefined && popupIsOpen) {
    notifyPopupTabsUpdated();
  }
});

function syncControllerDomain(tabId, url) {
  const controller = tabControllers.get(tabId);
  if (!controller) {
    return;
  }

  const nextDomain = extractSafeHostname(url);
  if (nextDomain === controller.domain) {
    return;
  }

  controller.domain = nextDomain;
  saveControllerState().catch((error) => {
    console.debug(`Falha ao persistir troca de domínio da aba ${tabId}: ${formatErrorMessage(error)}`);
  });

  if (popupIsOpen) {
    notifyPopupTabsUpdated();
  }
}

chrome.tabs.onRemoved.addListener(async (tabId, _removeInfo) => {
  if (tabControllers.has(tabId)) {
    chrome.runtime.sendMessage({
      action: 'stopProcessing',
      tabId
    }).catch(() => { });

    tabControllers.delete(tabId);
    await saveControllerState();
  }

  if (popupIsOpen) {
    notifyPopupTabsUpdated();
  }
});

// Não existe evento de pré-terminação para service workers MV3: runtime.onSuspend
// só vale para event pages do MV2 e nunca dispara aqui. Por isso o mute não é
// desfeito "na saída" — ele é mantido coerente com a existência de um processador
// vivo, em restoreControllerState: com áudio processado a aba fica muda (para não
// duplicar o som), sem áudio processado ela volta ao estado original.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isFromOwnExtension(sender)) {
    return false;
  }

  const { action } = message;

  const handlers = {
    'startVolumeControl': () => handleStartVolumeControl(message.tabId, sendResponse),
    'stopVolumeControl': () => handleStopVolumeControl(message.tabId, sendResponse),
    'setVolume': () => handleSetVolume(message.tabId, message.volume, sendResponse),
    'muteTab': () => handleMuteTab(message.tabId, message.muted, sendResponse),
    'getAudibleTabs': () => handleGetAudibleTabs(sendResponse),
    'getControlledTabs': () => handleGetControlledTabs(sendResponse)
  };

  if (handlers[action]) {
    // Restaura estado de forma preguiçosa caso o SW tenha acordado do idle.
    ensureStateRestored().then(() => handlers[action]()).catch((error) => {
      console.error('Erro ao processar mensagem:', formatErrorMessage(error));
      sendResponse({ success: false, error: ErrorCodes.INTERNAL });
    });
    return true;
  }

  return false;
});

// Detecta abertura/fechamento do popup via Port (mais confiável que beforeunload).
chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.id !== chrome.runtime.id || port.name !== POPUP_PORT_NAME) {
    return;
  }
  popupIsOpen = true;
  port.onDisconnect.addListener(() => {
    popupIsOpen = false;
  });
});

async function handleStartVolumeControl(tabId, sendResponse) {
  try {
    const cached = tabControllers.get(tabId);
    if (cached) {
      sendResponse({
        success: true,
        domain: cached.domain,
        defaultGain: cached.currentGain
      });
      return;
    }

    const tab = await chrome.tabs.get(tabId);
    if (!tab.audible) {
      sendResponse({ success: false, error: ErrorCodes.TAB_NOT_AUDIBLE });
      return;
    }

    await ensureOffscreenCreated();

    const safeDomain = extractSafeHostname(tab.url);
    const initialGain = await resolveInitialGain(safeDomain);

    const result = await acquireProcessor(tabId, initialGain);
    if (!result.success) {
      sendResponse({ success: false, error: result.error });
      return;
    }

    registerController(tabId, safeDomain, tab.mutedInfo.muted, initialGain);
    await saveControllerState();

    sendResponse({ success: true, domain: safeDomain, defaultGain: initialGain });
  } catch (error) {
    if (error.message?.includes('active stream')) {
      const recovered = await recoverFromActiveStream(tabId);
      if (recovered) {
        sendResponse(recovered);
        return;
      }
    }

    sendResponse({ success: false, error: error.message });
  }
}

// Ajuste de mute best-effort: a aba pode ter sido fechada no meio do caminho, e
// nenhum caminho de recuperação deve quebrar por causa disso.
async function setTabMuted(tabId, muted) {
  try {
    await chrome.tabs.update(tabId, { muted });
  } catch (error) {
    console.debug(`Não foi possível ajustar o mute da aba ${tabId}: ${formatErrorMessage(error)}`);
  }
}

function extractSafeHostname(url) {
  try {
    const hostname = new URL(url).hostname;
    return isValidHostname(hostname) ? hostname : '';
  } catch {
    return '';
  }
}

async function resolveInitialGain(safeDomain) {
  if (!safeDomain) {
    return VOLUME_DEFAULT;
  }
  const stored = await getDomainGainFromStorage(safeDomain);
  return resolveGain(stored);
}

function registerController(tabId, domain, originalMuted, currentGain) {
  tabControllers.set(tabId, {
    domain,
    originalMuted,
    currentGain,
    isMuted: false
  });
}

async function checkExistingProcessor(tabId) {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'checkProcessor', tabId });
    return Boolean(result?.exists);
  } catch (error) {
    console.debug(`Falha ao consultar processador existente da aba ${tabId}: ${formatErrorMessage(error)}`);
    return false;
  }
}

// O offscreen sinaliza falha pelo corpo da resposta, não por rejeição. E quando
// nenhum listener responde (offscreen ausente, popup aberto recebendo a mensagem
// no lugar dele), sendMessage resolve `undefined`. Ambos os casos precisam ser
// tratados como falha: seguir adiante deixaria a aba mutada e sem processamento.
function assertOffscreenAck(result, fallbackError) {
  if (!result?.success) {
    throw new Error(result?.error || fallbackError);
  }
}

async function acquireProcessor(tabId, gain) {
  const existing = await checkExistingProcessor(tabId);

  if (existing) {
    const reused = await chrome.runtime.sendMessage({ action: 'setGain', tabId, gain });
    assertOffscreenAck(reused, ErrorCodes.NO_PROCESSOR);
    return { success: true };
  }

  let mutedByUs = false;
  try {
    const mediaStreamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await chrome.tabs.update(tabId, { muted: true });
    mutedByUs = true;
    const processed = await chrome.runtime.sendMessage({ action: 'processAudio', tabId, mediaStreamId, gain });
    assertOffscreenAck(processed, ErrorCodes.CAPTURE_FAILED);
    return { success: true };
  } catch (error) {
    if (mutedByUs) {
      try {
        await chrome.tabs.update(tabId, { muted: false });
      } catch { /* aba pode ter sido fechada */ }
    }
    throw error;
  }
}

async function recoverFromActiveStream(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const safeDomain = extractSafeHostname(tab.url);
    const targetGain = await resolveInitialGain(safeDomain);

    const reuse = await chrome.runtime.sendMessage({ action: 'setGain', tabId, gain: targetGain });
    if (!reuse?.success) {
      throw new Error(reuse?.error || ErrorCodes.NO_PROCESSOR);
    }

    registerController(tabId, safeDomain, tab.mutedInfo.muted, targetGain);
    await saveControllerState();

    return { success: true, domain: safeDomain, defaultGain: targetGain };
  } catch (fallbackError) {
    console.debug('Fallback de reconexão falhou:', formatErrorMessage(fallbackError));
    return null;
  }
}

async function handleStopVolumeControl(tabId, sendResponse) {
  try {
    const controller = tabControllers.get(tabId);
    if (!controller) {
      sendResponse({ success: false, error: ErrorCodes.TAB_NOT_CONTROLLED });
      return;
    }

    // Parar é uma operação de recuperação: uma falha ao falar com o offscreen
    // não pode impedir que a aba volte ao som normal. Se este await lançasse,
    // a aba ficaria mutada e o controller preso no mapa — sem saída para o
    // usuário, nem tentando de novo.
    try {
      await chrome.runtime.sendMessage({ action: 'stopProcessing', tabId });
    } catch (error) {
      console.debug(`Offscreen não confirmou stopProcessing da aba ${tabId}: ${formatErrorMessage(error)}`);
    }

    await chrome.tabs.update(tabId, { muted: controller.originalMuted });
    tabControllers.delete(tabId);

    await saveControllerState();

    sendResponse({ success: true });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSetVolume(tabId, volume, sendResponse) {
  try {
    const controller = tabControllers.get(tabId);
    if (!controller) {
      sendResponse({ success: false, error: ErrorCodes.TAB_NOT_CONTROLLED });
      return;
    }

    const validVolume = clampVolume(volume);

    await chrome.runtime.sendMessage({
      action: 'setGain',
      tabId,
      gain: validVolume
    });

    controller.currentGain = validVolume;
    // Precisa persistir: o SW é morto por idle a cada 30s e, ao acordar,
    // restoreControllerState reenvia o gain lido do storage ao offscreen.
    // Sem este save, o valor antigo sobrescreve o que o usuário acabou de ajustar.
    await saveControllerState();

    // A memória por domínio é gravada aqui, com o domínio do próprio controller.
    // Antes o popup enviava o domínio lido do DOM, que ficava obsoleto quando a
    // aba navegava para outro site — o ganho ia para o domínio anterior.
    await persistDomainGain(controller.domain, validVolume);

    sendResponse({ success: true });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleMuteTab(tabId, muted, sendResponse) {
  try {
    const controller = tabControllers.get(tabId);
    if (!controller) {
      sendResponse({ success: false, error: ErrorCodes.TAB_NOT_CONTROLLED });
      return;
    }

    await chrome.runtime.sendMessage({
      action: 'setMute',
      tabId,
      muted
    });

    controller.isMuted = muted;
    await saveControllerState();
    sendResponse({ success: true });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetAudibleTabs(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ audible: true });
    const audibleTabs = tabs.map(tab => {
      let domain = '';
      try {
        const url = new URL(tab.url);
        domain = url.hostname;
      } catch (error) {
        console.debug(`Invalid tab URL for tab ${tab.id}: ${formatErrorMessage(error)}`);
      }

      return {
        id: tab.id,
        title: clipString(tab.title || ''),
        domain: isValidHostname(domain) ? domain : '',
        favIconUrl: clipString(tab.favIconUrl || '', FAVICON_URL_MAX),
        controlled: tabControllers.has(tab.id)
      };
    });

    sendResponse({ success: true, tabs: audibleTabs });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetControlledTabs(sendResponse) {
  try {
    const tabPromises = Array.from(tabControllers.entries()).map(async ([tabId, controller]) => {
      try {
        const tab = await chrome.tabs.get(tabId);
        return {
          id: tabId,
          title: clipString(tab.title || ''),
          domain: controller.domain || '',
          currentGain: controller.currentGain,
          isMuted: controller.isMuted
        };
      } catch (error) {
        // Falha transitória de tabs.get (ex.: race, permissão de incognito
        // negada momentaneamente) NÃO deve apagar o controller: a remoção
        // definitiva acontece em chrome.tabs.onRemoved.
        console.debug(`Controlled tab ${tabId} unavailable now: ${formatErrorMessage(error)}`);
        return null;
      }
    });

    const results = await Promise.all(tabPromises);
    const controlledTabs = results.filter(tab => tab !== null);

    sendResponse({ success: true, tabs: controlledTabs });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Grava o ganho memorizado por domínio. Silenciosa por design: é um efeito
// colateral do ajuste de volume, e falhar aqui não deve derrubar a operação
// principal, que é aplicar o volume que o usuário pediu.
async function persistDomainGain(domain, gain) {
  if (!isValidHostname(domain)) {
    return;
  }

  try {
    await chrome.storage.local.set({
      [`${DOMAIN_KEY_PREFIX}${domain}`]: {
        gain: clampVolume(gain),
        lastAccessed: Date.now()
      }
    });
  } catch (error) {
    console.debug(`Falha ao memorizar ganho de ${domain}: ${formatErrorMessage(error)}`);
  }
}

// Consulta o estado real em vez de confiar numa flag em memória: se o documento
// offscreen morrer (crash, encerramento pelo navegador), uma flag booleana
// continuaria `true` e toda operação seguinte falharia até o SW reiniciar.
async function ensureOffscreenCreated() {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Processamento de áudio para controle de volume'
    });
  } catch (error) {
    // Duas chamadas concorrentes: a perdedora recebe este erro e pode seguir,
    // porque o documento que ela queria já existe.
    if (!formatErrorMessage(error).includes('Only a single offscreen')) {
      throw error;
    }
  }
}

async function getDomainGainFromStorage(domain) {
  const key = `${DOMAIN_KEY_PREFIX}${domain}`;
  const result = await chrome.storage.local.get([key]);
  const value = result[key];

  // Suporte a formato legado (número) e novo formato (objeto com gain/lastAccessed)
  if (typeof value === 'object' && value !== null) {
    return value.gain;
  }
  return value;
}

function notifyPopupTabsUpdated() {
  if (popupIsOpen) {
    chrome.runtime.sendMessage({ action: 'tabsUpdated' }).catch(() => {
      popupIsOpen = false;
    });
  }
}

async function saveControllerState() {
  try {
    const controllersObj = {};
    for (const [tabId, controller] of tabControllers) {
      controllersObj[tabId] = controller;
    }

    await chrome.storage.local.set({
      tabControllers: controllersObj
    });
  } catch (error) {
    console.error('Erro ao salvar estado dos controladores:', error);
  }
}

async function restoreControllerState() {
  try {
    const result = await chrome.storage.local.get(['tabControllers']);

    if (!result.tabControllers) {
      return;
    }

    const storedControllers = Object.entries(result.tabControllers)
      .map(([tabId, controller]) => {
        const validTabId = Number.parseInt(tabId, 10);

        if (Number.isNaN(validTabId)) {
          return null;
        }

        return { tabId: validTabId, controller };
      })
      .filter(Boolean);

    // Só descarta do storage abas que comprovadamente não existem mais
    // (chrome.tabs.get rejeita). Silêncio momentâneo (audible=false) NÃO é
    // motivo para excluir: a aba ainda existe e o controller deve ser
    // restaurado para que o popup mostre o estado real ao reabrir.
    let prunedAny = false;
    const restorableTabs = (await Promise.all(storedControllers.map(async ({ tabId, controller }) => {
      try {
        await chrome.tabs.get(tabId);
        return { tabId, controller };
      } catch (error) {
        console.debug(`Aba ${tabId} não existe mais, removendo do estado: ${formatErrorMessage(error)}`);
        prunedAny = true;
        return null;
      }
    }))).filter(Boolean);

    if (restorableTabs.length > 0) {
      await ensureOffscreenCreated();

      await Promise.all(restorableTabs.map(async ({ tabId, controller }) => {
        tabControllers.set(tabId, controller);

        try {
          const restored = await chrome.runtime.sendMessage({
            action: 'restoreAudio',
            tabId,
            gain: controller.currentGain
          });
          assertOffscreenAck(restored, ErrorCodes.CAPTURE_FAILED);

          // Com processador vivo, a aba precisa permanecer muda: o som real sai
          // pelo documento offscreen. Reafirmar aqui cobre o caso de o mute ter
          // sido desfeito enquanto o SW estava morto.
          await setTabMuted(tabId, true);
        } catch (error) {
          // Sem áudio processado não há motivo para manter a aba muda — seria
          // silêncio sem contrapartida. Devolve o estado original e tira da
          // memória, preservando no storage para tentar de novo no próximo
          // wakeup (que remutará ao restaurar com sucesso).
          console.debug(`Falha ao restaurar áudio da aba ${tabId}: ${formatErrorMessage(error)}`);
          await setTabMuted(tabId, Boolean(controller.originalMuted));
          tabControllers.delete(tabId);
        }
      }));
    }

    // Só reescreve o storage se realmente houve poda de abas inexistentes.
    // Evita persistir uma "fotografia" volátil da memória que pode estar
    // incompleta (ex.: falha transitória de mensagem ao offscreen).
    if (prunedAny) {
      const pruned = {};
      for (const { tabId, controller } of restorableTabs) {
        pruned[tabId] = controller;
      }
      await chrome.storage.local.set({ tabControllers: pruned });
    }
  } catch (error) {
    console.error('Erro ao restaurar estado dos controladores:', error);
  }
}
