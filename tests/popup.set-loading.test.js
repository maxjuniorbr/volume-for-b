/**
 * Garante que o setLoading do popup gerencia somente o texto quando "loading" é
 * falso, sem reabilitar botões que devem permanecer desabilitados após uma
 * operação concluir (ex.: stopBtn após Parar com sucesso).
 *
 * Espelha a implementação de popup.js. Se o popup mudar, este teste precisa
 * ser atualizado em sincronia.
 */

import { describe, expect, it } from 'vitest';

function createMockElement(initial = {}) {
  return {
    disabled: false,
    textContent: '',
    ...initial
  };
}

// Replicação fiel do setLoading em popup.js
function setLoading(button, loading, { startBtn, stopBtn }) {
  if (loading) {
    button.disabled = true;
    button.textContent = 'Carregando...';
    return;
  }

  if (button === startBtn) {
    button.textContent = 'Iniciar';
  } else if (button === stopBtn) {
    button.textContent = 'Parar';
  }
}

describe('setLoading', () => {
  it('aplica disabled e texto de carregamento ao iniciar loading', () => {
    const startBtn = createMockElement();
    const stopBtn = createMockElement();

    setLoading(startBtn, true, { startBtn, stopBtn });

    expect(startBtn.disabled).toBe(true);
    expect(startBtn.textContent).toBe('Carregando...');
  });

  it('NÃO reabilita o botão ao terminar loading (regressão: stopBtn após Parar)', () => {
    const startBtn = createMockElement();
    // Simula estado pós-Parar: stopBtn já foi marcado como disabled por updateControlState
    const stopBtn = createMockElement({ disabled: true, textContent: 'Carregando...' });

    setLoading(stopBtn, false, { startBtn, stopBtn });

    // Bug original: setLoading reabilitaria o botão aqui.
    expect(stopBtn.disabled).toBe(true);
    expect(stopBtn.textContent).toBe('Parar');
  });

  it('restaura o texto correto do botão Iniciar sem mexer no disabled', () => {
    // Cenário: Iniciar falha em aba que não é mais audível -> updateControlState
    // deixou o botão como disabled. setLoading deve apenas restaurar o texto.
    const startBtn = createMockElement({ disabled: true, textContent: 'Carregando...' });
    const stopBtn = createMockElement();

    setLoading(startBtn, false, { startBtn, stopBtn });

    expect(startBtn.disabled).toBe(true);
    expect(startBtn.textContent).toBe('Iniciar');
  });

  it('restaura o texto do botão Iniciar quando volta a ficar habilitado', () => {
    // Cenário: Iniciar foi pressionado, falhou, mas a aba continua audível -
    // updateControlState reabilita o startBtn. setLoading restaura só o texto.
    const startBtn = createMockElement({ disabled: false, textContent: 'Carregando...' });
    const stopBtn = createMockElement();

    setLoading(startBtn, false, { startBtn, stopBtn });

    expect(startBtn.disabled).toBe(false);
    expect(startBtn.textContent).toBe('Iniciar');
  });
});
