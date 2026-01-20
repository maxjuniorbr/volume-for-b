/**
 * Testes unitários para funções de validação de volume
 * Executar com: npm test
 */

import { describe, it, expect } from 'vitest';

// Função de validação de volume extraída para teste
function validateVolume(volume) {
    const parsed = parseInt(volume, 10);
    return Math.max(0, Math.min(600, Number.isNaN(parsed) ? 100 : parsed));
}

// Função de sanitização extraída para teste
function sanitizeString(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/[<>'"&]/g, function (match) {
            return {
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;',
                '&': '&amp;'
            }[match];
        })
        .trim()
        .substring(0, 500);
}

describe('validateVolume', () => {
    it('deve aceitar volume 0 corretamente', () => {
        expect(validateVolume(0)).toBe(0);
        expect(validateVolume('0')).toBe(0);
    });

    it('deve aceitar volume 100', () => {
        expect(validateVolume(100)).toBe(100);
        expect(validateVolume('100')).toBe(100);
    });

    it('deve aceitar volume máximo 600', () => {
        expect(validateVolume(600)).toBe(600);
        expect(validateVolume('600')).toBe(600);
    });

    it('deve limitar volume acima de 600', () => {
        expect(validateVolume(700)).toBe(600);
        expect(validateVolume(1000)).toBe(600);
    });

    it('deve limitar volume negativo a 0', () => {
        expect(validateVolume(-50)).toBe(0);
        expect(validateVolume('-100')).toBe(0);
    });

    it('deve usar 100 como fallback para valores inválidos', () => {
        expect(validateVolume('abc')).toBe(100);
        expect(validateVolume(undefined)).toBe(100);
        expect(validateVolume(null)).toBe(100);
        expect(validateVolume(NaN)).toBe(100);
    });

    it('deve aceitar valores decimais truncando para inteiro', () => {
        expect(validateVolume(150.7)).toBe(150);
        expect(validateVolume('250.9')).toBe(250);
    });
});

describe('sanitizeString', () => {
    it('deve escapar caracteres HTML perigosos', () => {
        expect(sanitizeString('<script>')).toBe('&lt;script&gt;');
        expect(sanitizeString('"test"')).toBe('&quot;test&quot;');
        expect(sanitizeString("'test'")).toBe('&#x27;test&#x27;');
        expect(sanitizeString('a & b')).toBe('a &amp; b');
    });

    it('deve limitar tamanho a 500 caracteres', () => {
        const longString = 'a'.repeat(1000);
        expect(sanitizeString(longString).length).toBe(500);
    });

    it('deve remover espaços em branco nas extremidades', () => {
        expect(sanitizeString('  test  ')).toBe('test');
    });

    it('deve retornar string vazia para não-strings', () => {
        expect(sanitizeString(123)).toBe('');
        expect(sanitizeString(null)).toBe('');
        expect(sanitizeString(undefined)).toBe('');
        expect(sanitizeString({})).toBe('');
    });
});
