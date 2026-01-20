const tabControllers = new Map();
let offscreenCreated = false;
let popupIsOpen = false;

// Função de sanitização para prevenir XSS
function sanitizeString(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>'"&]/g, function(match) {
      return {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      }[match];
    })
    .trim()
    .substring(0, 500); // Limita tamanho para prevenir overflow
}

chrome.runtime.onStartup.addListener(restoreControllerState);
chrome.runtime.onInstalled.addListener(restoreControllerState);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.audible !== undefined && popupIsOpen) {
    notifyPopupTabsUpdated();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (tabControllers.has(tabId)) {
    tabControllers.delete(tabId);
    await saveControllerState();
  }
  
  if (popupIsOpen) {
    notifyPopupTabsUpdated();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  const handlers = {
    'startVolumeControl': () => handleStartVolumeControl(message.tabId, sendResponse),
    'stopVolumeControl': () => handleStopVolumeControl(message.tabId, sendResponse),
    'setVolume': () => handleSetVolume(message.tabId, message.volume, sendResponse),
    'muteTab': () => handleMuteTab(message.tabId, message.muted, sendResponse),
    'getAudibleTabs': () => handleGetAudibleTabs(sendResponse),
    'getControlledTabs': () => handleGetControlledTabs(sendResponse),
    'getDomainGain': () => handleGetDomainGain(message.domain, sendResponse),
    'saveDomainGain': () => handleSaveDomainGain(message.domain, message.gain, sendResponse),
    'popupOpened': () => handlePopupOpened(sendResponse),
    'popupClosed': () => handlePopupClosed(sendResponse)
  };

  if (handlers[action]) {
    handlers[action]();
    return true;
  }
});

