import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceController, speakText } from '../frontend/js/voice.js';

function mockHost(options = {}) {
  const instances = [];
  class Recognition {
    constructor() {
      if (options.constructorThrows) throw new Error('constructor');
      this.calls = { start: 0, stop: 0, abort: 0 };
      instances.push(this);
    }
    start() { this.calls.start++; if (options.startThrows) throw new Error('start'); }
    stop() { this.calls.stop++; if (options.stopThrows) throw new Error('stop'); }
    abort() { this.calls.abort++; if (options.abortThrows) throw new Error('abort'); }
    emit(name, event = {}) { this['on' + name]?.(event); }
  }
  const host = { [options.prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition']: Recognition };
  return { host, instances };
}
function fixture(options = {}) {
  const { host, instances } = mockHost(options);
  const states = [], transcripts = [], errors = [];
  const controller = createVoiceController({ host,
    onState: state => states.push(state), onTranscript: transcript => transcripts.push(transcript),
    onError: (message, code) => errors.push({ message, code })
  });
  return { host, instances, states, transcripts, errors, controller };
}
const result = (transcript, isFinal = true) => Object.assign([{ transcript }], { isFinal });

test('configura dictado mexicano con API normal o prefijada', async context => {
  for (const prefixed of [false, true]) await context.test(String(prefixed), () => {
    const f = fixture({ prefixed });
    assert.equal(f.controller.isActive(), false);
    assert.equal(f.controller.toggle(), true);
    const recognition = f.instances[0];
    assert.equal(recognition.lang, 'es-MX');
    assert.equal(recognition.continuous, false);
    assert.equal(recognition.interimResults, false);
    assert.equal(recognition.maxAlternatives, 1);
    assert.deepEqual(f.states, ['requesting']);
    recognition.emit('start');
    assert.deepEqual(f.states, ['requesting', 'listening']);
    f.controller.cancel();
  });
});

test('sin API ofrece escritura y detecta soporte de nuevo al reintentar', () => {
  const f = fixture();
  delete f.host.SpeechRecognition;
  assert.equal(f.controller.toggle(), false);
  assert.equal(f.controller.isActive(), false);
  assert.deepEqual(f.states, ['unsupported']);
  assert.equal(f.errors[0].code, 'unsupported');
  assert.match(f.errors[0].message, /escribir/);
  f.host.webkitSpeechRecognition = mockHost().host.SpeechRecognition;
  assert.equal(f.controller.toggle(), true);
  assert.equal(f.controller.isActive(), true);
  f.controller.cancel();
});

test('acumula finales por índice y emite una sola frase al finalizar', () => {
  const f = fixture();
  f.controller.toggle();
  const recognition = f.instances[0];
  recognition.emit('start');
  recognition.emit('result', { resultIndex: 0, results: [result('Cobra'), result('ochenta', false)] });
  recognition.emit('result', { resultIndex: 1, results: [result('Cobra'), result('85 pesos')] });
  recognition.emit('result', { resultIndex: 0, results: [result('Cobra'), result('85 pesos')] });
  assert.deepEqual(f.transcripts, []);
  const lateEnd = recognition.onend;
  recognition.emit('end');
  assert.deepEqual(f.transcripts, ['Cobra 85 pesos']);
  assert.equal(f.controller.isActive(), false);
  assert.equal(f.states.at(-1), 'ready');
  assert.equal(recognition.onresult, null);
  lateEnd();
  assert.deepEqual(f.transcripts, ['Cobra 85 pesos']);
});

test('stop pasa a processing una vez y espera el resultado final', () => {
  const f = fixture();
  f.controller.toggle();
  const recognition = f.instances[0];
  recognition.emit('start');
  assert.equal(f.controller.toggle(), true);
  assert.equal(f.controller.toggle(), true);
  assert.equal(recognition.calls.stop, 1);
  assert.equal(f.controller.isActive(), true);
  assert.equal(f.states.at(-1), 'processing');
  recognition.emit('result', { results: [result('Cobra 85 pesos')] });
  recognition.emit('end');
  assert.deepEqual(f.transcripts, ['Cobra 85 pesos']);
});

test('constructor y start que fallan nunca propagan y permiten reintentar', async context => {
  for (const [option, code] of [['constructorThrows', 'constructor-failed'], ['startThrows', 'start-failed']]) {
    await context.test(option, () => {
      const options = { [option]: true }, f = fixture(options);
      assert.doesNotThrow(() => assert.equal(f.controller.toggle(), false));
      assert.equal(f.controller.isActive(), false);
      assert.equal(f.errors[0].code, code);
      if (option === 'startThrows') assert.equal(f.instances[0].calls.abort, 1);
      options[option] = false;
      assert.equal(f.controller.toggle(), true);
      f.controller.cancel();
    });
  }
});

test('stop que falla libera callbacks incluso si abort también falla', () => {
  const f = fixture({ stopThrows: true, abortThrows: true });
  f.controller.toggle();
  const recognition = f.instances[0], lateResult = recognition.onresult;
  assert.doesNotThrow(() => assert.equal(f.controller.toggle(), false));
  assert.equal(f.controller.isActive(), false);
  assert.equal(f.errors[0].code, 'stop-failed');
  assert.equal(recognition.calls.abort, 1);
  assert.equal(recognition.onend, null);
  lateResult({ results: [result('Cobra 500 pesos')] });
  assert.deepEqual(f.transcripts, []);
});

test('error de permisos limpia la sesión de inmediato sin esperar onend', () => {
  const f = fixture();
  f.controller.toggle();
  const recognition = f.instances[0], lateEnd = recognition.onend;
  recognition.emit('start');
  recognition.emit('error', { error: 'not-allowed' });
  assert.equal(f.controller.isActive(), false);
  assert.equal(f.states.at(-1), 'error');
  assert.equal(f.errors[0].code, 'not-allowed');
  assert.match(f.errors[0].message, /permiso/);
  assert.equal(recognition.calls.abort, 1);
  lateEnd();
  assert.equal(f.errors.length, 1);
});

test('fin vacío, resultados intermedios y no-match ofrecen reintento escrito', async context => {
  for (const mode of ['empty', 'interim', 'nomatch']) await context.test(mode, () => {
    const f = fixture();
    f.controller.toggle();
    const recognition = f.instances[0];
    if (mode === 'interim') recognition.emit('result', { results: [result('incompleto', false)] });
    recognition.emit(mode === 'nomatch' ? 'nomatch' : 'end');
    assert.equal(f.controller.isActive(), false);
    assert.equal(f.errors[0].code, 'no-speech');
    assert.match(f.errors[0].message, /escribe/);
    assert.deepEqual(f.transcripts, []);
  });
});

test('cancel descarta eventos tardíos y protege el siguiente dictado', () => {
  const f = fixture({ abortThrows: true });
  f.controller.toggle();
  const first = f.instances[0];
  const stale = { start: first.onstart, result: first.onresult, error: first.onerror, end: first.onend };
  assert.doesNotThrow(() => assert.equal(f.controller.cancel(), true));
  assert.equal(f.controller.cancel(), false);
  assert.equal(first.onresult, null);
  f.controller.toggle();
  const second = f.instances[1];
  stale.start();
  stale.result({ results: [result('Cobra 999 pesos')] });
  stale.error({ error: 'not-allowed' });
  stale.end();
  assert.equal(f.controller.isActive(), true);
  assert.deepEqual(f.transcripts, []);
  assert.deepEqual(f.errors, []);
  second.emit('result', { results: [result('Cobra 25 pesos')] });
  second.emit('end');
  assert.deepEqual(f.transcripts, ['Cobra 25 pesos']);
});

test('resultados vacíos o malformados no propagan excepciones', () => {
  const f = fixture();
  f.controller.toggle();
  const recognition = f.instances[0];
  assert.doesNotThrow(() => recognition.emit('result', {}));
  assert.doesNotThrow(() => recognition.emit('result', { results: [result(undefined)] }));
  recognition.emit('end');
  assert.equal(f.errors[0].code, 'no-speech');
});

test('lectura cancela la anterior, configura es-MX y acepta velocidad opcional', () => {
  const events = [], spoken = [];
  const host = {
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; events.push('create'); } },
    speechSynthesis: { cancel() { events.push('cancel'); }, speak(utterance) { events.push('speak'); spoken.push(utterance); } }
  };
  assert.equal(speakText('  Total: 85 pesos  ', { host }), true);
  assert.deepEqual(events, ['cancel', 'create', 'speak']);
  assert.equal(spoken[0].text, 'Total: 85 pesos');
  assert.equal(spoken[0].lang, 'es-MX');
  assert.equal(spoken[0].rate, 0.93);
  assert.equal(speakText('Otra lectura', { host, rate: 0.8 }), true);
  assert.equal(spoken[1].rate, 0.8);
});

test('lectura sin soporte, vacía o con fallo de síntesis devuelve false', async context => {
  assert.equal(speakText('Hola', { host: {} }), false);
  assert.equal(speakText('', { host: {} }), false);
  for (const stage of ['cancel', 'constructor', 'speak']) await context.test(stage, () => {
    const host = {
      SpeechSynthesisUtterance: class { constructor() { if (stage === 'constructor') throw new Error(stage); } },
      speechSynthesis: {
        cancel() { if (stage === 'cancel') throw new Error(stage); },
        speak() { if (stage === 'speak') throw new Error(stage); }
      }
    };
    assert.doesNotThrow(() => assert.equal(speakText('Hola', { host }), false));
  });
});
