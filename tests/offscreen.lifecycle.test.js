/**
 * Regressões no documento offscreen:
 *
 * - toTabId colapsava entradas inválidas para 0, criando uma chave real no mapa
 *   em vez de rejeitar a operação.
 * - O documento nunca era fechado: com zero processadores, o AudioContext ficava
 *   aberto indefinidamente consumindo recursos.
 * - initAudioContext não aguardava resume(), então o grafo podia ser montado com
 *   o contexto suspenso — nós conectados que não produzem som.
 * - handleRestoreAudio chamava chrome.tabCapture.getMediaStreamId, que não existe
 *   em documentos offscreen: "Cannot read properties of undefined". A captura é
 *   responsabilidade do service worker; aqui o mediaStreamId só é consumido.
 */

import { describe, expect, it } from 'vitest';
import { createAudioContextMock, loadOffscreen } from './offscreen.helpers.js';

describe('toTabId — validação do identificador de aba', () => {
  it('rejeita processAudio com tabId inválido em vez de usar a chave 0', async () => {
    const offscreen = loadOffscreen();

    const response = await offscreen.call('handleProcessAudio', ['não-é-número', 'stream-1', 200]);

    expect(response).toEqual({ success: false, error: 'internal_error' });
    expect(offscreen.processorCount()).toBe(0);
  });

  it('checkProcessor responde false para tabId inválido', async () => {
    const offscreen = loadOffscreen();

    const response = await offscreen.call('handleCheckProcessor', [null]);

    expect(response).toEqual({ exists: false });
  });

  it('aceita tabId numérico em string, como chega por mensagem', async () => {
    const offscreen = loadOffscreen();

    const response = await offscreen.call('handleProcessAudio', ['7', 'stream-1', 200]);

    expect(response).toEqual({ success: true });
    expect(offscreen.processorCount()).toBe(1);
  });
});

describe('captura de áudio', () => {
  it('consome o mediaStreamId recebido, sem depender de chrome.tabCapture', async () => {
    const offscreen = loadOffscreen();

    // O mock de chrome não tem tabCapture, igual ao ambiente real do offscreen.
    expect(offscreen.chrome.tabCapture).toBeUndefined();

    const response = await offscreen.call('handleProcessAudio', [5, 'stream-do-sw', 200]);

    expect(response).toEqual({ success: true });
    expect(offscreen.context.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: 'stream-do-sw'
        }
      },
      video: false
    });
  });

  it('não expõe nenhum handler que tente capturar por conta própria', () => {
    const offscreen = loadOffscreen();
    const listener = offscreen.chrome.runtime.onMessage.addListener.mock.calls[0][0];

    // 'restoreAudio' foi removido: era o único caminho que chamava tabCapture.
    const handled = listener(
      { action: 'restoreAudio', tabId: 1, gain: 100 },
      { id: 'test-extension-id' },
      () => {}
    );

    expect(handled).toBeUndefined();
  });
});

describe('ciclo de vida do documento offscreen', () => {
  it('fecha o documento quando o último processador é removido', async () => {
    const offscreen = loadOffscreen();
    offscreen.seedProcessor(1);

    const response = await offscreen.call('handleStopProcessing', [1]);
    expect(response).toEqual({ success: true });

    // O fechamento é agendado para depois da entrega da resposta.
    expect(offscreen.context.close).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(offscreen.context.close).toHaveBeenCalledTimes(1);
  });

  it('mantém o documento aberto enquanto houver outra aba sendo processada', async () => {
    const offscreen = loadOffscreen();
    offscreen.seedProcessor(1);
    offscreen.seedProcessor(2);

    await offscreen.call('handleStopProcessing', [1]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(offscreen.processorCount()).toBe(1);
    expect(offscreen.context.close).not.toHaveBeenCalled();
  });

  it('não fecha o documento quando o stop falha por não haver processador', async () => {
    const offscreen = loadOffscreen();
    offscreen.seedProcessor(1);

    const response = await offscreen.call('handleStopProcessing', [99]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response).toEqual({ success: false, error: 'no_processor' });
    expect(offscreen.context.close).not.toHaveBeenCalled();
  });
});

describe('initAudioContext', () => {
  it('aguarda o resume antes de montar o grafo de áudio', async () => {
    const audioContext = createAudioContextMock({ initialState: 'suspended' });
    const offscreen = loadOffscreen({ audioContext });

    const response = await offscreen.call('handleProcessAudio', [3, 'stream-1', 300]);

    expect(response).toEqual({ success: true });
    expect(audioContext.resume).toHaveBeenCalledTimes(1);
    // O grafo só pode ser montado com o contexto já rodando.
    expect(audioContext.state).toBe('running');
    expect(audioContext.createMediaStreamSource).toHaveBeenCalledTimes(1);
  });

  it('não chama resume quando o contexto já está rodando', async () => {
    const audioContext = createAudioContextMock({ initialState: 'running' });
    const offscreen = loadOffscreen({ audioContext });

    await offscreen.call('handleProcessAudio', [4, 'stream-1', 100]);

    expect(audioContext.resume).not.toHaveBeenCalled();
  });
});
