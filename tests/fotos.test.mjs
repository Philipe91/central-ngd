import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, PHOTO_CHANNELS, isPhoto, kindError } from '../lib/kinds.mjs';
import { migrateContent } from '../lib/store.mjs';

test('tipos: fotos só na Meta e no LinkedIn, com 1 ou 2–10 fotos', () => {
  assert.deepEqual(KINDS, ['video', 'image', 'carousel']);
  assert.deepEqual(PHOTO_CHANNELS, ['instagram', 'facebook', 'linkedin']);
  assert.ok(isPhoto('carousel') && isPhoto('image') && !isPhoto('video') && !isPhoto(undefined));
  assert.equal(kindError('video', ['youtube', 'tiktok'], null), '');
  assert.equal(kindError('gif', [], null), 'Tipo de conteúdo inválido.');
  assert.match(kindError('image', ['instagram', 'youtube'], 1), /Instagram, no Facebook e no LinkedIn/);
  assert.equal(kindError('image', ['instagram'], 1), '');
  assert.equal(kindError('image', ['instagram'], 2), 'Envie 1 foto.');
  assert.equal(kindError('carousel', ['facebook'], 1), 'O carrossel precisa de 2 a 10 fotos.');
  assert.equal(kindError('carousel', ['facebook'], 11), 'O carrossel precisa de 2 a 10 fotos.');
  assert.equal(kindError('carousel', ['facebook', 'linkedin'], 10), '');
  assert.equal(kindError('carousel', ['instagram'], null), '');
});

test('migração marca conteúdo antigo como vídeo sem fotos', () => {
  const c = migrateContent({ id: 'x', channels: ['youtube'], scheduledAt: '2026-10-05T21:00:00.000Z', status: 'planned' });
  assert.equal(c.kind, 'video'); assert.deepEqual(c.images, []); assert.equal(c.status, 'planned');
  assert.equal(migrateContent({ id: 'y', kind: 'carousel', images: [{ file: 'a.jpg' }], channels: [] }).kind, 'carousel');
});
