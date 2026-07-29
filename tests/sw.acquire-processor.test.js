/**
 * Regressão: acquireProcessor descartava a resposta de `processAudio`. O
 * offscreen sinaliza falha pelo corpo da resposta (não por rejeição), então a
 * aba era mutada, o controller registrado e o popup exibia "controlando" sem
 * que nenhum áudio fosse processado.
 */

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createChromeMock, createSandbox, loadSources } from './sw.helpers.js';

function loadServiceWorker(chrome) {
  const context = createSandbox(chrome);
  loadSources(context);

  return {
    handleStart: (tabId) => new Promise((resolve) => {
      const handler = vm.runInContext('handleStartVolumeControl', context); // NOSONAR
      handler(tabId, (response) => resolve(response)); // NOSONAR
    }),
    readTabControllers: () => vm.runInContext('Array.from(tabControllers.entries())', context) // NOSONAR
  };
}

function baseChrome() {
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
  chrome.tabCapture.getMediaStreamId.mockResolvedValue('stream-abc');
  return chrome;
}

function mutedStates(chrome) {
  return chrome.tabs.update.mock.calls.map(([, props]) => props.muted);
}

describe('acquireProcessor — resposta do offscreen', () => {
  it('falha e desmuta a aba quando processAudio responde success: false', async () => {
    const chrome = baseChrome();
    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: false };
      }
      if (msg.action === 'processAudio') {
        return { success: false, error: 'capture_failed' };
      }
      return { success: true };
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(1);

    expect(response.success).toBe(false);
    expect(response.error).toBe('capture_failed');
    // A aba foi mutada e precisa voltar ao estado original.
    expect(mutedStates(chrome)).toEqual([true, false]);
    expect(sw.readTabControllers()).toEqual([]);
  });

  it('falha e desmuta a aba quando ninguém responde (sendMessage resolve undefined)', async () => {
    const chrome = baseChrome();
    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: false };
      }
      // Offscreen ausente: nenhum listener chama sendResponse.
      return undefined;
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(1);

    expect(response.success).toBe(false);
    expect(mutedStates(chrome)).toEqual([true, false]);
    expect(sw.readTabControllers()).toEqual([]);
  });

  it('falha sem mutar a aba quando o setGain do processador existente não confirma', async () => {
    const chrome = baseChrome();
    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: true };
      }
      return { success: false, error: 'no_processor' };
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(1);

    expect(response.success).toBe(false);
    // Nunca chegou a mutar: o caminho de reuso acontece antes do mute.
    expect(mutedStates(chrome)).toEqual([]);
    expect(sw.readTabControllers()).toEqual([]);
  });

  it('registra o controller quando o offscreen confirma o processamento', async () => {
    const chrome = baseChrome();
    chrome.runtime.sendMessage.mockImplementation(async (msg) => {
      if (msg.action === 'checkProcessor') {
        return { exists: false };
      }
      return { success: true };
    });

    const sw = loadServiceWorker(chrome);
    const response = await sw.handleStart(1);

    expect(response).toEqual({ success: true, domain: 'example.com', defaultGain: 100 });
    expect(mutedStates(chrome)).toEqual([true]);
    expect(sw.readTabControllers()).toEqual([
      [1, { domain: 'example.com', originalMuted: false, currentGain: 100, isMuted: false }]
    ]);
  });
});
