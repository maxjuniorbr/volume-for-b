import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const swPath = path.resolve(import.meta.dirname, '..', 'sw.js');
const swSource = readFileSync(swPath, 'utf8');
const constantsPath = path.resolve(import.meta.dirname, '..', 'constants.js');
const constantsSource = readFileSync(constantsPath, 'utf8');

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

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
    // importScripts is unavailable in node:vm; the SW relies on it to load
    // constants.js. We inject the constants source into the same sandbox
    // and stub importScripts to a no-op.
    importScripts: () => {}
  });

  // Load the checked-in worker source into an isolated test sandbox.
  vm.runInContext(constantsSource, context, { filename: constantsPath });
  vm.runInContext(swSource, context, { filename: swPath });

  return {
    context,
    // Static expressions expose worker internals without any user-controlled input.
    restoreControllerState: () => vm.runInContext('restoreControllerState()', context),
    readTabControllers: () => vm.runInContext('Array.from(tabControllers.entries())', context)
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

  it('mantém no estado salvo apenas abas restauradas com sucesso', async () => {
    const chrome = createChromeMock();
    const successfulController = { currentGain: 125 };
    const failedController = { currentGain: 180 };

    chrome.storage.local.get.mockResolvedValue({
      tabControllers: {
        1: successfulController,
        2: { currentGain: 90 },
        3: { currentGain: 70 },
        4: failedController
      }
    });
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.offscreen.createDocument.mockResolvedValue(undefined);

    chrome.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 1 || tabId === 4) {
        return { audible: true };
      }

      if (tabId === 2) {
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
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      tabControllers: {
        1: successfulController
      }
    });
    expect(sw.readTabControllers()).toEqual([[1, successfulController]]);
  });
});
