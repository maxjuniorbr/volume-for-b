/**
 * Testes do fluxo handleStartVolumeControl em sw.js, focando no fallback
 * de "active stream" que reaproveita um processador já existente no offscreen.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const swPath = path.resolve(import.meta.dirname, '..', 'sw.js');
const swSource = readFileSync(swPath, 'utf8');
const constantsPath = path.resolve(import.meta.dirname, '..', 'constants.js');
const constantsSource = readFileSync(constantsPath, 'utf8');

function createChromeMock() {
  return {
    runtime: {
      onStartup: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
      onSuspend: { addListener: vi.fn() },
      sendMessage: vi.fn(),
      id: 'test-extension-id'
    },
    tabs: {
      onUpdated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
      get: vi.fn(),
      query: vi.fn(),
      update: vi.fn()
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn()
      }
    },
    offscreen: {
      createDocument: vi.fn()
    },
    tabCapture: {
      getMediaStreamId: vi.fn()
    },
    alarms: {
      onAlarm: { addListener: vi.fn() },
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn()
    }
  };
}

function loadServiceWorker(chrome) {
  const context = vm.createContext({
    chrome,
    console: {
      log: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    },
    URL,
    setTimeout,
    clearTimeout,
    // The real SW uses importScripts('constants.js'); in tests we no-op it
    // because we inject the constants source directly into the sandbox below.
    importScripts: () => {}
  });

  // Load shared constants first, then the worker source. Both run in the
  // same isolated sandbox so the worker can reference the constants.
  vm.runInContext(constantsSource, context, { filename: constantsPath });
  vm.runInContext(swSource, context, { filename: swPath });

  return {
    context,
    handleStart: (tabId) => new Promise((resolve) => {
      vm.runInContext('globalThis.__lastResponse = null;', context);
      const handler = vm.runInContext('handleStartVolumeControl', context);
      handler(tabId, (response) => resolve(response));
    }),
    readTabControllers: () => vm.runInContext('Array.from(tabControllers.entries())', context)
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
