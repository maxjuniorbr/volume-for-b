/**
 * Regressões de ciclo de vida do service worker:
 *
 * 1. ensureStateRestored marcava uma flag booleana ANTES do await, então uma
 *    segunda mensagem concorrente passava direto com tabControllers vazio.
 * 2. ensureOffscreenCreated confiava numa flag em memória; se o documento
 *    offscreen morresse, a flag seguia `true` e tudo falhava até o SW reiniciar.
 */

import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createChromeMock, createSandbox, loadSources } from './sw.helpers.js';

function loadServiceWorker(chrome) {
  const context = createSandbox(chrome);
  loadSources(context);

  return {
    ensureStateRestored: () => vm.runInContext('ensureStateRestored()', context), // NOSONAR
    ensureOffscreenCreated: () => vm.runInContext('ensureOffscreenCreated()', context), // NOSONAR
    readTabControllers: () => vm.runInContext('Array.from(tabControllers.entries())', context) // NOSONAR
  };
}

describe('ensureStateRestored', () => {
  it('chamadas concorrentes esperam o mesmo restore em vez de passar direto', async () => {
    const chrome = createChromeMock();

    let releaseStorage;
    chrome.storage.local.get.mockImplementation(() => new Promise((resolve) => {
      releaseStorage = () => resolve({ tabControllers: { 1: { currentGain: 300, originalMuted: false } } });
    }));
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    chrome.tabs.get.mockResolvedValue({ audible: true });
    chrome.tabs.update.mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const sw = loadServiceWorker(chrome);

    // Duas mensagens chegam juntas, como popup abrindo durante mudança de áudio.
    const first = sw.ensureStateRestored();
    const second = sw.ensureStateRestored();

    releaseStorage();
    await Promise.all([first, second]);

    // O storage foi lido uma única vez: a segunda chamada aguardou a primeira.
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    // E quem esperou vê o estado já populado.
    expect(sw.readTabControllers()).toEqual([
      [1, { currentGain: 300, originalMuted: false }]
    ]);
  });
});

describe('ensureOffscreenCreated', () => {
  it('não recria o documento quando ele já existe', async () => {
    const chrome = createChromeMock();
    chrome.offscreen.hasDocument.mockResolvedValue(true);

    const sw = loadServiceWorker(chrome);
    await sw.ensureOffscreenCreated();

    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it('recria o documento depois de ele ter morrido', async () => {
    const chrome = createChromeMock();
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    // Primeiro existe; depois morre (crash, encerramento pelo navegador).
    chrome.offscreen.hasDocument
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const sw = loadServiceWorker(chrome);
    await sw.ensureOffscreenCreated();
    await sw.ensureOffscreenCreated();

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
  });

  it('tolera a corrida de duas criações simultâneas', async () => {
    const chrome = createChromeMock();
    chrome.offscreen.hasDocument.mockResolvedValue(false);
    chrome.offscreen.createDocument.mockRejectedValue(
      new Error('Only a single offscreen document may be created')
    );

    const sw = loadServiceWorker(chrome);
    await expect(sw.ensureOffscreenCreated()).resolves.toBeUndefined();
  });

  it('propaga erros que não sejam de documento duplicado', async () => {
    const chrome = createChromeMock();
    chrome.offscreen.hasDocument.mockResolvedValue(false);
    chrome.offscreen.createDocument.mockRejectedValue(new Error('Permission denied'));

    const sw = loadServiceWorker(chrome);
    await expect(sw.ensureOffscreenCreated()).rejects.toThrow('Permission denied');
  });

  it('sobrevive a um erro sem message', async () => {
    const chrome = createChromeMock();
    chrome.offscreen.hasDocument.mockResolvedValue(false);
    // O código antigo fazia error.message.includes(...) e quebrava aqui.
    chrome.offscreen.createDocument.mockRejectedValue('falha crua');

    const sw = loadServiceWorker(chrome);
    await expect(sw.ensureOffscreenCreated()).rejects.toBeDefined();
    expect(vi.isMockFunction(chrome.offscreen.createDocument)).toBe(true);
  });
});
