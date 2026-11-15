import test from 'node:test';
import assert from 'node:assert/strict';
import { processVoiceCommand } from '../frontend/js/voice-commands.js';
import { demoQrSvg } from '../frontend/js/demo-qr.js';

const sum = result => result.items.reduce((total, item) => total + item.cents, 0);

test('interpreta importes numéricos, hablados y centavos en MXN', () => {
  for (const [phrase, cents] of [
    ['Cobra 85 pesos', 8500], ['Cobra ciento cincuenta pesos', 15000],
    ['Cobra mil doscientos treinta y cinco pesos', 123500],
    ['Cobra ochenta pesos con cincuenta centavos', 8050],
    ['Cobra 85,50 pesos mexicanos', 8550], ['85.50 MXN', 8550],
    ['cobra de 25 pesos', 2500]
  ]) {
    const result = processVoiceCommand(phrase);
    assert.equal(result.error, false, phrase);
    assert.equal(sum(result), cents, phrase);
    assert.equal(result.confirm, false);
  }
});

test('productos y comandos conservan un carrito acumulativo sin mutar la entrada', () => {
  const source = Object.freeze([Object.freeze({ label: 'Venta anterior', cents: 1000 })]);
  let result = processVoiceCommand('Dos cafés de cuarenta pesos y tres panes de treinta pesos', source);
  assert.equal(sum(result), 18000);
  assert.equal(source[0].cents, 1000);
  assert.equal(source.length, 1);
  result = processVoiceCommand('Agrega veinticinco pesos', result.items);
  assert.equal(sum(result), 20500);
  result = processVoiceCommand('Resta cinco pesos', result.items);
  assert.equal(sum(result), 20000);
  result = processVoiceCommand('Quita el último producto', result.items);
  assert.equal(sum(result), 20500);
  const total = processVoiceCommand('¿Cuánto llevo?', result.items);
  assert.equal(sum(total), 20500);
  assert.match(total.message, /205\.00/);
  const confirmed = processVoiceCommand('Confirmar', result.items);
  assert.equal(confirmed.confirm, true);
  assert.equal(sum(confirmed), 20500);
  const cancelled = processVoiceCommand('Cancelar', result.items);
  assert.deepEqual(cancelled.items, []);
  assert.equal(cancelled.confirm, false);
  assert.equal(result.items.length, 4);
});

test('rechaza otras monedas sin cambiar el carrito', () => {
  const items = Object.freeze([Object.freeze({ label: 'Venta', cents: 8500 })]);
  for (const phrase of ['Cobra 10 dólares', 'Agrega 10 USD', 'Cobra 10 euros', 'Dos cafés de 10 pesos argentinos', 'Cancelar 10 US$', 'Cobra 10 €']) {
    const result = processVoiceCommand(phrase, items);
    assert.equal(result.error, true, phrase);
    assert.equal(result.confirm, false);
    assert.deepEqual(result.items, items);
    assert.notEqual(result.items, items);
  }
});

test('valida límites, descuentos, confirmación vacía y frases desconocidas', () => {
  const maximum = processVoiceCommand('Cobra 999999.99 pesos');
  assert.equal(sum(maximum), 99999999);
  assert.equal(processVoiceCommand('Agrega un peso', maximum.items).error, true);
  assert.equal(processVoiceCommand('Cobra 1000000 pesos').error, true);
  assert.equal(processVoiceCommand('Confirmar').error, true);
  assert.equal(processVoiceCommand('Resta 85 pesos', [{ label: 'Venta', cents: 8500 }]).error, true);
  assert.equal(processVoiceCommand('El cielo está despejado').error, true);
  assert.equal(processVoiceCommand('').error, true);
  assert.equal(processVoiceCommand('Cobra 0 pesos').error, true);
  assert.equal(processVoiceCommand('Cobra -1 pesos').error, true);
});

test('el QR codifica solo texto de demostración e importe MXN', () => {
  const first = demoQrSvg(180);
  assert.match(first, /^<svg /);
  assert.match(first, /viewBox="0 0 37 37"/);
  assert.match(first, /<desc>COBRAVOZ-DEMO\|MXN:180\.00\|NO-PAGAR<\/desc>/);
  assert.match(first, /<path d="M/);
  assert.notEqual(first, demoQrSvg(181));
  assert.equal(first, demoQrSvg('180.00'));
  assert.ok(demoQrSvg(0.01).length > 1000);
  assert.ok(demoQrSvg(999999.99).length > 1000);
  for (const value of [0, -1, 0.001, 1000000, NaN, Infinity, '', null]) assert.throws(() => demoQrSvg(value), RangeError);
});


test('cálculo aritmético natural y suma acumulativa sin requerir expresiones técnicas', () => {
  let cart = processVoiceCommand('suma 20');
  cart = processVoiceCommand('más 50', cart.items);
  cart = processVoiceCommand('más 80', cart.items);
  assert.equal(sum(cart), 15000);
  for (const [phrase, cents] of [
    ['suma 20, más 50, más 80', 15000], ['multiplica 3 por 25', 7500],
    ['resta 150 menos 20', 13000], ['divide 100 entre 4', 2500],
    ['dos cafés a 45', 9000]
  ]) {
    const result = processVoiceCommand(phrase);
    assert.equal(result.error, false, phrase);
    assert.equal(sum(result), cents, phrase);
  }
  const unchanged = processVoiceCommand('divide 100 entre 0', cart.items);
  assert.equal(unchanged.error, true);
  assert.equal(sum(unchanged), 15000);
});


test('dictado natural sin signos y expresiones comunes actualiza el total', () => {
  const sum = result => result.items.reduce((n, x) => n + x.cents, 0);
  for(const [phrase,total] of [
    ['Súmale 20',2000],['Agrégale 20',2000],
    ['20 y 50 y 80',15000],['suma 20 50 y 80',15000],
    ['suma veinte y cincuenta y ochenta',15000],
    ['suma 20 más 50 más 80',15000],
    ['dos tacos a 25 y tres aguas a 20',11000]
  ]){
    const r=processVoiceCommand(phrase);
    assert.equal(r.error,false,phrase);
    assert.equal(sum(r),total,phrase);
  }
  let sale=processVoiceCommand('suma 20');
  for(const phrase of ['y 50','más 80'])sale=processVoiceCommand(phrase,sale.items);
  assert.equal(sum(sale),15000);
});
