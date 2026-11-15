// Coordina dictado y lectura del navegador, sin grabaciones ni solicitudes propias.
const messages = {
  unsupported: 'Tu navegador no ofrece dictado integrado. Puedes escribir el cobro para continuar.',
  'not-allowed': 'No se permitió usar el micrófono. Revisa sus permisos o escribe el cobro.',
  'service-not-allowed': 'El dictado está bloqueado en este navegador. Puedes escribir el cobro.',
  'audio-capture': 'No se encontró un micrófono disponible. Puedes escribir el cobro.',
  'no-speech': 'No se escuchó ninguna frase. Intenta otra vez o escribe el cobro.',
  network: 'No fue posible conectar el servicio de dictado del navegador. Puedes escribir el cobro.',
  aborted: 'El dictado se interrumpió. Intenta otra vez o escribe el cobro.',
  'language-not-supported': 'El navegador no admite el dictado en español de México. Puedes escribir el cobro.',
  'constructor-failed': 'No fue posible preparar el micrófono. Puedes escribir el cobro.',
  'start-failed': 'No fue posible iniciar el dictado. Revisa el micrófono o escribe el cobro.',
  'stop-failed': 'No fue posible terminar el dictado. Intenta otra vez o escribe el cobro.',
  'recognition-failed': 'No fue posible captar la voz. Puedes escribir el cobro para continuar.',
  timeout: 'El micrófono no respondió. Intenta de nuevo o usa el dictado del teclado.'
};

export function createVoiceController({ host = globalThis, onState, onTranscript, onError } = {}) {
  let session = null;
  const clock = host.setTimeout?.bind(host) || setTimeout;
  const stopClock = host.clearTimeout?.bind(host) || clearTimeout;
  const notify = (callback, ...args) => {
    try { callback?.(...args); } catch { /* El estado del micrófono siempre debe liberarse. */ }
  };
  const emit = state => notify(onState, state);
  const isCurrent = current => session === current && !current.settled;

  function release(current, abort = false) {
    current.settled = true;
    if(current.timeout)stopClock(current.timeout);
    if(current.resultTimer)stopClock(current.resultTimer);
    if (session === current) session = null;
    const recognition = current.recognition;
    if (!recognition) return;
    try {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = recognition.onnomatch = null;
    } catch { /* La identidad de sesión también descarta cualquier evento tardío. */ }
    if (abort) {
      try { recognition.abort(); } catch { /* Algunas implementaciones ya están detenidas. */ }
    }
  }

  function fail(current, code) {
    if (current && !isCurrent(current)) return;
    if (current) release(current, true);
    emit(code === 'unsupported' ? 'unsupported' : 'error');
    notify(onError, messages[code] || messages['recognition-failed'], code);
  }

  function toggle() {
    if (session) {
      const current = session;
      if (current.processing) return true;
      current.processing = true;
      emit('processing');
      try { current.recognition.stop(); } catch { fail(current, 'stop-failed'); return false; }
      return true;
    }

    let Recognition;
    try { Recognition = host.SpeechRecognition || host.webkitSpeechRecognition; } catch {
      fail(null, 'constructor-failed');
      return false;
    }
    if (typeof Recognition !== 'function') {
      fail(null, 'unsupported');
      return false;
    }

    const current = { recognition: null, finals: new Map(), processing: false, settled: false, timeout: null, resultTimer: null };
    session = current;
    emit('requesting');
    if (!isCurrent(current)) return false;
    try { current.recognition = new Recognition(); } catch {
      fail(current, 'constructor-failed');
      return false;
    }
    const recognition = current.recognition;
    const finalize = (abort = false) => {
      if(!isCurrent(current))return;
      const transcript=[...current.finals.entries()].sort(([left],[right])=>left-right)
        .map(([,v])=>v).join(' ').replace(/\s+/g,' ').trim();
      if(!transcript){fail(current,'no-speech');return;}
      release(current,abort);emit('ready');notify(onTranscript,transcript);
    };
    try {
      recognition.lang = 'es-MX';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if(isCurrent(current) && !current.processing){
          emit('listening');
          if(current.timeout)stopClock(current.timeout);
          current.timeout=clock(()=>fail(current,'timeout'),30000);
        }
      };
      recognition.onresult = event => {
        if (!isCurrent(current)) return;
        const results = event?.results;
        const start = Number.isInteger(event?.resultIndex) && event.resultIndex >= 0 ? event.resultIndex : 0;
        for (let index = start; index < (results?.length || 0); index++) {
          const result = results[index];
          if (!result?.isFinal) continue;
          const transcript = result[0]?.transcript;
          current.finals.set(index, typeof transcript === 'string' ? transcript.trim() : '');
        }
        // Safari puede emitir un resultado final sin onend: no dejar el importe bloqueado.
        if(current.finals.size&&!current.resultTimer)current.resultTimer=clock(()=>finalize(true),1100);
      };
      recognition.onerror = event => {
        if (!isCurrent(current)) return;
        const code = typeof event?.error === 'string' ? event.error : 'recognition-failed';
        fail(current, code);
      };
      recognition.onnomatch = () => fail(current, 'no-speech');
      recognition.onend = () => { if(isCurrent(current))finalize(); };
      recognition.start();
      current.timeout=clock(()=>fail(current,'timeout'),15000);
      return true;
    } catch {
      fail(current, 'start-failed');
      return false;
    }
  }

  function cancel() {
    if (!session) return false;
    release(session, true);
    emit('ready');
    return true;
  }

  return { toggle, cancel, isActive: () => session !== null };
}

export function speakText(text, { host = globalThis, rate = 0.93 } = {}) {
  try {
    const phrase = String(text ?? '').trim();
    const synthesis = host.speechSynthesis;
    if (!phrase || typeof synthesis?.speak !== 'function' || typeof synthesis.cancel !== 'function'
      || typeof host.SpeechSynthesisUtterance !== 'function') return false;
    synthesis.cancel();
    const utterance = new host.SpeechSynthesisUtterance(phrase);
    utterance.lang = 'es-MX';
    utterance.rate = rate;
    synthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
