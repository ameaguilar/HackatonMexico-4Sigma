import test from 'node:test';
import assert from 'node:assert/strict';
import { movementStatus, filterMovements, movementTotals, exampleMovements } from '../frontend/js/movements.js';

const records = [
  { reference: 'CV-A', amount: 12.10, status: 'confirmed', businessName: 'Café María', createdAt: '2026-11-14T12:00:00Z' },
  { reference: 'CV-B', amount: 2.20, status: 'pending', businessName: 'Pan de prueba', createdAt: '2026-11-14T13:00:00Z' },
  { reference: 'CV-C', amount: 30, status: 'expired', businessName: 'Tacos', createdAt: '2026-11-13T12:00:00Z' },
  { reference: 'CV-D', amount: 40, status: 'failed', businessName: 'Tacos', createdAt: '2026-11-12T12:00:00Z' },
  { reference: 'CV-E', amount: 0.20, status: 'confirmed', businessName: 'Café María', createdAt: '2026-11-14T14:00:00Z' }
];

test('etiqueta los estados y trata desconocidos como sin pago', () => {
  assert.deepEqual(movementStatus('confirmed'), { label: 'Confirmado' });
  assert.equal(movementStatus('pending').label, 'Pendiente');
  assert.equal(movementStatus('expired').label, 'Vencido');
  assert.equal(movementStatus('failed').label, 'Sin pago');
  assert.equal(movementStatus('unknown').label, 'Sin pago');
});

test('filtra confirmados, pendientes y movimientos sin pago', () => {
  assert.deepEqual(filterMovements(records, { status: 'confirmed' }).map(record => record.reference), ['CV-E', 'CV-A']);
  assert.deepEqual(filterMovements(records, { status: 'pending' }).map(record => record.reference), ['CV-B']);
  assert.deepEqual(filterMovements(records, { status: 'unpaid' }).map(record => record.reference), ['CV-C', 'CV-D']);
});

test('busca por referencia, importe y negocio sin distinguir acentos', () => {
  assert.equal(filterMovements(records, { query: 'cv-b' })[0].reference, 'CV-B');
  assert.equal(filterMovements(records, { query: '12.10' })[0].reference, 'CV-A');
  assert.equal(filterMovements(records, { query: 'cafe maria' }).length, 2);
  assert.equal(filterMovements(records, { query: 'inexistente' }).length, 0);
});

test('combina búsqueda y filtro y no modifica la colección original', () => {
  const before = structuredClone(records);
  assert.equal(filterMovements(records, { status: 'pending', query: 'Café' }).length, 0);
  assert.deepEqual(filterMovements(records).map(record => record.reference), ['CV-E', 'CV-B', 'CV-A', 'CV-C', 'CV-D']);
  assert.deepEqual(records, before);
});

test('suma importes por estado con precisión de centavos', () => {
  assert.deepEqual(movementTotals(records), { confirmed: 12.30, pending: 2.20 });
  assert.deepEqual(movementTotals([{ amount: 0.1, status: 'confirmed' }, { amount: 0.2, status: 'confirmed' }]), { confirmed: 0.3, pending: 0 });
  assert.deepEqual(movementTotals([{ amount: -1, status: 'confirmed' }, { amount: Infinity, status: 'pending' }]), { confirmed: 0, pending: 0 });
});

test('colecciones vacías o inválidas tienen una respuesta segura', () => {
  assert.deepEqual(filterMovements(null), []);
  assert.deepEqual(filterMovements([null, undefined]), []);
  assert.deepEqual(movementTotals(null), { confirmed: 0, pending: 0 });
});

test('preserva los cuatro ejemplos remotos y genera snapshots independientes', () => {
  const first = exampleMovements(), second = exampleMovements();
  assert.equal(first.length, 4);
  assert.equal(new Set(first.map(record => record.reference)).size, 4);
  assert.deepEqual(movementTotals(first), { confirmed: 305, pending: 85 });
  assert.equal(first.every(record => record.example && record.businessName === 'Tacos Juanita'), true);
  first[0].businessName = 'Otro nombre';
  assert.equal(second[0].businessName, 'Tacos Juanita');
  assert.ok(first.every(record => Number.isFinite(new Date(record.createdAt).getTime())));
});
