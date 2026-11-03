import { describe, expect, it } from 'vitest';
import { classifyPdfError, hasPdfHeader } from '../../src/data/pdf-files';

const enc = (s: string) => new TextEncoder().encode(s);

describe('détection de PDF', () => {
  it('reconnaît l’en-tête, même précédé de texte', () => {
    expect(hasPdfHeader(enc('%PDF-1.7\n...'))).toBe(true);
    expect(hasPdfHeader(enc('﻿  courrier\n%PDF-1.4'))).toBe(true);
  });
  it('refuse le reste', () => {
    expect(hasPdfHeader(enc('bonjour'))).toBe(false);
    expect(hasPdfHeader(new Uint8Array())).toBe(false);
    expect(hasPdfHeader(enc(' '.repeat(2000) + '%PDF-'))).toBe(false);
  });
});

describe('classement des erreurs', () => {
  it('reconnaît les erreurs de pdf.js par leur nom', () => {
    expect(classifyPdfError({ name: 'PasswordException' })).toBe('password');
    expect(classifyPdfError({ name: 'InvalidPDFException' })).toBe('invalid');
    expect(classifyPdfError({ name: 'MissingPDFException' })).toBe('invalid');
    expect(classifyPdfError(new Error('Unsupported encryption algorithm'))).toBe('unsupportedEncryption');
    expect(classifyPdfError(new Error('boum'))).toBe('unknown');
    expect(classifyPdfError(null)).toBe('unknown');
  });
});
