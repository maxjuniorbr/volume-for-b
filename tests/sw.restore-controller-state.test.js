import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createChromeMock, createSandbox, loadSources } from './sw.helpers.js';

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function loadServiceWorker(chrome) {
  const context = createSandbox(chrome);
  loadSources(context);

  return {
    context,
    // Static expressions expose worker internals without any user-controlled input.
    restoreControllerState: () => vm.runInContext('restoreControllerState()', context), // NOSONAR
    readTabControllers: () => vm.runInContext('Array.from(tabControllers.entries())', context) // NOSONAR
  };
}

describe('restoreControllerState', () => {
  it('consulta abas em paralelo e cria o offscreen apenas uma vez', async () => {
    const chrome = createChromeMock();
    const firstTab = createDeferred();
    const secondTab = createDeferred();
    const controllerA = { currentGain: 110 };
    const controllerB = { currentGain: 135 };

    chrome.storage.local.get.mockResolvedValue({
      tabControllers: {
        1: controllerA,
        2: controllerB
      }
    });
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    chrome.tabs.get.mockImplementation((tabId) => {
      if (tabId === 1) {
        return firstTab.promise;
      }

      if (tabId === 2) {
        return secondTab.promise;
      }

      throw new Error(`Unexpected tab ${tabId}`);
    });

    const sw = loadServiceWorker(chrome);
    const restorePromise = sw.restoreControllerState();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(chrome.tabs.get).toHaveBeenCalledTimes(2);

    firstTab.resolve({ audible: true });
    secondTab.resolve({ audible: true });

    await restorePromise;

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'restoreAudio',
      tabId: 1,
      gain: 110
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'restoreAudio',
      tabId: 2,
      gain: 135
    });
  });

  it('mantém abas momentaneamente inaudíveis e só remove do storage abas que não existem mais', async () => {
    const chrome = createChromeMock();
    const successfulController = { currentGain: 125 };
    const inaudibleController = { currentGain: 90 };
    const failedRestoreController = { currentGain: 180 };

    chrome.storage.local.get.mockResolvedValue({
      tabControllers: {
        1: successfulController,
        2: inaudibleController,
        3: { currentGain: 70 },
        4: failedRestoreController
      }
    });
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);

    chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 1 || tabId === 4) {
        return { audible: true };
      }

      if (tabId === 2) {
        // Aba existe mas está em silêncio momentâneo: deve ser preservada.
        return { audible: false };
      }

      throw new Error('Tab not found');
    });

    chrome.runtime.sendMessage.mockImplementation(async ({ tabId }) => {
      if (tabId === 4) {
        throw new Error('Restore failed');
      }

      return { success: true };
    });

    const sw = loadServiceWorker(chrome);

    await sw.restoreControllerState();

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    // Storage reescrito apenas para podar a aba 3 (inexistente). Abas 1, 2 e 4
    // permanecem persistidas: 4 falhou transitoriamente e deve poder ser
    // tentada de novo no próximo wakeup do service worker.
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      tabControllers: {
        1: successfulController,
        2: inaudibleController,
        4: failedRestoreController
      }
    });
    // Memória contém apenas as abas cuja restauração de áudio foi bem-sucedida.
    expect(sw.readTabControllers()).toEqual([
      [1, successfulController],
      [2, inaudibleController]
    ]);
  });
});