async function handleStartVolumeControl(tabId, sendResponse) {
  try {
    if (tabControllers.has(tabId)) {
      sendResponse({ success: false, error: 'Aba já está sendo controlada' });
      return;
    }

    const tab = await chrome.tabs.get(tabId);
    if (!tab.audible) {
      sendResponse({ success: false, error: 'Aba não está reproduzindo áudio' });
      return;
    }

    await ensureOffscreenCreated();

    const mediaStreamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    await chrome.tabs.update(tabId, { muted: true });

    const domain = new URL(tab.url).hostname;
    const domainGain = await getDomainGainFromStorage(domain);

    await chrome.runtime.sendMessage({
      action: 'processAudio',
      tabId,
      mediaStreamId,
      gain: domainGain || 100
    });

    tabControllers.set(tabId, {
      domain,
      originalMuted: tab.mutedInfo.muted,
      currentGain: domainGain || 100,
      isMuted: false
    });

    await saveControllerState();

    sendResponse({
      success: true,
      domain,
      defaultGain: domainGain || 100
    });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleStopVolumeControl(tabId, sendResponse) {
  try {
    const controller = tabControllers.get(tabId);
    if (!controller) {
      sendResponse({ success: false, error: 'Aba não está sendo controlada' });
      return;
    }

    await chrome.runtime.sendMessage({
      action: 'stopProcessing',
      tabId
    });

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
      sendResponse({ success: false, error: 'Aba não está sendo controlada' });
      return;
    }

    // Validação de volume
    const validVolume = Math.max(0, Math.min(600, parseInt(volume) || 100));

    await chrome.runtime.sendMessage({
      action: 'setGain',
      tabId,
      gain: validVolume
    });

    controller.currentGain = validVolume;
    sendResponse({ success: true });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleMuteTab(tabId, muted, sendResponse) {
  try {
    const controller = tabControllers.get(tabId);
    if (!controller) {
      sendResponse({ success: false, error: 'Aba não está sendo controlada' });
      return;
    }

    await chrome.runtime.sendMessage({
      action: 'setMute',
      tabId,
      muted
    });

    controller.isMuted = muted;
    sendResponse({ success: true });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetAudibleTabs(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ audible: true });
    const audibleTabs = tabs.map(tab => {
      // Validação e sanitização de URL
      let domain = '';
      try {
        const url = new URL(tab.url);
        domain = url.hostname;
      } catch (error) {
        domain = 'unknown';
      }
      
      return {
        id: tab.id,
        title: sanitizeString(tab.title || 'Sem título'),
        url: tab.url,
        domain: sanitizeString(domain),
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
    const controlledTabs = [];

    for (const [tabId, controller] of tabControllers.entries()) {
      try {
        const tab = await chrome.tabs.get(tabId);
        controlledTabs.push({
          id: tabId,
          title: sanitizeString(tab.title || 'Sem título'),
          domain: sanitizeString(controller.domain),
          currentGain: controller.currentGain,
          isMuted: controller.isMuted
        });
      } catch (error) {
        tabControllers.delete(tabId);
      }
    }

    sendResponse({ success: true, tabs: controlledTabs });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetDomainGain(domain, sendResponse) {
  try {
    const sanitizedDomain = sanitizeString(domain);
    if (!sanitizedDomain || sanitizedDomain.length < 3) {
      sendResponse({ success: true, gain: 100 });
      return;
    }
    
    const gain = await getDomainGainFromStorage(sanitizedDomain);
    sendResponse({ success: true, gain: gain || 100 });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSaveDomainGain(domain, gain, sendResponse) {
  try {
    // Validação de entrada
    const sanitizedDomain = sanitizeString(domain);
    const validGain = Math.max(0, Math.min(600, parseInt(gain) || 100));
    
    if (!sanitizedDomain || sanitizedDomain.length < 3) {
      sendResponse({ success: false, error: 'Domínio inválido' });
      return;
    }
    
    await chrome.storage.local.set({ [`domain_${sanitizedDomain}`]: validGain });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function ensureOffscreenCreated() {
  if (offscreenCreated) return;

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Processamento de áudio para controle de volume'
    });
    offscreenCreated = true;
  } catch (error) {
    if (error.message.includes('Only a single offscreen')) {
      offscreenCreated = true;
    } else {
      throw error;
    }
  }
}

async function getDomainGainFromStorage(domain) {
  const result = await chrome.storage.local.get([`domain_${domain}`]);
  return result[`domain_${domain}`];
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabControllers.has(tabId)) {
    chrome.runtime.sendMessage({
      action: 'stopProcessing',
      tabId
    }).catch(() => { });

    tabControllers.delete(tabId);
  }
});

// Funções para gerenciar estado do popup
function handlePopupOpened(sendResponse) {
  popupIsOpen = true;
  sendResponse({ success: true });
}

function handlePopupClosed(sendResponse) {
  popupIsOpen = false;
  if (sendResponse) {
    sendResponse({ success: true });
  }
}

// Notificar popup sobre mudanças nas abas
function notifyPopupTabsUpdated() {
  if (popupIsOpen) {
    chrome.runtime.sendMessage({ action: 'tabsUpdated' }).catch(() => {
      // Popup pode ter fechado, atualizar estado
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
    
    if (result.tabControllers) {
      for (const [tabId, controller] of Object.entries(result.tabControllers)) {
        try {
          const tab = await chrome.tabs.get(parseInt(tabId));
          if (tab && tab.audible) {
            tabControllers.set(parseInt(tabId), controller);
            
            await ensureOffscreenCreated();
            await chrome.runtime.sendMessage({
              action: 'restoreAudio',
              tabId: parseInt(tabId),
              gain: controller.currentGain
            }).catch(() => {
              tabControllers.delete(parseInt(tabId));
            });
          }
        } catch (error) {
          console.log(`Aba ${tabId} não existe mais, removendo do estado`);
        }
      }
      
      await saveControllerState();
    }
  } catch (error) {
    console.error('Erro ao restaurar estado dos controladores:', error);
  }
}
