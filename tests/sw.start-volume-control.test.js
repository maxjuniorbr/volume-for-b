/**
 * Testes do fluxo handleStartVolumeControl em sw.js, focando no fallback
 * de "active stream" que reaproveita um processador já existente no offscreen.
 */

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createChromeMock, createSandbox, loadSources } from './sw.helpers.js';

function loadServiceWorker(chrome) {
  const context = createSandbox(chrome);
  loadSources(context);

  return {
    context,
    handleStart: (tabId) => new Promise((resolve) => {
      vm.runInContext('globalThis.__lastResponse = null;', context); // NOSONAR
      const handler = vm.runInContext('handleStartVolumeControl', context); // NOSONAR
      handler(tabId, (response) => resolve(response)); // NOSONAR
    }),
    readTabControllers: () => vm.runInContext('Array.from(tabControllers.entries())', context) // NOSONAR
  };
}

describe('handleStartVolumeControl — fallback de active stream', () => {
  it('reaproveita processador existente quando getMediaStreamId falha com "active stream"', async () => {
    const chrome = createChromeMock();

    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    chrome.tabs.get.mockResolvedValue({
      id: 1,
      audible: true,
      url: 'https://example.com/page',
      mutedInfo: { muted: false }
    });
    chrome.tabs.update.mockResolvedValue(undefined);
    chrome.tabCapture.getMediaStreamId.mockRejectedValue(new Error('Cannot capture a tab with an active stream'));

    // checkProcessor responde "exists: false", forçando o caminho que tenta capturar.
    // Depois do erro, o fallback chama setGain — que precisa retornar success.
    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: false };
      }
      if (msg.action === 'setGain') {
        return { success: true };
      }
      return { success: true };
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(1);

    expect(response).toEqual({
      success: true,
      domain: 'example.com',
      defaultGain: 100
    });

    // Garantir que setGain foi chamado pelo fallback
    const setGainCalls = chrome.runtime.sendMessage.mock.calls
      .filter(([msg]) => msg.action === 'setGain');
    expect(setGainCalls).toHaveLength(1);
    expect(setGainCalls[0][0]).toEqual({ action: 'setGain', tabId: 1, gain: 100 });

    // Estado deve refletir a aba como controlada
    expect(sw.readTabControllers()).toEqual([
      [1, { domain: 'example.com', originalMuted: false, currentGain: 100, isMuted: false }]
    ]);
  });

  it('reporta falha quando o fallback não encontra processador no offscreen', async () => {
    const chrome = createChromeMock();

    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    chrome.tabs.get.mockResolvedValue({
      id: 1,
      audible: true,
      url: 'https://example.com/page',
      mutedInfo: { muted: false }
    });
    chrome.tabs.update.mockResolvedValue(undefined);
    chrome.tabCapture.getMediaStreamId.mockRejectedValue(new Error('Cannot capture a tab with an active stream'));

    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: false };
      }
      if (msg.action === 'setGain') {
        return { success: false, error: 'Nenhum processador encontrado para esta aba' };
      }
      return { success: true };
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(1);

    expect(response.success).toBe(false);
    // Estado NÃO deve ter sido populado com aba "fantasma"
    expect(sw.readTabControllers()).toEqual([]);
  });

  it('preserva ganho 0 salvo para o domínio em vez de voltar para 100', async () => {
    const chrome = createChromeMock();

    chrome.storage.local.get.mockResolvedValue({
      'domain_muted.example.com': { gain: 0, lastAccessed: Date.now() }
    });
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    chrome.tabs.get.mockResolvedValue({
      id: 2,
      audible: true,
      url: 'https://muted.example.com/page',
      mutedInfo: { muted: false }
    });
    chrome.tabs.update.mockResolvedValue(undefined);
    chrome.tabCapture.getMediaStreamId.mockResolvedValue('stream-1');
    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: false };
      }
      return { success: true };
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(2);

    expect(response.success).toBe(true);
    expect(response.defaultGain).toBe(0);
  });

  it('reutiliza processador existente quando checkProcessor reporta exists: true', async () => {
    const chrome = createChromeMock();

    chrome.storage.local.get.mockResolvedValue({
      domain_example_com: { gain: 250, lastAccessed: Date.now() }
    });
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    chrome.tabs.get.mockResolvedValue({
      id: 5,
      audible: true,
      url: 'https://news.site.com/article',
      mutedInfo: { muted: false }
    });

    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: true };
      }
      if (msg.action === 'setGain') {
        return { success: true };
      }
      return { success: true };
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(5);

    expect(response.success).toBe(true);
    expect(response.domain).toBe('news.site.com');

    // Não deve tentar capturar novo stream quando já existe processador
    expect(chrome.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
  });
});
