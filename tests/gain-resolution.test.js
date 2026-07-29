/**
 * Regressão: o fallback era `valor || VOLUME_DEFAULT`. Como VOLUME_MIN é 0 e o
 * slider permite 0, um domínio deliberadamente silenciado voltava a 100%.
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
const resolveGain = vm.runInContext('resolveGain', context); // NOSONAR

describe('resolveGain', () => {
  it('preserva o zero em vez de trocá-lo pelo padrão', () => {
    expect(resolveGain(0)).toBe(0);
  });

  it('preserva valores válidos dentro da faixa', () => {
    expect(resolveGain(1)).toBe(1);
    expect(resolveGain(250)).toBe(250);
    expect(resolveGain(600)).toBe(600);
  });

  it('cai para o padrão quando o valor está genuinamente ausente', () => {
    expect(resolveGain(undefined)).toBe(100);
    expect(resolveGain(null)).toBe(100);
    expect(resolveGain(Number.NaN)).toBe(100);
  });

  it('não aceita string como número válido', () => {
    // Storage sempre devolve número; string aqui indica dado corrompido.
    expect(resolveGain('300')).toBe(100);
  });

  it('mantém o clamp da faixa permitida', () => {
    expect(resolveGain(-50)).toBe(0);
    expect(resolveGain(5000)).toBe(600);
  });

  it('rejeita infinitos', () => {
    expect(resolveGain(Number.POSITIVE_INFINITY)).toBe(100);
    expect(resolveGain(Number.NEGATIVE_INFINITY)).toBe(100);
  });
});
