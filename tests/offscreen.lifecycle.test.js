/**
 * Regressões no documento offscreen:
 *
 * - toTabId colapsava entradas inválidas para 0, criando uma chave real no mapa
 *   em vez de rejeitar a operação.
 * - O documento nunca era fechado: com zero processadores, o AudioContext ficava
 *   aberto indefinidamente consumindo recursos.
 * - initAudioContext não aguardava resume(), então o grafo podia ser montado com
 *   o contexto suspenso — nós conectados que não produzem som.
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

  it('rejeita restoreAudio com tabId inválido', async () => {
    const offscreen = loadOffscreen();

    const response = await offscreen.call('handleRestoreAudio', [0, 150]);

    expect(response).toEqual({ success: false, error: 'internal_error' });
    expect(offscreen.chrome.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
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
