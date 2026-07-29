import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { vi } from 'vitest';

export const swPath = path.resolve(import.meta.dirname, '..', 'sw.js');
export const swSource = readFileSync(swPath, 'utf8');
export const constantsPath = path.resolve(import.meta.dirname, '..', 'constants.js');
export const constantsSource = readFileSync(constantsPath, 'utf8');

export function createChromeMock() {
  return {
    runtime: {
      onStartup: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
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
      createDocument: vi.fn(),
      hasDocument: vi.fn().mockResolvedValue(false)
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

export function createSandbox(chrome) {
  return vm.createContext({
    chrome,
    console: {
      log: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    },
    URL,
    setTimeout,
    clearTimeout,
    // importScripts is unavailable in node:vm; stub it to a no-op and
    // inject constants.js source directly into the sandbox instead.
    importScripts: () => {}
  });
}

export function loadSources(context) {
  // Static file contents loaded into an isolated VM context — no user input involved.
  vm.runInContext(constantsSource, context, { filename: constantsPath }); // NOSONAR
  vm.runInContext(swSource, context, { filename: swPath }); // NOSONAR
}
