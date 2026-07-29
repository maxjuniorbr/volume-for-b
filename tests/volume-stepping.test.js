/**
 * Lógica dos botões de −5% / +5%.
 *
 * O passo alinha ao múltiplo de 5 em vez de somar/subtrair cru: o slider tem
 * step=1, então o valor pode estar em 103% depois de um arraste. Somar 5 ali
 * carregaria o desalinhamento para sempre (103 → 108 → 113).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const constantsSource = readFileSync(
  path.resolve(import.meta.dirname, '..', 'constants.js'),
  'utf8'
);

const context = vm.createContext({});
vm.runInContext(constantsSource, context); // NOSONAR
const steppedVolume = vm.runInContext('steppedVolume', context); // NOSONAR

const down = (v) => steppedVolume(v, -1);
const up = (v) => steppedVolume(v, 1);

describe('steppedVolume — valores já alinhados', () => {
  it('desce de 5 em 5', () => {
    expect(down(100)).toBe(95);
    expect(down(95)).toBe(90);
    expect(down(300)).toBe(295);
  });

  it('sobe de 5 em 5', () => {
    expect(up(100)).toBe(105);
    expect(up(105)).toBe(110);
    expect(up(595)).toBe(600);
  });
});

describe('steppedVolume — valores fora da grade', () => {
  it('descer alinha para baixo, sem carregar o resto', () => {
    expect(down(103)).toBe(100);
    expect(down(101)).toBe(100);
    expect(down(99)).toBe(95);
  });

  it('subir alinha para cima', () => {
    expect(up(103)).toBe(105);
    expect(up(101)).toBe(105);
    expect(up(99)).toBe(100);
  });

  it('repetir o passo mantém a grade', () => {
    expect(down(down(down(103)))).toBe(90);
    expect(up(up(up(103)))).toBe(115);
  });
});

describe('steppedVolume — limites', () => {
  it('não passa do mínimo', () => {
    expect(down(5)).toBe(0);
    expect(down(3)).toBe(0);
    expect(down(0)).toBe(0);
  });

  it('não passa do máximo', () => {
    expect(up(600)).toBe(600);
    expect(up(598)).toBe(600);
  });

  it('descer de 598 chega em 595, não em 593', () => {
    expect(down(598)).toBe(595);
  });
});

describe('steppedVolume — entradas atípicas', () => {
  it('aceita string, como vem de slider.value', () => {
    expect(down('100')).toBe(95);
    expect(up('100')).toBe(105);
  });

  it('trata valor inválido como padrão antes de aplicar o passo', () => {
    expect(down('abc')).toBe(95);
    expect(up(undefined)).toBe(105);
  });

  it('normaliza valores fora da faixa antes do passo', () => {
    expect(down(9999)).toBe(595);
    expect(up(-40)).toBe(5);
  });
});

describe('estado dos botões de passo', () => {
  // Espelha a regra aplicada em updateVolumeDisplay() do popup.js.
  const stepDisabled = (isControlling, volume) => ({
    down: !isControlling || volume <= 0,
    up: !isControlling || volume >= 600
  });

  it('ambos desabilitados quando não há controle ativo', () => {
    expect(stepDisabled(false, 300)).toEqual({ down: true, up: true });
  });

  it('ambos habilitados no meio da faixa', () => {
    expect(stepDisabled(true, 300)).toEqual({ down: false, up: false });
  });

  it('descer desabilita no mínimo', () => {
    expect(stepDisabled(true, 0)).toEqual({ down: true, up: false });
  });

  it('subir desabilita no máximo', () => {
    expect(stepDisabled(true, 600)).toEqual({ down: false, up: true });
  });
});
