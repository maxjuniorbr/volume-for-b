/**
 * Regressão: handleStopVolumeControl aguardava a confirmação do offscreen antes
 * de desmutar a aba. Se o offscreen estivesse morto, a rejeição caía no catch
 * com a aba ainda mutada e o controller preso no mapa — o usuário não tinha
 * como recuperar o som, nem repetindo a operação.
 */

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createChromeMock, createSandbox, loadSources } from './sw.helpers.js';

function loadServiceWorker(chrome) {
  const context = createSandbox(chrome);
  loadSources(context);

  return {
    seedController: (tabId, controller) => {
      context.__seed = { tabId, controller };
      vm.runInContext('tabControllers.set(__seed.tabId, __seed.controller);', context); // NOSONAR
    },
    handleStop: (tabId) => new Promise((resolve) => {
      const handler = vm.runInContext('handleStopVolumeControl', context); // NOSONAR
      handler(tabId, (response) => resolve(response)); // NOSONAR
    }),
    readTabControllers: () => vm.runInContext('Array.from(tabControllers.entries())', context) // NOSONAR
  };
}

describe('handleStopVolumeControl', () => {
  it('desmuta e libera a aba mesmo se o offscreen não responder', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.tabs.update.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockRejectedValue(new Error('Could not establish connection'));

    const sw = loadServiceWorker(chrome);
    sw.seedController(4, { domain: 'example.com', originalMuted: false, currentGain: 300, isMuted: false });

    const response = await sw.handleStop(4);

    expect(response).toEqual({ success: true });
    expect(chrome.tabs.update).toHaveBeenCalledWith(4, { muted: false });
    expect(sw.readTabControllers()).toEqual([]);
  });

  it('restaura o mute original da aba, não um valor fixo', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.tabs.update.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const sw = loadServiceWorker(chrome);
    // Aba que o usuário já tinha mutado por conta própria antes de controlar.
    sw.seedController(8, { domain: 'example.com', originalMuted: true, currentGain: 100, isMuted: false });

    await sw.handleStop(8);

    expect(chrome.tabs.update).toHaveBeenCalledWith(8, { muted: true });
  });

  it('reporta erro quando a aba não está sob controle', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStop(99);

    expect(response).toEqual({ success: false, error: 'tab_not_controlled' });
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });
});
