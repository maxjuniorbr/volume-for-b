/**
 * Regressão: o controller guardava o domínio do instante em que o controle
 * começou. Navegando para outro site na mesma aba, o ganho continuava sendo
 * gravado no domínio anterior — o popup enviava o domínio lido do DOM, que
 * ficava obsoleto. Agora o SW rastreia a navegação e grava usando o controller.
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
    onUpdated: (tabId, changeInfo) => {
      const listener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
      return listener(tabId, changeInfo, {});
    },
    setVolume: (tabId, volume) => new Promise((resolve) => {
      const handler = vm.runInContext('handleSetVolume', context); // NOSONAR
      handler(tabId, volume, (response) => resolve(response)); // NOSONAR
    }),
    readController: (tabId) => {
      context.__read = tabId;
      return vm.runInContext('tabControllers.get(__read)', context); // NOSONAR
    }
  };
}

function domainWrites(chrome) {
  return chrome.storage.local.set.mock.calls
    .map(([payload]) => payload)
    .filter((payload) => payload && Object.keys(payload).some((k) => k.startsWith('domain_')));
}

describe('rastreamento de domínio da aba controlada', () => {
  it('atualiza o domínio do controller quando a aba navega', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);

    const sw = loadServiceWorker(chrome);
    sw.seedController(1, { domain: 'antigo.com', originalMuted: false, currentGain: 200, isMuted: false });

    sw.onUpdated(1, { url: 'https://novo.com/pagina' });

    expect(sw.readController(1).domain).toBe('novo.com');
  });

  it('grava o ganho no domínio novo, não no anterior', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const sw = loadServiceWorker(chrome);
    sw.seedController(1, { domain: 'antigo.com', originalMuted: false, currentGain: 100, isMuted: false });

    sw.onUpdated(1, { url: 'https://novo.com/pagina' });
    await sw.setVolume(1, 350);

    expect(domainWrites(chrome)).toEqual([
      { 'domain_novo.com': { gain: 350, lastAccessed: expect.any(Number) } }
    ]);
  });

  it('ignora navegação de abas que não estão sob controle', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);

    const sw = loadServiceWorker(chrome);
    sw.onUpdated(42, { url: 'https://qualquer.com/' });

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('não regrava o estado quando o domínio não mudou', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);

    const sw = loadServiceWorker(chrome);
    sw.seedController(1, { domain: 'mesmo.com', originalMuted: false, currentGain: 100, isMuted: false });

    // Navegação interna no mesmo host (SPA trocando de rota).
    sw.onUpdated(1, { url: 'https://mesmo.com/outra-rota' });

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('não grava memória de domínio quando o hostname é inválido', async () => {
    const chrome = createChromeMock();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const sw = loadServiceWorker(chrome);
    // Aba interna do navegador: extractSafeHostname devolve ''.
    sw.seedController(1, { domain: '', originalMuted: false, currentGain: 100, isMuted: false });

    const response = await sw.setVolume(1, 400);

    expect(response).toEqual({ success: true });
    expect(domainWrites(chrome)).toEqual([]);
  });
});
