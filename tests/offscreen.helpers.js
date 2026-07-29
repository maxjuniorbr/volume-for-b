import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { vi } from 'vitest';

export const offscreenPath = path.resolve(import.meta.dirname, '..', 'offscreen.js');
export const offscreenSource = readFileSync(offscreenPath, 'utf8');
export const constantsPath = path.resolve(import.meta.dirname, '..', 'constants.js');
export const constantsSource = readFileSync(constantsPath, 'utf8');

function createAudioNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 }
  };
}

export function createAudioContextMock({ initialState = 'running' } = {}) {
  const resume = vi.fn(async function resumeContext() {
    this.state = 'running';
  });

  return {
    state: initialState,
    resume,
    destination: createAudioNode(),
    createMediaStreamSource: vi.fn(() => createAudioNode()),
    createGain: vi.fn(() => createAudioNode()),
    createDynamicsCompressor: vi.fn(() => createAudioNode())
  };
}

export function createStreamMock() {
  return { getTracks: () => [{ stop: vi.fn() }] };
}

export function loadOffscreen({ audioContext = createAudioContextMock() } = {}) {
  const chrome = {
    runtime: { onMessage: { addListener: vi.fn() }, id: 'test-extension-id' },
    tabCapture: { getMediaStreamId: vi.fn() }
  };

  const context = vm.createContext({
    chrome,
    console: { log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    setTimeout,
    clearTimeout,
    close: vi.fn(),
    // Função regular, não arrow: offscreen.js usa `new AudioContext()` e arrow
    // functions não são construtíveis. Retornar um objeto sobrescreve o `this`.
    AudioContext: vi.fn(function AudioContextMock() {
      return audioContext;
    }),
    navigator: {
      mediaDevices: { getUserMedia: vi.fn(async () => createStreamMock()) }
    }
  });

  vm.runInContext(constantsSource, context, { filename: constantsPath }); // NOSONAR
  vm.runInContext(offscreenSource, context, { filename: offscreenPath }); // NOSONAR

  return {
    chrome,
    context,
    audioContext,
    call: (fnName, args) => new Promise((resolve) => {
      const handler = vm.runInContext(fnName, context); // NOSONAR
      const result = handler(...args, (response) => resolve(response)); // NOSONAR
      // Handlers síncronos já resolveram via callback; os async devolvem promise.
      if (result && typeof result.then === 'function') {
        result.then(() => undefined);
      }
    }),
    processorCount: () => vm.runInContext('audioProcessors.size', context), // NOSONAR
    seedProcessor: (tabId) => {
      context.__seedId = tabId;
      vm.runInContext('audioProcessors.set(__seedId, { stop() {}, setGain() {}, setMute() {} });', context); // NOSONAR
    }
  };
}
