/**
 * Regressão: handleSetVolume e handleMuteTab alteravam o controller apenas em
 * memória. Como o SW é morto por idle a cada 30s, restoreControllerState
 * reenviava ao offscreen o gain lido do storage — revertendo silenciosamente
 * o ajuste do usuário. Ambos precisam persistir.
 */

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createChromeMock, createSandbox, loadSources } from './sw.helpers.js';

function loadServiceWorker(chrome) {
  const context = createSandbox(chrome);
  loadSources(context);

  return {
    seedController: (tabId, controller) => {
      vm.runInContext('globalThis.__seed = null;', context); // NOSONAR
      context.__seed = { tabId, controller };
      vm.runInContext('tabControllers.set(__seed.tabId, __seed.controller);', context); // NOSONAR
    },
    call: (fnName, args) => new Promise((resolve) => {
      const handler = vm.runInContext(fnName, context); // NOSONAR
      handler(...args, (response) => resolve(response)); // NOSONAR
    })
  };
}

function savedControllers(chrome) {
  const call = chrome.storage.local.set.mock.calls
    .map(([payload]) => payload)
    .findLast((payload) => payload && 'tabControllers' in payload);
  return call?.tabControllers;
}

describe('persistência do estado do controller', () => {
  it('handleSetVolume grava o novo gain no storage', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const sw = loadServiceWorker(chrome);
    sw.seedController(7, { domain: 'example.com', originalMuted: false, currentGain: 100, isMuted: false });

    const response = await sw.call('handleSetVolume', [7, 400]);

    expect(response).toEqual({ success: true });
    expect(savedControllers(chrome)).toEqual({
      7: { domain: 'example.com', originalMuted: false, currentGain: 400, isMuted: false }
    });
  });

  it('handleSetVolume persiste o valor já normalizado por clampVolume', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const sw = loadServiceWorker(chrome);
    sw.seedController(7, { domain: 'example.com', originalMuted: false, currentGain: 100, isMuted: false });

    await sw.call('handleSetVolume', [7, 9999]);

    expect(savedControllers(chrome)[7].currentGain).toBe(600);
  });

  it('handleMuteTab grava o novo estado de mute no storage', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const sw = loadServiceWorker(chrome);
    sw.seedController(3, { domain: 'example.com', originalMuted: false, currentGain: 250, isMuted: false });

    const response = await sw.call('handleMuteTab', [3, true]);

    expect(response).toEqual({ success: true });
    expect(savedControllers(chrome)).toEqual({
      3: { domain: 'example.com', originalMuted: false, currentGain: 250, isMuted: true }
    });
  });

  it('não grava nada quando a aba não está sob controle', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);

    const sw = loadServiceWorker(chrome);
    const response = await sw.call('handleSetVolume', [99, 300]);

    expect(response.success).toBe(false);
    expect(savedControllers(chrome)).toBeUndefined();
  });
});
