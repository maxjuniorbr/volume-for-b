/**
 * Testes unitários para a lógica de habilitação dos botões do popup.
 *
 * Espelha o comportamento de updateControlState() em popup.js:
 *   - startBtn fica habilitado apenas quando a aba é audível e ainda não estamos controlando.
 *   - stopBtn / muteBtn / resetBtn / volumeSlider ficam habilitados apenas enquanto controlamos.
 */

import { describe, expect, it } from 'vitest';

// Reflete a lógica de updateControlState() do popup.js
function computeButtonDisabledState({ isControlling, isCurrentTabAudible }) {
  return {
    startBtn: isControlling || !isCurrentTabAudible,
    stopBtn: !isControlling,
    muteBtn: !isControlling,
    resetBtn: !isControlling,
    volumeSlider: !isControlling
  };
}

describe('computeButtonDisabledState', () => {
  it('aba sem áudio e sem controle: tudo desabilitado', () => {
    const state = computeButtonDisabledState({
      isControlling: false,
      isCurrentTabAudible: false
    });

    expect(state).toEqual({
      startBtn: true,
      stopBtn: true,
      muteBtn: true,
      resetBtn: true,
      volumeSlider: true
    });
  });

  it('aba com áudio e sem controle: apenas Iniciar habilitado', () => {
    const state = computeButtonDisabledState({
      isControlling: false,
      isCurrentTabAudible: true
    });

    expect(state).toEqual({
      startBtn: false,
      stopBtn: true,
      muteBtn: true,
      resetBtn: true,
      volumeSlider: true
    });
  });

  it('aba sob controle: Stop/Mute/Reset/slider habilitados, Iniciar desabilitado', () => {
    const state = computeButtonDisabledState({
      isControlling: true,
      isCurrentTabAudible: true
    });

    expect(state).toEqual({
      startBtn: true,
      stopBtn: false,
      muteBtn: false,
      resetBtn: false,
      volumeSlider: false
    });
  });

  it('aba sob controle mas atualmente sem áudio: Iniciar continua desabilitado, controles ativos', () => {
    // Cenário possível quando a mídia foi pausada mas o controlador ainda existe
    const state = computeButtonDisabledState({
      isControlling: true,
      isCurrentTabAudible: false
    });

    expect(state).toEqual({
      startBtn: true,
      stopBtn: false,
      muteBtn: false,
      resetBtn: false,
      volumeSlider: false
    });
  });
});
