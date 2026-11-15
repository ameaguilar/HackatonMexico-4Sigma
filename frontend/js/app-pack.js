/* CobraVoz bootstrap resiliente V12: generado a partir de módulos versionados.
 * No procesa cobros bancarios; QR y SMS de demostración.
 * Evita bloqueos de carga por grafos ESM o peticiones a vistas parciales.
 */
"use strict";
// frontend/js/payments.js
const {money,interpret,evaluate,updateCalculation,qrPattern}=(()=>{
// Utilidades puras del prototipo de cobros; no generan solicitudes bancarias.
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const symbols = { '×': '*', '÷': '/', '−': '-' };
const normalize = value => String(value ?? '').replace(/[×÷−]/g, char => symbols[char]).replace(/,/g, '.');
const roundMoney = value => Number(value.toFixed(2));

function money(value) {
  const amount = Number(value);
  return currency.format(Number.isFinite(amount) ? amount : 0);
}

// Reconoce los ejemplos de V1; el usuario siempre debe confirmar el importe.
function interpret(text) {
  const original = String(text ?? '').trim();
  const normalized = original.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/,/g, '.');
  const quantities = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const quantity = '(\\d+(?:\\.\\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
  const pattern = new RegExp('(?:^|\\s)' + quantity + '\\s+([a-z]+(?:\\s+[a-z]+){0,2}?)\\s+(?:de|a)\\s+\\$?\\s*(\\d+(?:\\.\\d+)?)(?![\\d.])', 'g');
  const items = [];
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const count = Number(match[1]) || quantities[match[1]];
    const price = Number(match[3]);
    if (Number.isFinite(count) && Number.isFinite(price) && count > 0 && price > 0) {
      items.push({ count, name: match[2].trim(), price });
    }
  }
  if (items.length) {
    const total = items.reduce((sum, item) => sum + item.count * item.price, 0);
    if (!Number.isFinite(total)) return null;
    return {
      amount: roundMoney(total),
      description: items.map(item => `${item.count} ${item.name} × ${money(item.price)}`).join(' + ')
    };
  }
  const amountMatch = normalized.match(/(?:^|\s)(?:cobra(?:r)?|cobro|total|son|importe|paga(?:r)?|por)\s+(?:de\s+)?\$?\s*(\d+(?:\.\d+)?)(?![\d.])(?:\s*(?:pesos|mxn))?\s*$/)
    || normalized.match(/^\$?\s*(\d+(?:\.\d+)?)\s*(?:pesos|mxn)?\s*$/);
  const amount = amountMatch ? Number(amountMatch[1]) : NaN;
  return Number.isFinite(amount) ? { amount: roundMoney(amount), description: original } : null;
}

// Evalúa cuatro operaciones con precedencia y operandos con signo, sin eval().
function evaluate(expression) {
  const plain = normalize(expression).replace(/\s/g, '');
  const operand = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)/y;
  let index = 0;
  const nextNumber = () => {
    operand.lastIndex = index;
    const match = operand.exec(plain);
    if (!match) return null;
    index = operand.lastIndex;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  };
  const first = nextNumber();
  if (first === null) return null;
  const values = [first];
  const operators = [];
  while (index < plain.length) {
    const operator = plain[index++];
    if (!['+', '-', '*', '/'].includes(operator)) return null;
    const value = nextNumber();
    if (value === null || (operator === '/' && value === 0)) return null;
    if (operator === '*' || operator === '/') {
      const left = values.pop();
      const result = operator === '*' ? left * value : left / value;
      if (!Number.isFinite(result)) return null;
      values.push(result);
    } else {
      operators.push(operator);
      values.push(value);
    }
  }
  const total = values.slice(1).reduce((sum, value, i) => operators[i] === '+' ? sum + value : sum - value, values[0]);
  return Number.isFinite(total) ? roundMoney(total) : null;
}

// Una tecla devuelve la siguiente expresión; un '=' inválido conserva la actual.
function updateCalculation(expression, key) {
  const current = normalize(expression) || '0';
  const character = normalize(key);
  if (character === 'C') return '0';
  if (character === '⌫') {
    const shortened = current.slice(0, -1);
    return shortened && !/^[+-]$/.test(shortened) ? shortened : '0';
  }
  if (character === '=') {
    const result = evaluate(current);
    return result === null ? current : String(result);
  }
  if (/^[+*/-]$/.test(character)) {
    if (/^[+-]$/.test(current)) return character === '-' ? '-' : '0' + character;
    return /[+*/-]$/.test(current) ? current.slice(0, -1) + character : current + character;
  }
  if (character === '.') {
    const tail = current.split(/[+*/-]/).pop();
    return tail.includes('.') ? current : current + (tail ? '.' : '0.');
  }
  if (/^\d$/.test(character)) {
    if (current === '0') return character;
    if (current === '-0') return '-' + character;
    return current + character;
  }
  return current;
}

// Patrón determinista ilustrativo: no codifica datos ni permite pagar.
function qrPattern() {
  let html = '';
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const finder = (originX, originY) => {
        const dx = x - originX;
        const dy = y - originY;
        if (dx < 0 || dx > 6 || dy < 0 || dy > 6) return null;
        return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      };
      const fixed = finder(0, 0) ?? finder(14, 0) ?? finder(0, 14);
      const on = fixed !== null ? fixed : ((x * 19 + y * 31 + x * y * 7) % 11) < 5;
      html += `<span class="qr-cell${on ? ' on' : ''}"></span>`;
    }
  }
  return html;
}

return {money,interpret,evaluate,updateCalculation,qrPattern};
})();

// frontend/js/voice.js
const {createVoiceController,speakText}=(()=>{
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

function createVoiceController({ host = globalThis, onState, onTranscript, onError } = {}) {
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

function speakText(text, { host = globalThis, rate = 0.93 } = {}) {
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

return {createVoiceController,speakText};
})();

// frontend/js/voice-commands.js
const {processVoiceCommand}=(()=>{
// Interprete puro Modelo A: importes en centavos y ventas de demostracion exclusivamente MXN.
const MAX_CENTS = 99999999;
const formatMXN = value => '$' + Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const accents=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/(\d)[,.](\d)/g,'$1DECIMAL$2').replace(/[¿?¡!.,;:]/g,' ').replace(/DECIMAL/g,'.').replace(/\s+/g,' ').trim();
const numberUnits={cero:0,un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29,treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90,cien:100,ciento:100,doscientos:200,trescientos:300,cuatrocientos:400,quinientos:500,seiscientos:600,setecientos:700,ochocientos:800,novecientos:900};
function readSpanishNumber(t){
 t=accents(t).replace(/[\$]/g,'').replace(/\b(pesos?\s+mexicanos?|pesos?|m\s*n|centavos?|mxn)\b/g,' ').trim();
 if(/^\d{1,6}(?:[.]\d{1,2})?$/.test(t))return Number(t);
 const words=t.split(/\s+/).filter(Boolean);if(!words.length)return null;
 let total=0,group=0;
 for(const w of words){if(w==='y')continue;if(w==='mil'){group=group||1;total+=group*1000;group=0;continue;}if(!(w in numberUnits))return null;const v=numberUnits[w];if(v>=100){if(group>=100)return null;group+=v;}else group+=v;}
 const res=total+group;return Number.isFinite(res)&&res<=999999?res:null;
}
function getAmountCents(value){
 const expression=accents(value);
 // Expresiones como 'ochenta pesos con cincuenta centavos'.
 const parts=expression.match(/^(.+?)\s+(?:pesos?\s+)?con\s+(.+?)(?:\s+centavos?)?$/);
 if(parts){
   const whole=readSpanishNumber(parts[1]);const fraction=readSpanishNumber(parts[2]);
   if(whole===null||!Number.isInteger(whole)||fraction===null||!Number.isInteger(fraction)||fraction<0||fraction>=100)return null;
   const result=whole*100+fraction;return result>0&&result<=99999999?result:null;
 }
 const n=readSpanishNumber(value);
 if(n===null||!Number.isFinite(n)||n<=0||n>999999.99)return null;
 const cents=Math.round(n*100);return cents>0?cents:null;
}
function parseProductCommand(text){
 const normalized=accents(text).replace(/^(agrega|agregar|anade|añade|suma)\s+/, '');
 const parts=normalized.split(/\s+y\s+(?=(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)/);
 let additions=[];
 for(let part of parts){
   const m=part.match(/^(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+([a-z\s]+?)\s+(?:de|a|por)\s+(.+?)(?:\s+pesos?)?$/);
   if(!m)return null;
   const qty=readSpanishNumber(m[1]);const unit=getAmountCents(m[3]);
   const name=m[2].trim().replace(/\s+/g,' ');
   if(!qty||qty>100||!unit||!name||name.length>40)return null;
   const amount=unit*qty;
   if(amount>99999999)return null;
   additions.push({label:qty+' × '+name+' ('+formatMXN(unit/100)+' c/u)',cents:amount});
 }
 return additions.length?additions:null;
}


/* Calculadora hablada en centavos, sin eval ni conversiones de divisas. */
function parseArithmeticCommand(text) {
  let body = text.replace(/^(?:suma|sumar|agrega|agregar|anade|multiplica|multiplicar|divide|dividir|resta|restar|calcula|calcular|cobra|cobrar)\s+/, '')
    .replace(/\s+(?:multiplicado|multiplicada)\s+por\s+/g,' por ')
    .replace(/\s+(?:dividido|dividida)\s+(?:entre|por)\s+/g,' entre ');
  const parts=body.split(/\s+(mas|menos|por|entre|\+)\s+/).map(p=>p.trim());
  if(parts.length<3 || parts.length%2===0)return null;
  const operators=parts.filter((_,i)=>i%2===1).map(x=>x==='+'?'mas':x);
  const values=parts.filter((_,i)=>i%2===0).map(x=>{
    if(/^0(?:[.]0{1,2})?(?:\s+(?:pesos?|mxn))?$/.test(x))return 0;
    return getAmountCents(x);
  });
  if(values.some(x=>x===null))return null;
  let nums=values.slice(),ops=operators.slice();
  for(let i=0;i<ops.length;){
    const op=ops[i];if(op!=='por' && op!=='entre'){i++;continue;}
    if(op==='entre' && nums[i+1]===0)return {error:'No puedo dividir entre cero. Revisa la frase.'};
    const value=op==='por'?Math.round(nums[i]*nums[i+1]/100)
      :Math.round(nums[i]*100/nums[i+1]);
    if(!Number.isSafeInteger(value))return {error:'El cálculo supera el límite permitido.'};
    nums.splice(i,2,value);ops.splice(i,1);
  }
  let cents=nums[0];
  for(let i=0;i<ops.length;i++)cents+=ops[i]==='mas'?nums[i+1]:-nums[i+1];
  if(!Number.isSafeInteger(cents)||cents<=0||cents>MAX_CENTS)
    return {error:'El resultado debe ser mayor a cero y menor a un millón de pesos mexicanos.'};
  return {cents,pureAddition:operators.every(x=>x==='mas'),values,label:body};
}

// Cada respuesta incluye una copia nueva; los comandos nunca mutan la venta recibida.
function processVoiceCommand(raw, items = []) {
  const current = Array.isArray(items) ? items.map(item => ({ ...item })) : [];
  const total = list => list.reduce((sum, item) => sum + item.cents, 0);
  const answer = (message, next = current, error = false, confirm = false) => ({
    items: next, message, confirm, error
  });
  const text = accents(raw);
  const foreignCurrency = /\b(?:dolar(?:es)?|dolares|dollars?|usd|euros?|eur|libras?|gbp|yenes?|jpy|soles?|pen|reales?|brl|cop|ars|clp|cad|pesos?\s+(?:colombianos?|argentinos?|chilenos?|dominicanos?|uruguayos?))\b|\bus\s*\$|[€£¥]/;
  if (foreignCurrency.test(text)) return answer('CobraVoz solo acepta pesos mexicanos, MXN. No convertimos ni cobramos otras monedas.', current, true);
  if (!text) return answer('No recibí ninguna frase. Vuelve a hablar o escribe el cobro.', current, true);
  if (current.some(item => !Number.isSafeInteger(item.cents) || Math.abs(item.cents) > MAX_CENTS)
    || total(current) < 0 || total(current) > MAX_CENTS) {
    return answer('La venta actual no tiene un total válido. Limpia la venta para comenzar de nuevo.', current, true);
  }
  if (/^(cancelar|cancela|cancelar cobro|borrar todo|limpiar todo)$/.test(text)) {
    return answer('Cancelé la venta actual. No se generó ningún QR.', []);
  }
  if (/^(quita|quitar|borra|elimina) (el )?(ultimo|ultima)( producto| articulo| cobro)?$/.test(text)) {
    if (!current.length) return answer('No hay productos por quitar.', current, true);
    const next = current.slice(0, -1);
    return answer('Quité el último concepto. Total ' + formatMXN(total(next) / 100) + ' pesos.', next);
  }
  if (/^(cuanto llevo|cuanto es|repite el total|dime el total|total|cuanto voy)$/.test(text)) {
    return answer('Tu total actual es ' + formatMXN(total(current) / 100) + ' pesos.');
  }
  if (/^(confirmar|confirmo|confirmar cobro|genera el qr|generar qr|generar codigo|genera codigo)$/.test(text)) {
    return total(current) > 0
      ? answer('Revisa y confirma el total de ' + formatMXN(total(current) / 100) + ' pesos mexicanos.', current, false, true)
      : answer('Todavía no hay un total válido para confirmar.', current, true);
  }
  const append = additions => {
    const next = [...current, ...additions];
    if (total(next) > MAX_CENTS) return answer('El total supera el máximo permitido.', current, true);
    return answer('Total ' + formatMXN(total(next) / 100) + ' pesos. Revisa antes de generar QR.', next);
  };
  const arithmetic=parseArithmeticCommand(text);
  if(arithmetic){
    if(arithmetic.error)return answer(arithmetic.error,current,true);
    const additions=arithmetic.pureAddition
      ?arithmetic.values.map((cents,i)=>({label:i===0?'Importe inicial':'Importe adicional',cents}))
      :[{label:'Cálculo: '+arithmetic.label,cents:arithmetic.cents}];
    if(/^(?:cobra|cobrar)\s+/.test(text))
      return answer('Preparé un cobro de '+formatMXN(arithmetic.cents/100)+' pesos. ¿Confirmas?',additions);
    return append(additions);
  }
  let match = text.match(/^(agrega|agregar|anade|suma|mas)\s+(.+)$/);
  if (match) {
    const products = parseProductCommand(match[2]);
    if (products) return append(products);
    const cents = getAmountCents(match[2]);
    if (cents) return append([{ label: 'Importe adicional', cents }]);
  }
  match = text.match(/^(quita|resta|descuenta|menos)\s+(.+)$/);
  if (match) {
    const cents = getAmountCents(match[2]);
    if (cents && total(current) - cents > 0) return answer(
      'Resté ' + formatMXN(cents / 100) + '. Total ' + formatMXN((total(current) - cents) / 100) + ' pesos.',
      [...current, { label: 'Descuento', cents: -cents }]
    );
    return answer('El descuento debe ser menor al total actual.', current, true);
  }
  const products = parseProductCommand(text);
  if (products) return append(products);
  const direct = text.replace(/^(quiero cobrar|prepara un cobro de|prepara cobro de|cobra de|cobrar|cobra|cobrame|monto|importe de)\s+/, '');
  const cents = getAmountCents(direct);
  if (cents) return answer('Preparé un cobro de ' + formatMXN(cents / 100) + ' pesos. ¿Confirmas?', [{ label: 'Cobro directo', cents }]);
  return answer('No pude interpretar esa frase. Prueba: cobra ciento cincuenta pesos o dos cafés de cuarenta pesos.', current, true);
}

return {processVoiceCommand};
})();

// frontend/js/demo-qr.js
const {demoQrSvg}=(()=>{
// QR de texto de demostracion extraido del frontend V6; nunca representa un pago bancario.
  const SIZE=29, MAX_BYTES=53, DATA_CODEWORDS=55, EC_CODEWORDS=15;
  function mul(a,b){let result=0;while(b>0){if((b&1)!==0)result^=a;a=(a<<1)^((a&0x80)?0x11d:0);b>>=1;}return result;}
  function generator(degree){let poly=[1];let power=1;for(let i=0;i<degree;i++){const next=new Array(poly.length+1).fill(0);for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=mul(poly[j],power);}poly=next;power=mul(power,2);}return poly;}
  function dataCodewords(text){const bytes=Array.from(new TextEncoder().encode(text));if(bytes.length>MAX_BYTES)throw Error('Texto QR demasiado largo');const bits=[];function add(value,n){for(let i=n-1;i>=0;i--)bits.push((value>>>i)&1);}add(4,4);add(bytes.length,8);bytes.forEach(b=>add(b,8));for(let i=0;i<4&&bits.length<DATA_CODEWORDS*8;i++)bits.push(0);while(bits.length%8)bits.push(0);const output=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|bits[i+j];output.push(value);}while(output.length<DATA_CODEWORDS)output.push(output.length%2===0?0xEC:0x11);return output;}
  function ecc(data){const poly=generator(EC_CODEWORDS);const buffer=data.concat(new Array(EC_CODEWORDS).fill(0));for(let i=0;i<data.length;i++){const lead=buffer[i];for(let j=0;j<poly.length;j++)buffer[i+j]^=mul(poly[j],lead);}return buffer.slice(-EC_CODEWORDS);}
  function matrix(payload){const data=dataCodewords(payload),codewords=data.concat(ecc(data));const cells=Array.from({length:SIZE},()=>Array(SIZE).fill(null));const fixed=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
    function set(x,y,v){if(x<0||y<0||x>=SIZE||y>=SIZE)return;cells[y][x]=!!v;fixed[y][x]=true;}
    function finder(x,y){for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){const inFinder=(dx>=0&&dx<=6&&dy>=0&&dy<=6);const border=dx===0||dx===6||dy===0||dy===6;const core=dx>=2&&dx<=4&&dy>=2&&dy<=4;set(x+dx,y+dy,inFinder&&(border||core));}}
    finder(0,0);finder(SIZE-7,0);finder(0,SIZE-7);
    for(let i=8;i<SIZE-8;i++){set(i,6,i%2===0);set(6,i,i%2===0);}
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(22+dx,22+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
    // Reservar los módulos donde se escriben los bits de formato (L / máscara 0).
    for(let i=0;i<=5;i++)set(8,i,false);set(8,7,false);set(8,8,false);set(7,8,false);for(let i=9;i<15;i++)set(14-i,8,false);
    for(let i=0;i<8;i++)set(SIZE-1-i,8,false);for(let i=8;i<15;i++)set(8,SIZE-15+i,false);set(8,SIZE-8,true);
    const bits=[];codewords.forEach(byte=>{for(let i=7;i>=0;i--)bits.push((byte>>>i)&1);});let bi=0;
    for(let right=SIZE-1;right>=1;right-=2){if(right===6)right=5;const upwards=((right+1)&2)===0;for(let vert=0;vert<SIZE;vert++){const y=upwards?SIZE-1-vert:vert;for(let dx=0;dx<2;dx++){const x=right-dx;if(fixed[y][x])continue;let bit=bi<bits.length?bits[bi++]:0;if(((x+y)&1)===0)bit^=1;cells[y][x]=!!bit;}}}
    // Información de formato: nivel L, máscara 0, código BCH(15,5).
    const formatData=(1<<3)|0;let remainder=formatData;for(let i=0;i<10;i++)remainder=(remainder<<1)^(((remainder>>>9)&1)?0x537:0);const format=((formatData<<10)|remainder)^0x5412;const bit=i=>((format>>>i)&1)!==0;
    for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));for(let i=0;i<8;i++)set(SIZE-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,SIZE-15+i,bit(i));set(8,SIZE-8,true);
    return cells;
  }
  function svg(text){const m=matrix(text);let path='';for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(m[y][x])path+=`M${x+4} ${y+4}h1v1h-1z`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" width="100%" height="100%" role="img" aria-label="QR demostrativo; no permite pagar"><rect width="37" height="37" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;}

function demoQrSvg(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0.01 || value > 999999.99) throw new RangeError('Importe de demo fuera de rango');
  const payload = 'COBRAVOZ-DEMO|MXN:' + value.toFixed(2) + '|NO-PAGAR';
  return svg(payload).replace('<rect ', '<desc>' + payload + '</desc><rect ');
}

return {demoQrSvg};
})();

// frontend/js/movements.js
const {movementStatus,filterMovements,movementTotals,exampleMovements}=(()=>{
// Operaciones puras para movimientos de demostración, sin acceso a pagos reales.
const statuses = Object.freeze({
  confirmed: Object.freeze({ label: 'Confirmado' }),
  pending: Object.freeze({ label: 'Pendiente' }),
  expired: Object.freeze({ label: 'Vencido' }),
  failed: Object.freeze({ label: 'Sin pago' })
});
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('es-MX')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const amountCents = value => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
};
const timestamp = value => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

function movementStatus(status) {
  return statuses[status] || statuses.failed;
}

// Filtra sin modificar la colección original y presenta primero lo más reciente.
function filterMovements(records, { status = 'all', query = '' } = {}) {
  const search = normalize(query);
  return (Array.isArray(records) ? records : []).filter(record => {
    if (!record || typeof record !== 'object') return false;
    if (status === 'confirmed' && record.status !== 'confirmed') return false;
    if (status === 'pending' && record.status !== 'pending') return false;
    if (status === 'unpaid' && !['expired', 'failed'].includes(record.status)) return false;
    if (!search) return true;
    const amount = Number(record.amount);
    const formatted = currency.format(Number.isFinite(amount) ? amount : 0);
    return [record.reference, record.businessName, record.amount, formatted]
      .some(value => normalize(value).includes(search));
  }).sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
}

// Ambos totales son importes MXN; los vencidos y fallidos nunca se suman.
function movementTotals(records) {
  let confirmed = 0, pending = 0;
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.status === 'confirmed') confirmed += amountCents(record.amount);
    if (record?.status === 'pending') pending += amountCents(record.amount);
  }
  return { confirmed: confirmed / 100, pending: pending / 100 };
}

// Cada llamada genera ejemplos nuevos, claramente separados del historial real.
function exampleMovements() {
  const now = Date.now();
  const time = milliseconds => new Date(now - milliseconds).toISOString();
  return [
    { reference: 'CV-EJ-1048', businessName: 'Tacos Juanita', amount: 180, status: 'confirmed', method: 'calculator', createdAt: time(42 * 60000), confirmedAt: time(41 * 60000), description: 'Venta de demostración', example: true },
    { reference: 'CV-EJ-1047', businessName: 'Tacos Juanita', amount: 85, status: 'pending', method: 'voice', createdAt: time(95 * 60000), description: 'Cobro por voz de demostración', example: true },
    { reference: 'CV-EJ-1046', businessName: 'Tacos Juanita', amount: 125, status: 'confirmed', method: 'voice', createdAt: time(25 * 3600000), confirmedAt: time(25 * 3600000 - 60000), description: 'Venta anterior de demostración', example: true },
    { reference: 'CV-EJ-1045', businessName: 'Tacos Juanita', amount: 60, status: 'expired', method: 'calculator', createdAt: time(27 * 3600000), description: 'Solicitud vencida de demostración', example: true }
  ];
}

return {movementStatus,filterMovements,movementTotals,exampleMovements};
})();

// frontend/js/supabase-auth.js
const {SUPABASE_PROJECT_REF,PROTECTED_ROUTES,PUBLIC_ROUTES,isProtectedRoute,getSupabaseConfig,hasActiveSession,restoreSession,establishSession,refreshSessionIfNeeded,signOutSession,requestPhoneOtp,verifyPhoneOtpCode,stopSmsOtpListener,startSmsOtpListener}=(()=>{
// Cliente de autenticación Supabase, WebOTP y guardián de rutas protegidas para CobraVoz.
const SUPABASE_PROJECT_REF = 'a0c4242b-2057-404e-ad69-19958fa9e54e';
const PROTECTED_ROUTES = new Set(['home', 'charge', 'payment', 'history']);
const PUBLIC_ROUTES = new Set(['access', 'registration']);

const SESSION_STORAGE_KEY = 'cobravoz.auth.session';
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // Demo: caja de jornada con cierre explícito.

let otpAbortController = null;

function isProtectedRoute(screen) {
  return PROTECTED_ROUTES.has(screen);
}

function readMetaContent(name) {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || '';
}

function getSupabaseConfig() {
  const globalConfig = typeof globalThis !== 'undefined' && globalThis.COBRAVOZ_SUPABASE
    ? globalThis.COBRAVOZ_SUPABASE
    : {};
  const url = String(globalConfig.url || readMetaContent('supabase-url') || '').replace(/\/+$/, '');
  const publishableKey = String(
    globalConfig.publishableKey || readMetaContent('supabase-publishable-key') || ''
  ).trim();
  return {
    projectRef: String(globalConfig.projectRef || SUPABASE_PROJECT_REF),
    url,
    publishableKey,
    configured: Boolean(url && publishableKey)
  };
}

function toE164Mexico(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (/^52\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+52${digits}`;
  return null;
}

function sessionStores(){
  return [typeof localStorage!=='undefined'?localStorage:null,
    typeof sessionStorage!=='undefined'?sessionStorage:null].filter(Boolean);
}
function readStorageSession(){
  for(const store of sessionStores()){
    try {
      const raw=store.getItem(SESSION_STORAGE_KEY);if(!raw)continue;
      const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object')continue;
      const expired=parsed.expiresAt&&Number(parsed.expiresAt)<=Date.now();
      if(expired&&!(parsed.mode==='supabase'&&parsed.refreshToken)){
        store.removeItem(SESSION_STORAGE_KEY);continue;
      }
      return parsed;
    }catch{}
  }
  return null;
}
function writeStorageSession(session){
  for(const store of sessionStores()){try{store.setItem(SESSION_STORAGE_KEY,JSON.stringify(session));}catch{}}
}
function clearStorageSession(){
  for(const store of sessionStores()){try{store.removeItem(SESSION_STORAGE_KEY);}catch{}}
}

function hasActiveSession(state) {
  if (!state?.authenticated || !state?.authSession) return false;
  const expiresAt = Number(state.authSession.expiresAt || 0);
  if (expiresAt > 0 && expiresAt <= Date.now()) return state.authSession.mode === 'supabase' && Boolean(state.authSession.refreshToken);
  return true;
}

function restoreSession(state) {
  const stored = readStorageSession();
  if (!stored) {
    if (state) {
      state.authenticated = false;
      state.authSession = null;
    }
    return false;
  }
  if (state) {
    state.authenticated = true;
    state.authSession = stored;
    state.verified = true;
    if (!state.phone && stored.phone) state.phone = stored.phone;
    if (!state.fullName && stored.fullName) state.fullName = stored.fullName;
    if (!state.businessName && stored.businessName) state.businessName = stored.businessName;
  }
  return true;
}

function establishSession(state, sessionInfo = {}) {
  const expiresAt = Number(sessionInfo.expiresAt) || (Date.now() + DEFAULT_SESSION_TTL_MS);
  const session = {
    projectRef: SUPABASE_PROJECT_REF,
    mode: sessionInfo.mode || 'demo',
    source: sessionInfo.source || 'sms',
    userId: sessionInfo.userId || null,
    phone: String(sessionInfo.phone || state?.phone || ''),
    fullName: String(sessionInfo.fullName || state?.fullName || ''),
    businessName: String(sessionInfo.businessName || state?.businessName || ''),
    accessToken: sessionInfo.accessToken || null,
    refreshToken: sessionInfo.refreshToken || null,
    expiresAt
  };
  if (state) {
    state.authenticated = true;
    state.authSession = session;
    state.verified = true;
  }
  writeStorageSession(session);
  return session;
}


let pendingRefresh=null;
/* Supabase: renovamos el access token con un refresh token rotativo, sin SMS entre ventas.
   El servidor conserva la autoridad sobre sesiones revocadas y pagos reales. */
function refreshSessionIfNeeded(state){
  const current=state?.authSession;
  if(!current||!state?.authenticated)return Promise.resolve(false);
  if(current.mode!=='supabase')return Promise.resolve(hasActiveSession(state));
  if(Number(current.expiresAt||0)>Date.now()+120000)return Promise.resolve(true);
  if(pendingRefresh)return pendingRefresh;
  const config=getSupabaseConfig();
  if(!config.configured||!current.refreshToken||typeof fetch!=='function')return Promise.resolve(false);
  pendingRefresh=(async()=>{
    try{
      const resp=await fetch(config.url+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',
        headers:{'Content-Type':'application/json',apikey:config.publishableKey},
        body:JSON.stringify({refresh_token:current.refreshToken})
      });
      const p=await resp.json().catch(()=>({}));
      if(state.authSession!==current)return false;
      if(resp.ok&&p.access_token&&p.refresh_token){
        const seconds=Number(p.expires_in||3600);
        state.authSession={...current,accessToken:p.access_token,refreshToken:p.refresh_token,
          expiresAt:Date.now()+Math.max(60,seconds)*1000};
        writeStorageSession(state.authSession);
        return true;
      }
      if([400,401,403].includes(resp.status)){
        clearStorageSession();state.authenticated=false;state.authSession=null;
      }
    }catch{/* Sin conexión: reintentar al volver a primer plano. */}
    return false;
  })().finally(()=>{pendingRefresh=null});
  return pendingRefresh;
}

async function signOutSession(state) {
  stopSmsOtpListener();
  const currentSession = state?.authSession;
  const config = getSupabaseConfig();
  if (
    config.configured &&
    currentSession?.mode === 'supabase' &&
    currentSession?.accessToken &&
    typeof fetch === 'function'
  ) {
    try {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${currentSession.accessToken}`
        }
      });
    } catch {
      // Continuar con la limpieza local aunque la red falle.
    }
  }
  clearStorageSession();
  if (state) {
    state.authenticated = false;
    state.authSession = null;
    state.redirectAfterAuth = null;
  }
}

async function requestPhoneOtp(phone) {
  const e164 = toE164Mexico(phone);
  if (!e164) return { ok: false, error: 'Ingresa un celular mexicano de 10 dígitos.' };
  const config = getSupabaseConfig();
  if (!config.configured || typeof fetch !== 'function') {
    return { ok: true, mode: 'demo', phone: e164 };
  }
  try {
    const response = await fetch(`${config.url}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.publishableKey
      },
      body: JSON.stringify({ phone: e164, create_user: true })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: payload.msg || payload.error_description || 'No se pudo enviar el código SMS.' };
    }
    return { ok: true, mode: 'supabase', phone: e164 };
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servicio de autenticación.' };
  }
}

async function verifyPhoneOtpCode(phone, code) {
  const e164 = toE164Mexico(phone);
  if (!e164) return { ok: false, error: 'Ingresa un celular mexicano de 10 dígitos.' };
  const cleanCode = String(code ?? '').replace(/\D/g, '');
  const config = getSupabaseConfig();
  if (!config.configured || typeof fetch !== 'function') {
    if (cleanCode !== '123456') {
      return { ok: false, error: 'Código de prueba incorrecto. Escribe 123456.' };
    }
    return { ok: true, mode: 'demo', session: { phone: e164.slice(3) } };
  }
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, error: 'Ingresa el código SMS de 6 dígitos.' };
  }
  try {
    const response = await fetch(`${config.url}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.publishableKey
      },
      body: JSON.stringify({ phone: e164, token: cleanCode, type: 'sms' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      return { ok: false, error: payload.msg || payload.error_description || 'Código de verificación inválido.' };
    }
    const expiresInMs = Number(payload.expires_in || 3600) * 1000;
    return {
      ok: true,
      mode: 'supabase',
      session: {
        userId: payload.user?.id || null,
        phone: e164.slice(3),
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token || null,
        expiresAt: Date.now() + expiresInMs
      }
    };
  } catch {
    return { ok: false, error: 'No se pudo verificar el código con Supabase.' };
  }
}

function stopSmsOtpListener() {
  if (otpAbortController) {
    otpAbortController.abort();
    otpAbortController = null;
  }
}

async function startSmsOtpListener(formEl, inputEl) {
  if (
    !formEl ||
    !inputEl ||
    typeof window === 'undefined' ||
    !('OTPCredential' in window) ||
    !navigator?.credentials?.get
  ) {
    return;
  }
  stopSmsOtpListener();
  const ac = new AbortController();
  otpAbortController = ac;
  try {
    const otp = await navigator.credentials.get({
      otp: { transport: ['sms'] },
      signal: ac.signal
    });
    if (!otp || ac.signal.aborted) return;
    inputEl.value = otp.code;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    formEl.requestSubmit();
  } catch (error) {
    if (error && error.name === 'AbortError') return;
    console.error('Error al recibir WebOTP:', error);
  } finally {
    if (otpAbortController === ac) otpAbortController = null;
  }
}

return {SUPABASE_PROJECT_REF,PROTECTED_ROUTES,PUBLIC_ROUTES,isProtectedRoute,getSupabaseConfig,hasActiveSession,restoreSession,establishSession,refreshSessionIfNeeded,signOutSession,requestPhoneOtp,verifyPhoneOtpCode,stopSmsOtpListener,startSmsOtpListener};
})();

const CV_EMBEDDED_VIEWS={"access":"<template id=\"access\">\n  <section class=\"screen\">\n    <h1 class=\"title\">Tu negocio empieza aquí.</h1>\n    <p class=\"subtitle\">Entra con tu celular mexicano o crea tu cuenta para explorar CobraVoz.</p>\n    <div {{phoneHidden}}>\n      <form id=\"loginForm\" novalidate>\n        <div class=\"field\">\n          <label for=\"loginPhoneInput\">Celular de México</label>\n          <div class=\"country-phone\"><span class=\"country\">🇲🇽 +52</span><input class=\"input\" id=\"loginPhoneInput\" type=\"tel\" inputmode=\"tel\" autocomplete=\"tel-national\" placeholder=\"10 dígitos\" value=\"{{phone}}\"></div>\n        </div>\n        {{{error}}}\n        <button class=\"primary\" type=\"submit\">Continuar con SMS →</button>\n      </form>\n      <button class=\"secondary\" type=\"button\" data-action=\"demoLogin\">Entrar con rostro, huella o PIN (demo)</button>\n      <button class=\"link-btn\" type=\"button\" data-action=\"signup\">Crear mi cuenta</button>\n      <div class=\"notice\">{{accessNotice}}</div>\n    </div>\n    {{{sms}}}\n  </section>\n</template>\n\n<template id=\"feedback\">\n  <div class=\"error\" role=\"alert\">{{message}}</div>\n</template>\n\n<!-- El mismo formulario verifica el teléfono de acceso y el de registro. -->\n<template id=\"smsForm\">\n  <form id=\"smsForm\" novalidate>\n    <p class=\"notice\">Confirma el celular +52 {{maskedPhone}}. {{deliveryNotice}}</p>\n    <div class=\"field\"><label for=\"code\">Código de 6 dígitos</label><small class=\"hint\" id=\"codeHelp\">Ingresa los 6 dígitos enviados a tu celular.</small><input class=\"input code\" id=\"code\" name=\"code\" type=\"text\" inputmode=\"numeric\" autocomplete=\"one-time-code\" pattern=\"\\d{6}\" maxlength=\"6\" placeholder=\"000000\" aria-describedby=\"codeHelp\" value=\"{{code}}\" required></div>\n    {{{error}}}\n    <button class=\"primary\" type=\"submit\">Confirmar teléfono ✓</button>\n    <button class=\"link-btn\" type=\"button\" data-action=\"resend\">Reenviar código</button>\n    <button class=\"secondary\" type=\"button\" data-action=\"editPhone\">Corregir mi celular</button>\n  </form>\n</template>\n","registration":"<template id=\"registration\">\n  <section class=\"screen\">\n    <button class=\"back\" type=\"button\" data-action=\"registrationBack\">← Volver</button>\n    <div class=\"step\"><span>Registro</span><span>{{stepLabel}}</span></div>\n    <h1 class=\"title\">{{title}}</h1>\n    <p class=\"subtitle\">{{subtitle}}</p>\n    <form id=\"identityForm\" novalidate {{identityHidden}}>\n      <div class=\"field\"><label for=\"fullName\">Tu nombre completo</label><input class=\"input\" id=\"fullName\" autocomplete=\"name\" required placeholder=\"Ej. María López\" value=\"{{fullName}}\"></div>\n      <div class=\"field\"><label for=\"dob\">Fecha de nacimiento</label><input class=\"input\" id=\"dob\" type=\"date\" max=\"{{today}}\" required value=\"{{dob}}\"><small class=\"hint\">Solo pueden registrarse personas de 18 años o más. La fecha declarada no sustituye una verificación de identidad.</small></div>\n      <div class=\"field\"><label for=\"phoneNumber\">Tu celular de México</label><div class=\"country-phone\"><span class=\"country\">🇲🇽 +52</span><input class=\"input\" id=\"phoneNumber\" type=\"tel\" inputmode=\"tel\" autocomplete=\"tel-national\" placeholder=\"10 dígitos\" value=\"{{phone}}\" aria-describedby=\"phoneHelp\" required></div><small class=\"hint\" id=\"phoneHelp\">Solo números mexicanos de 10 dígitos.</small></div>\n      <div class=\"check-row\"><input id=\"adultConsent\" type=\"checkbox\" {{consentChecked}}><label for=\"adultConsent\">Confirmo que tengo 18 años o más y que este número es mío.</label></div>\n      {{{identityError}}}\n      <button class=\"primary\" type=\"submit\">Verificar mi celular →</button>\n    </form>\n    {{{sms}}}\n    <form id=\"bankForm\" novalidate {{bankHidden}}>\n      <div class=\"field\"><label for=\"businessName\">Nombre de tu negocio</label><input class=\"input\" id=\"businessName\" autocomplete=\"organization\" minlength=\"2\" maxlength=\"70\" placeholder=\"Ej. Tacos Juanita\" value=\"{{businessName}}\" required><small class=\"hint\">Este nombre aparecerá en tus cobros y comprobantes de demostración.</small></div>\n      <div class=\"field\"><label for=\"email\">Correo de contacto</label><input class=\"input\" id=\"email\" type=\"email\" autocomplete=\"email\" placeholder=\"nombre@ejemplo.com\" value=\"{{email}}\" required><small class=\"hint\">Para notificaciones y recuperación. No verificamos el correo en esta demo.</small></div>\n      <div class=\"field\"><div class=\"label\">Tipo de persona fiscal</div><div class=\"choice\"><button type=\"button\" data-entity=\"person\" aria-pressed=\"{{isPerson}}\">Persona física</button><button type=\"button\" data-entity=\"business\" aria-pressed=\"{{isBusiness}}\">Persona moral</button></div></div>\n      <div class=\"field\"><label for=\"holder\">Nombre legal del titular</label><input class=\"input\" id=\"holder\" autocomplete=\"off\" placeholder=\"Como aparece en tu banco\" value=\"{{holder}}\" required></div>\n      <div class=\"field\"><div class=\"inline-toggle\"><label for=\"clabe\">CLABE interbancaria (18 dígitos)</label><button class=\"text-toggle\" type=\"button\" data-action=\"toggleClabe\">{{clabeLabel}}</button></div><input class=\"input clabe\" id=\"clabe\" type=\"{{clabeType}}\" inputmode=\"numeric\" autocomplete=\"off\" maxlength=\"18\" value=\"{{clabe}}\" required><small class=\"hint\">Es la CLABE, no el número de tarjeta. Revisamos su dígito de control.</small></div>\n      <div class=\"field\" {{rfcHidden}}><label for=\"rfc\">RFC de la empresa (opcional)</label><input class=\"input\" id=\"rfc\" maxlength=\"13\" value=\"{{rfc}}\" placeholder=\"Ej. ABC010203XXX\"></div>\n      <button class=\"secondary\" type=\"button\" data-action=\"fillTestClabe\">Completar datos de demostración</button>\n      <p class=\"mini-note\">Puedes probar con datos ficticios. No enviamos ni almacenamos datos bancarios en un servidor.</p>\n      {{{bankError}}}\n      <button class=\"primary\" type=\"submit\">Revisar datos →</button>\n    </form>\n    <div {{reviewHidden}}>\n      <div class=\"summary-card\">\n        <div class=\"summary-row\"><span>Negocio</span><strong>{{businessName}}</strong></div>\n        <div class=\"summary-row\"><span>Persona</span><strong>{{fullName}}</strong></div>\n        <div class=\"summary-row\"><span>Celular</span><strong>+52 {{phone}}</strong></div>\n        <div class=\"summary-row\"><span>Correo</span><strong>{{email}}</strong></div>\n        <div class=\"summary-row\"><span>Tipo</span><strong>{{entityLabel}}</strong></div>\n        <div class=\"summary-row\"><span>Titular</span><strong>{{holder}}</strong></div>\n        <div class=\"summary-row\"><span>CLABE</span><strong>••••••••••••••{{clabeLast}}</strong></div>\n      </div>\n      <div class=\"notice\">La cuenta y la identidad se validarán con el proveedor en producción. Esta solicitud es simulada.</div>\n      {{{reviewError}}}\n      <button class=\"primary\" type=\"button\" data-action=\"simulateRequest\">Preparar solicitud de prueba →</button>\n    </div>\n    <div {{readyHidden}}>\n      \n      <div class=\"notice\">No enviamos tu CLABE ni creamos una cuenta bancaria. Puedes explorar los cobros simulados.</div>\n      <h2>Acceso sin contraseña</h2>\n      <p class=\"mini-note\">En producción podrás usar rostro, huella o PIN con passkeys. Tu biometría permanece en el dispositivo.</p>\n      <button class=\"primary\" type=\"button\" data-action=\"demoPasskey\">Activar acceso rápido (demo)</button>\n      <button class=\"secondary\" type=\"button\" data-to=\"home\">Ahora no, explorar la demo</button>\n    </div>\n  </section>\n</template>\n","home":"<template id=\"home\">\n  <section class=\"screen\">\n    <span class=\"smallcaps\">Vista del comerciante</span>\n    <h1 class=\"title\">Hola, {{name}}.</h1>\n    <p class=\"merchant-name\">{{businessName}}</p>\n    <p class=\"subtitle\">¿Qué hacemos hoy?</p>\n    <span class=\"badge\">Cobros simulados · Sin dinero real</span>\n    <button class=\"big-action primary-action\" type=\"button\" data-charge=\"voice\"><span class=\"action-icon\" aria-hidden=\"true\">🎙</span><span><strong>Cobrar con voz</strong><small>Dicta o escribe lo que vendiste</small></span></button>\n    <button class=\"big-action\" type=\"button\" data-charge=\"calculator\"><span class=\"action-icon\" aria-hidden=\"true\">▦</span><span><strong>Calcular y cobrar</strong><small>Suma, multiplica y revisa la venta</small></span></button>\n    <button class=\"big-action\" type=\"button\" data-to=\"history\"><span class=\"action-icon\" aria-hidden=\"true\">◷</span><span><strong>Mis movimientos</strong><small>Historial y estado de cada cobro</small></span></button>\n    <button class=\"link-btn\" type=\"button\" data-action=\"logout\">Cerrar sesión de demostración</button>\n  </section>\n</template>\n","charge":"<template id=\"charge\">\n  <section class=\"screen\">\n    <button class=\"back\" type=\"button\" data-action=\"chargeBack\">← {{backLabel}}</button>\n    <h1 class=\"title\">{{title}}</h1>\n    <p class=\"subtitle\">{{subtitle}}</p>\n    <div {{captureHidden}}>\n      <div class=\"choice charge-tabs\" role=\"group\" aria-label=\"Forma de calcular el cobro\"><button type=\"button\" data-mode=\"voice\" aria-pressed=\"{{voiceActive}}\">Con voz</button><button type=\"button\" data-mode=\"calculator\" aria-pressed=\"{{calculatorActive}}\">Calculadora</button></div>\n      <div {{voiceHidden}}>\n        <div class=\"mic-halo cv-mic-halo\"><button class=\"mic-core cv-mic-button {{listeningClass}}\" type=\"button\" data-action=\"listen\" aria-label=\"{{micLabel}}\" aria-pressed=\"{{listening}}\"><svg class=\"cv-mic-symbol\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\"/><path d=\"M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8\"/></svg><svg class=\"cv-record-symbol\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><rect x=\"8.3\" y=\"8.3\" width=\"7.4\" height=\"7.4\" rx=\"1.2\" fill=\"currentColor\" stroke=\"none\"/></svg><strong class=\"cv-mic-button-label\">{{micButtonText}}</strong></button></div>\n        <p class=\"speech-label\">{{speechLabel}}</p>\n        <p class=\"mini-note\" {{lastTranscriptHidden}}>Último dictado: {{lastTranscript}}</p>\n        <p class=\"speech-hint\">Puedes decir: “suma 20, más 50, más 80” o “dos cafés de 45 y tres panes de 30”.</p>\n        <button class=\"link-btn\" type=\"button\" data-action=\"voiceReadToggle\" aria-pressed=\"{{voiceReadAloud}}\">Lectura de respuestas: {{voiceReadLabel}}</button>\n        <div class=\"field\"><label for=\"spoken\">¿Qué vendiste? También puedes escribirlo</label><textarea class=\"input\" id=\"spoken\" placeholder=\"Ej. Cobra 85 pesos\" spellcheck=\"true\">{{voiceText}}</textarea></div>\n        <button class=\"secondary\" type=\"button\" data-action=\"interpret\">Interpretar frase</button>\n        <div class=\"notice\" role=\"status\">{{voiceMessage}}</div>\n        <div class=\"summary-card\" aria-label=\"Venta actual en MXN\">{{{voiceItems}}}<p class=\"amount-label\">Total para cobrar · MXN</p><p class=\"amount\">{{voiceTotal}}</p></div>\n        <button class=\"primary\" type=\"button\" data-action=\"voiceConfirm\">Revisar total →</button>\n        <button class=\"link-btn\" type=\"button\" data-action=\"voiceClear\">Limpiar venta</button>\n        <p class=\"mini-note\">El dictado requiere permiso de micrófono y usa el servicio de tu navegador, que podría procesar el audio. También puedes escribir el cobro.</p>\n      </div>\n      <div {{calculatorHidden}}>\n        <div class=\"calc-box\"><div class=\"calc-display\"><span>Tu cuenta</span><output class=\"calc-expression\" aria-label=\"Operación actual\">{{calculation}}</output></div><div class=\"keypad\">{{{keys}}}</div></div>\n        <button class=\"primary\" type=\"button\" data-action=\"calcPay\">Cobrar resultado →</button>\n      </div>\n    </div>\n    <div {{confirmationHidden}}>\n      <div class=\"summary-card\">\n        <p class=\"amount-label\">Total por cobrar</p><p class=\"amount\">{{amount}}</p>\n        <p class=\"charge-description\">{{description}}</p>\n        <div class=\"field\"><label for=\"amountEdit\">Corregir importe (pesos)</label><input class=\"input\" id=\"amountEdit\" type=\"number\" inputmode=\"decimal\" step=\"0.01\" min=\"0.01\" max=\"999999.99\" value=\"{{amountInput}}\"></div>\n        <button class=\"secondary\" type=\"button\" data-action=\"speakAmount\">Escuchar el importe</button>\n      </div>\n      <button class=\"primary\" type=\"button\" data-action=\"generateQR\">Generar QR de demostración →</button>\n      <p class=\"mini-note\">Confirma el importe antes de continuar. No se crea una solicitud bancaria.</p>\n    </div>\n    {{{error}}}\n  </section>\n</template>\n\n<template id=\"voiceItem\">\n  <div class=\"summary-row\"><span>{{label}}</span><strong>{{amount}}</strong></div>\n</template>\n\n<template id=\"calculatorKey\">\n  <button class=\"key {{classes}}\" type=\"button\" data-key=\"{{key}}\" aria-label=\"{{label}}\">{{key}}</button>\n</template>\n","payment":"<template id=\"payment\">\n  <section class=\"screen\">\n    <button class=\"back\" type=\"button\" data-to=\"home\">← Volver al inicio</button>\n    <div class=\"payment-success\" aria-hidden=\"true\" {{paidHidden}}>✓</div>\n    <h1 class=\"title\">{{title}}</h1>\n    <p class=\"subtitle\">{{subtitle}}</p>\n    <div class=\"summary-card\">\n      <p class=\"amount-label\">Importe de prueba</p><p class=\"amount\">{{amount}}</p>\n      <div class=\"summary-row\"><span>Negocio</span><strong>{{businessName}}</strong></div>\n      <div class=\"summary-row\"><span>Referencia</span><strong>{{reference}}</strong></div>\n      <div class=\"summary-row\"><span>Creado</span><strong>{{createdAt}}</strong></div>\n      <p class=\"charge-description\">{{description}}</p>\n      <div {{pendingHidden}}>\n        <div class=\"qr-wrap demo-qr\" role=\"img\" aria-label=\"Código QR de demostración con el importe, no válido para pagar\">{{{qr}}}</div>\n        <p class=\"amount-label\">QR DEMO · NO PAGABLE</p>\n        <div class=\"status\"><div class=\"status-bubble\">⌛</div><div><h3>En espera · simulación</h3><p>Este QR es ilustrativo. No representa una solicitud de pago.</p></div></div>\n      </div>\n      <p class=\"notice\" {{paidHidden}}>{{paidMessage}}</p>\n    </div>\n    <div {{pendingHidden}}><button class=\"primary\" type=\"button\" data-action=\"simulatePaid\">Simular pago recibido ✓</button><button class=\"secondary\" type=\"button\" data-action=\"editAmount\">Corregir importe</button></div>\n    <div {{paidHidden}}><button class=\"primary\" type=\"button\" data-action=\"nextSale\">+ Cobrar al siguiente cliente →</button><button class=\"secondary\" type=\"button\" data-to=\"history\">Ver mis movimientos</button></div>\n  </section>\n</template>\n","history":"<template id=\"history\">\n  <section class=\"screen\">\n    <button class=\"back\" type=\"button\" data-to=\"home\">← Volver al inicio</button>\n    <h1 class=\"title\">Mis movimientos</h1>\n    <p class=\"subtitle\">Consulta cada cobro y revisa su estado.</p>\n    <div class=\"notice\" role=\"note\"><strong>OPERACIONES DE DEMOSTRACIÓN</strong><br>Los ejemplos y movimientos de esta sesión no son transferencias bancarias ni ingresos reales.</div>\n    <div {{listingHidden}}>\n      <div class=\"movement-summary\">\n        <div class=\"summary-card\"><p class=\"amount-label\">Total confirmado · demo</p><p class=\"movement-summary-amount\">{{total}}</p></div>\n        <div class=\"summary-card\"><p class=\"amount-label\">Pendiente · demo</p><p class=\"movement-summary-amount\">{{pendingTotal}}</p></div>\n      </div>\n      <p class=\"mini-note\">{{count}} {{operationLabel}} de prueba. Solo los confirmados se incluyen en el total.</p>\n      <div class=\"field\"><label for=\"historySearch\">Buscar movimiento</label><input class=\"input\" id=\"historySearch\" type=\"search\" autocomplete=\"off\" placeholder=\"Referencia, negocio o importe\" value=\"{{query}}\"></div>\n      <div class=\"history-filters\" role=\"group\" aria-label=\"Filtrar movimientos por estado\">\n        <button class=\"history-filter\" type=\"button\" data-history-filter=\"all\" aria-pressed=\"{{allPressed}}\">Todos</button>\n        <button class=\"history-filter\" type=\"button\" data-history-filter=\"confirmed\" aria-pressed=\"{{confirmedPressed}}\">Confirmados</button>\n        <button class=\"history-filter\" type=\"button\" data-history-filter=\"pending\" aria-pressed=\"{{pendingPressed}}\">Pendientes</button>\n        <button class=\"history-filter\" type=\"button\" data-history-filter=\"unpaid\" aria-pressed=\"{{unpaidPressed}}\">Sin pago</button>\n      </div>\n      <div class=\"history-list\" id=\"historyList\" role=\"list\" aria-label=\"Movimientos de demostración\" aria-live=\"polite\" {{listHidden}}>{{{items}}}</div>\n      <p class=\"empty\" role=\"status\" {{emptyHidden}}>No hay movimientos con este filtro.<br>Prueba otro estado, limpia la búsqueda o prepara un cobro de demostración.</p>\n      <button class=\"primary\" type=\"button\" data-charge=\"calculator\">+ Nuevo cobro</button>\n    </div>\n    <div {{detailHidden}}>\n      {{{detail}}}\n      <button class=\"secondary\" type=\"button\" data-action=\"readMovement\">Escuchar movimiento</button>\n      <button class=\"primary\" type=\"button\" data-action=\"backToMovements\">Ver todos los movimientos</button>\n    </div>\n  </section>\n</template>\n\n<template id=\"historyItem\">\n  <div class=\"movement-record\" role=\"listitem\">\n    <button class=\"movement-item\" type=\"button\" data-movement-ref=\"{{reference}}\" aria-label=\"Ver movimiento {{reference}}, {{amount}}, {{statusLabel}}\">\n      <span class=\"movement-main\"><strong>{{amount}}</strong><small>{{businessName}}</small><small>{{createdAt}}</small><small>Ref. {{reference}}</small><small>{{methodLabel}}</small></span>\n      <span class=\"movement-end\"><span class=\"movement-badge\" data-status-label=\"{{statusLabel}}\">{{statusLabel}}</span><span class=\"movement-arrow\" aria-hidden=\"true\">›</span></span>\n    </button>\n  </div>\n</template>\n\n<template id=\"movementDetail\">\n  <h2 class=\"movement-detail-title\">Tu cobro</h2>\n  <div class=\"summary-card movement-detail-card\">\n    <span class=\"movement-badge\" data-status-label=\"{{statusLabel}}\">{{statusLabel}} · DEMO</span>\n    <p class=\"amount\">{{amount}}</p>\n    <div class=\"summary-row\"><span>Negocio</span><strong>{{businessName}}</strong></div>\n    <div class=\"summary-row\"><span>Referencia</span><strong>{{reference}}</strong></div>\n    <div class=\"summary-row\"><span>Creado</span><strong>{{createdAt}}</strong></div>\n    <div class=\"summary-row\"><span>Confirmado</span><strong>{{confirmedAt}}</strong></div>\n    <div class=\"summary-row\"><span>Origen</span><strong>{{methodLabel}}</strong></div>\n    <div class=\"summary-row\"><span>Concepto</span><strong>{{description}}</strong></div>\n  </div>\n  <p class=\"notice\">Este movimiento es ficticio y no constituye un comprobante bancario. En producción, el servidor verificará el pago antes de mostrarlo como confirmado.</p>\n</template>\n"};
const app = document.getElementById('app');
const shell = document.getElementById('phone');
const $ = id => document.getElementById(id);
const pageNames = ['access', 'registration', 'home', 'charge', 'payment', 'history'];
const templates = Object.create(null);
const initialState = () => ({
  screen: 'access',
  authMode: 'phone', registrationStep: 'identity', intent: 'login',
  authenticated: false, authSession: null, redirectAfterAuth: null,
  fullName: '', businessName: '', dob: '', phone: '', email: '', entity: 'person', holder: '', clabe: '', rfc: '',
  consent: false, code: '', verified: false, phoneRawProblem: false, showClabe: false,
  error: '', large: false, contrast: false, chargeMode: 'voice', source: 'voice',
  voiceText: '', voiceLastTranscript: '', listening: false, voiceStatus: 'ready', voiceReadAloud: false, calculation: '0', amount: 0, amountInput: '',
  voiceItems: [], voiceMessage: '', description: '', payment: null, history: [], lastId: 0,
  historyFilter: 'all', historyQuery: '', selectedMovementRef: '', historyDemoExamples: true
});
let data = initialState();
let loaded = false;
let lastRoutedHash = '';
const voiceInput = createVoiceController({
  onState(status) {
    data.voiceStatus = status;
    data.listening = ['requesting', 'listening', 'processing'].includes(status);
    if (data.screen === 'charge' && data.chargeMode === 'voice') paintVoiceState();
  },
  onTranscript(text) {
    if (data.screen !== 'charge' || data.chargeMode !== 'voice') return;
    data.voiceText = '';
    data.voiceLastTranscript = text;
    data.error = '';
    announce('Escuché: ' + text);
    handleVoicePhrase(text);
  },
  onError(message) {
    data.listening = false;
    data.voiceStatus='error';
    if (data.screen === 'charge' && data.chargeMode === 'voice') fail(message);
  }
});
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const digits = value => String(value ?? '').replace(/\D/g, '');
const html = value => ({ __html: String(value ?? '') });
const hiddenUnless = condition => condition ? '' : 'hidden';

function renderTemplate(name, values = {}) {
  if (!Object.hasOwn(templates, name)) throw new Error('Plantilla no cargada: ' + name);
  return templates[name].replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, raw, escaped) => {
    const key = raw || escaped;
    if (!Object.hasOwn(values, key)) throw new Error('Marcador ausente en ' + name + ': ' + key);
    const value = values[key];
    if (!raw) return safe(value);
    if (!value || typeof value.__html !== 'string') throw new Error('HTML no confiable en ' + name);
    return value.__html;
  });
}

function loadViews() {
  for (const [name, source] of Object.entries(CV_EMBEDDED_VIEWS)) {
    for (const match of source.matchAll(/<template id="([\w-]+)">([\s\S]*?)<\/template>/g)) {
      if (Object.hasOwn(templates,match[1]))throw new Error('Plantilla duplicada: '+match[1]);
      templates[match[1]]=match[2];
    }
    if(!Object.hasOwn(templates,name))throw new Error('Falta la plantilla principal: '+name);
  }
  return Promise.resolve();
}

const errorHtml = () => html(data.error ? renderTemplate('feedback', { message: data.error }) : '');
const smsHtml = () => html(renderTemplate('smsForm', {
  maskedPhone: data.phone.slice(0, 2) + '•••' + data.phone.slice(-4), code: data.code, error: errorHtml(),
  deliveryNotice: getSupabaseConfig().configured ? 'Ingresa el código que recibiste por SMS.' : 'No se envían SMS en esta demo: utiliza 123456 para probar.'
}));
function dateLocal() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
function birthAge(birth) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return -1;
  const [year, month, day] = birth.split('-').map(Number);
  const date = new Date(year, month - 1, day), now = new Date();
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > now) return -1;
  return now.getFullYear() - year - (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day) ? 1 : 0);
}
function validatePhone(value) {
  const raw = String(value).trim(), number = digits(raw);
  if (raw.startsWith('+')) return /^52\d{10}$/.test(number) ? number.slice(2) : null;
  if (/^52\d{10}$/.test(number)) return number.slice(2);
  return /^\d{10}$/.test(number) ? number : null;
}
function clabeValid(value) {
  if (!/^\d{18}$/.test(value)) return false;
  const weights = [3, 7, 1];
  const sum = [...value.slice(0, 17)].reduce((total, digit, index) => total + (Number(digit) * weights[index % 3]) % 10, 0);
  return (10 - sum % 10) % 10 === Number(value[17]);
}
function checkIdentity() {
  if (data.fullName.trim().length < 3) return fail('Escribe tu nombre completo.');
  const age = birthAge(data.dob);
  if (age < 18) return fail(age < 0 ? 'Ingresa una fecha de nacimiento válida.' : 'Para registrarte debes tener al menos 18 años.');
  const phone = validatePhone(data.phone);
  if (!phone || data.phoneRawProblem) return fail('Ingresa un celular mexicano de 10 dígitos, con prefijo +52 si lo incluyes.');
  if (!data.consent) return fail('Confirma tu mayoría de edad y que el número es tuyo.');
  data.phone = phone;
  return true;
}
function checkBank() {
  if (!data.verified) return fail('Verifica tu celular antes de continuar.');
  const businessName = data.businessName.trim();
  if (businessName.length < 2 || businessName.length > 70) return fail('Ingresa el nombre del negocio, de 2 a 70 caracteres.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return fail('Revisa el formato del correo electrónico.');
  if (data.holder.trim().length < 3) return fail('Escribe el nombre legal del titular.');
  if (!clabeValid(data.clabe)) return fail('Revisa los 18 dígitos y el dígito de control de la CLABE, o completa datos de demostración.');
  return true;
}
function validAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0.01 && amount <= 999999.99;
}
function announce(message) {
  $('announcer').textContent = '';
  window.setTimeout(() => { $('announcer').textContent = message; }, 20);
}
function say(message) {
  return speakText(message, { rate: 0.9 });
}
function fail(message) {
  data.error = message;
  render();
  announce(message);
  return false;
}

const registrationCopy = {
  identity: ['Identidad', 'Primero, hablemos de ti.', 'Confirma tu edad declarada y tu celular mexicano.'],
  code: ['Verificación', 'Confirma tu celular.', 'Escribe el código de seis dígitos para continuar.'],
  bank: ['Cuenta CoDi', '¿Dónde recibirás tus pagos?', 'Agrega los datos de tu cuenta bancaria mexicana.'],
  review: ['Revisión', 'Revisa tu cuenta.', 'Confirma los datos antes de preparar la solicitud de prueba.'],
  ready: ['Preparado', 'Tu registro está preparado.', 'Explora la demo y configura tu acceso rápido.']
};
const screens = {
  access: () => renderTemplate('access', {
    phone: data.phone, phoneHidden: hiddenUnless(data.authMode === 'phone'),
    accessNotice: getSupabaseConfig().configured ? 'Acceso mediante SMS. Los botones de rostro, huella o PIN son de demostración.' : 'Acceso de demostración. No se envían SMS ni se registra tu biometría.',
    error: data.authMode === 'phone' ? errorHtml() : html(''), sms: data.authMode === 'code' ? smsHtml() : html('')
  }),
  registration: () => {
    const stage = data.registrationStep, [stepLabel, title, subtitle] = registrationCopy[stage];
    return renderTemplate('registration', {
      stepLabel, title, subtitle, fullName: data.fullName, businessName: data.businessName, today: dateLocal(), dob: data.dob, phone: data.phone,
      consentChecked: data.consent ? 'checked' : '', email: data.email, holder: data.holder,
      clabe: data.clabe, clabeLast: data.clabe.slice(-4), clabeType: data.showClabe ? 'text' : 'password',
      clabeLabel: data.showClabe ? 'Ocultar' : 'Mostrar', rfc: data.rfc, isPerson: data.entity === 'person',
      isBusiness: data.entity === 'business', entityLabel: data.entity === 'person' ? 'Persona física' : 'Persona moral',
      identityHidden: hiddenUnless(stage === 'identity'), bankHidden: hiddenUnless(stage === 'bank'),
      reviewHidden: hiddenUnless(stage === 'review'), readyHidden: hiddenUnless(stage === 'ready'),
      rfcHidden: hiddenUnless(data.entity === 'business'), sms: stage === 'code' ? smsHtml() : html(''),
      identityError: stage === 'identity' ? errorHtml() : html(''), bankError: stage === 'bank' ? errorHtml() : html(''),
      reviewError: stage === 'review' ? errorHtml() : html('')
    });
  },
  home: () => renderTemplate('home', { name: data.fullName.trim().split(/\s+/)[0] || 'bienvenido', businessName: merchantName() }),
  charge: () => {
    const mode = data.chargeMode, confirming = mode === 'review';
    const labels = { '÷': 'Dividir', '×': 'Multiplicar', '−': 'Restar', '+': 'Sumar', C: 'Limpiar', '⌫': 'Borrar último', '=': 'Igual' };
    const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'C', '0', '.', '+', '⌫', '='].map(key => renderTemplate('calculatorKey', {
      key, label: labels[key] || key, classes: ['÷', '×', '−', '+'].includes(key) ? 'operation' : key === '=' ? 'equal' : key === 'C' ? 'clear' : ''
    })).join('');
    return renderTemplate('charge', {
      title: confirming ? 'Confirma el importe' : mode === 'voice' ? 'Cobrar con voz' : 'Calcular y cobrar',
      subtitle: confirming ? 'Revisa el total antes de mostrar el QR.' : 'Prepara tu venta con voz o con calculadora.',
      backLabel: confirming ? 'Editar la venta' : 'Volver al inicio',
      captureHidden: hiddenUnless(!confirming), confirmationHidden: hiddenUnless(confirming),
      voiceHidden: hiddenUnless(mode === 'voice'), calculatorHidden: hiddenUnless(mode === 'calculator'),
      voiceActive: mode === 'voice', calculatorActive: mode === 'calculator', listening: data.listening,
      listeningClass: data.voiceStatus==='listening'?'listening':data.voiceStatus==='requesting'?'requesting':data.voiceStatus==='processing'?'processing':'ready', micLabel: data.listening ? 'Detener dictado' : 'Activar micrófono', micButtonText:data.voiceStatus==='listening'?'Grabando':data.voiceStatus==='requesting'?'Activando':data.voiceStatus==='processing'?'Procesando':'Hablar',
      speechLabel: data.voiceStatus==='listening'?'Te escucho…':data.voiceStatus==='requesting'?'Activando micrófono…':data.voiceStatus==='processing'?'Calculando…':'Toca el botón verde para hablar', voiceText: data.voiceText,
      voiceReadAloud: data.voiceReadAloud, voiceReadLabel: data.voiceReadAloud ? 'activada' : 'desactivada',
      lastTranscript: data.voiceLastTranscript, lastTranscriptHidden: hiddenUnless(Boolean(data.voiceLastTranscript)),
      voiceMessage: data.voiceMessage, voiceTotal: money(voiceTotal()),
      voiceItems: html(data.voiceItems.map(item => renderTemplate('voiceItem', { label: item.label, amount: money(item.cents / 100) })).join('')),
      calculation: data.calculation, keys: html(keys), amount: money(data.amount), amountInput: data.amountInput,
      description: data.description, error: errorHtml()
    });
  },
  payment: () => {
    const payment = data.payment, paid = payment.status === 'confirmed';
    return renderTemplate('payment', {
      title: paid ? '¡Operación simulada!' : 'Muestra tu QR',
      subtitle: paid ? 'La operación de prueba quedó registrada en esta sesión.' : 'Código ilustrativo. No puede utilizarse para pagar.',
      amount: money(payment.amount), description: payment.description,
      businessName: payment.businessName, reference: payment.reference, createdAt: displayDate(payment.createdAt),
      paidMessage: 'Pagaste ' + money(payment.amount) + ' MXN en ' + payment.businessName + '. Operación simulada.',
      pendingHidden: hiddenUnless(!paid), paidHidden: hiddenUnless(paid), qr: html(paid ? '' : demoQrSvg(payment.amount))
    });
  },
  history: () => {
    const records = movementRecords(), totals = movementTotals(records);
    const filtered = filterMovements(records, { status: data.historyFilter, query: data.historyQuery });
    const selected = records.find(record => record.reference === data.selectedMovementRef);
    return renderTemplate('history', {
      total: money(totals.confirmed), pendingTotal: money(totals.pending), count: records.length,
      operationLabel: records.length === 1 ? 'operación' : 'operaciones', query: data.historyQuery,
      allPressed: data.historyFilter === 'all', confirmedPressed: data.historyFilter === 'confirmed',
      pendingPressed: data.historyFilter === 'pending', unpaidPressed: data.historyFilter === 'unpaid',
      listingHidden: hiddenUnless(!data.selectedMovementRef), detailHidden: hiddenUnless(Boolean(data.selectedMovementRef)),
      listHidden: hiddenUnless(filtered.length > 0), emptyHidden: hiddenUnless(filtered.length === 0),
      items: html(filtered.map(record => renderTemplate('historyItem', movementValues(record))).join('')),
      detail: html(selected ? renderTemplate('movementDetail', movementValues(selected)) : data.selectedMovementRef ? renderTemplate('feedback', { message: 'No encontramos este movimiento en la sesión.' }) : '')
    });
  }
};


const DEMO_MOVEMENTS_KEY='cobravoz.demo.movements.v1';
function restoreDemoMovements(){
  if(!hasActiveSession(data)||data.authSession?.mode!=='demo')return;
  try{
    const p=JSON.parse(localStorage.getItem(DEMO_MOVEMENTS_KEY)||'null');
    if(!p||p.owner!==data.authSession.phone||!Array.isArray(p.items))return;
    const list=p.items.filter(x=>x&&typeof x.reference==='string'&&x.reference.length<100&&
      Number.isFinite(x.amount)&&x.amount>0&&x.amount<=999999.99&&
      ['pending','confirmed','expired','failed'].includes(x.status)&&
      ['voice','calculator'].includes(x.method)).slice(0,500);
    data.history=list;data.historyDemoExamples=list.length===0;
    data.lastId=Math.max(0,Number(p.lastId)||0,...list.map(x=>Number(x.id)||0));
  }catch{}
}
function persistDemoMovements(){
  if(data.authSession?.mode!=='demo')return;
  try{localStorage.setItem(DEMO_MOVEMENTS_KEY,JSON.stringify({
    owner:data.authSession.phone,lastId:data.lastId,items:data.history.slice(0,500)
  }));}catch{}
}
function clearDemoMovements(){try{localStorage.removeItem(DEMO_MOVEMENTS_KEY);}catch{}}
function resetNextSale(mode='voice'){
  stopListening();
  data.voiceItems=[];data.voiceText='';data.voiceLastTranscript='';data.voiceMessage='';
  data.calculation='0';data.amount=0;data.amountInput='';data.description='';data.payment=null;
  data.chargeMode=mode;data.error='';
  go('charge');
}
function keepSessionFresh(){
  if(data.authSession?.mode!=='supabase')return;
  refreshSessionIfNeeded(data).then(ok=>{
    if(!ok&&!hasActiveSession(data)&&loaded){
      data.authMode='phone';
      go('access');
      fail('Tu sesión venció o fue revocada. Vuelve a entrar para proteger tus cobros.');
    }
  }).catch(()=>{});
}

function merchantName() { return data.businessName.trim() || 'Negocio de demostración'; }
function displayDate(value) { return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Pendiente'; }
function movementRecords() { return data.historyDemoExamples ? exampleMovements() : data.history; }
function movementValues(record) {
  return {
    amount: money(record.amount), reference: record.reference, businessName: record.businessName,
    statusLabel: movementStatus(record.status).label, createdAt: displayDate(record.createdAt),
    confirmedAt: displayDate(record.confirmedAt), methodLabel: record.method === 'voice' ? 'Voz' : 'Calculadora',
    description: record.description || 'Cobro de demostración'
  };
}
function voiceTotal() { return data.voiceItems.reduce((total, item) => total + item.cents, 0) / 100; }
function reviewVoiceTotal() {
  prepareCharge(voiceTotal(), data.voiceItems.map(item => item.label + ': ' + money(item.cents / 100)).join(' + '), 'voice');
}
function handleVoicePhrase(text) {
  const result = processVoiceCommand(text, data.voiceItems);
  if (result.error) return fail(result.message);
  data.voiceItems = result.items;
  data.voiceMessage = result.message;
  data.error = '';
  if (result.confirm) reviewVoiceTotal(); else render();
  if (data.voiceReadAloud && !result.confirm) say(result.message);
}


/* Los estados del micrófono se pintan sin reconstruir el botón: evita cortes en Safari. */
function paintVoiceState() {
  const mic=app.querySelector('[data-action="listen"]');
  if(!mic)return;
  const status=data.voiceStatus||'ready';
  for(const value of ['listening','requesting','processing','ready'])mic.classList.toggle(value,value===status);
  mic.setAttribute('aria-pressed',String(data.listening));
  mic.setAttribute('aria-label',data.listening?'Detener dictado':'Activar micrófono');
  const label=mic.querySelector('.cv-mic-button-label');
  if(label)label.textContent=status==='listening'?'Grabando':status==='requesting'?'Activando':status==='processing'?'Procesando':'Hablar';
  mic.closest('.mic-halo')?.classList.toggle('recording',status==='listening');
  const speech=app.querySelector('.speech-label');
  if(speech)speech.textContent=status==='listening'?'Te escucho…':status==='requesting'?'Activando micrófono…':status==='processing'?'Calculando…':'Toca el botón verde para hablar';
}

function render(focus = false) {
  if (!loaded) return;
  const focusedKey = document.activeElement?.dataset.key;
  app.innerHTML = screens[data.screen]();
  shell.classList.toggle('large', data.large);
  shell.classList.toggle('contrast', data.contrast);
  paintVoiceState();
  $('largeBtn').setAttribute('aria-pressed', String(data.large));
  $('contrastBtn').setAttribute('aria-pressed', String(data.contrast));
  const nav=$('workNav');
  if(nav){
    nav.hidden=!hasActiveSession(data)||!['charge','history','payment'].includes(data.screen);
    const active=data.screen==='history'?'history'
      :data.screen==='charge'&&data.chargeMode==='voice'?'voice'
      :data.screen==='charge'&&data.chargeMode==='calculator'?'calculator':'';
    nav.querySelectorAll('[data-work-nav]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workNav===active)));
  }
  const smsActive = (data.screen === 'access' && data.authMode === 'code') || (data.screen === 'registration' && data.registrationStep === 'code');
  if (smsActive) {
    startSmsOtpListener(app.querySelector('#smsForm'), app.querySelector('#code'));
  } else {
    stopSmsOtpListener();
  }
  if (!focus && focusedKey) {
    [...app.querySelectorAll('[data-key]')].find(button => button.dataset.key === focusedKey)?.focus({ preventScroll: true });
  }
  if (focus) {
    shell.scrollTop = 0;
    const title = app.querySelector('h1');
    title?.setAttribute('tabindex', '-1');
    title?.focus({ preventScroll: true });
  }
}
function stopListening() {
  voiceInput.cancel();
  data.listening = false;
  data.voiceStatus='ready';
}
function syncHash(replace = false) {
  const routes = {
    access: '/acceso', registration: '/registro', home: '/inicio',
    charge: '/cobrar/' + ({ voice: 'voz', calculator: 'calculadora', review: 'confirmacion' }[data.chargeMode]),
    payment: data.payment?.status === 'confirmed' ? '/cobrar/comprobante' : '/cobrar/qr',
    history: '/movimientos' + (data.selectedMovementRef ? '/' + encodeURIComponent(data.selectedMovementRef) : '')
  };
  const route = '#' + routes[data.screen];
  if (location.hash !== route) history[replace ? 'replaceState' : 'pushState'](null, '', route);
  lastRoutedHash = route;
}
function go(screen, fromHash = false) {
  if (!pageNames.includes(screen)) return;
  stopListening();
  stopSmsOtpListener();
  if (isProtectedRoute(screen) && !hasActiveSession(data)) {
    data.redirectAfterAuth = screen === 'payment' ? 'home' : screen;
    data.screen = 'access';
    data.authMode = 'phone';
    data.error = 'Inicia sesión para acceder a tus cobros.';
    syncHash(fromHash);
    render(true);
    announce(data.error);
    return;
  }
  if (screen === 'payment' && !data.payment) {
    data.screen = 'home';
    data.error = '';
    syncHash(true);
    render(true);
    return;
  }
  data.screen = screen;
  data.error = '';
  syncHash(fromHash);
  render(true);
}
function applyHashRoute(announceError = false) {
  let hash = location.hash.replace(/^#/, '');
  if (!hash) {
    if (hasActiveSession(data) && !loaded) data.screen = 'home';
    return;
  }
  if (hash === 'cobros') {
    if (!hasActiveSession(data)) {
      establishSession(data, { mode: 'demo', source: 'hash-cobros', phone: data.phone || '5500000000' });
    }
    if (loaded) {
      go('home', true);
    } else {
      data.screen = 'home';
      data.error = '';
    }
    return;
  }
  const movementMatch = hash.match(/^\/movimientos(?:\/(.+))?$/);
  if (movementMatch) {
    try { data.selectedMovementRef = decodeURIComponent(movementMatch[1] || ''); } catch { data.selectedMovementRef = ''; }
    hash = 'history';
  } else {
    const aliases = {
      '/inicio': 'home', '/acceso': 'access', '/bienvenida': 'access', '/registro': 'registration',
      '/cobrar/voz': 'charge', '/cobrar/calculadora': 'charge', '/cobrar/confirmacion': 'charge',
      '/cobrar/qr': 'payment', '/cobrar/comprobante': 'payment'
    };
    const modes = { '/cobrar/voz': 'voice', '/cobrar/calculadora': 'calculator', '/cobrar/confirmacion': 'review' };
    if (modes[hash]) data.chargeMode = modes[hash];
    hash = aliases[hash] || hash;
  }
  if (!pageNames.includes(hash)) return;
  if (loaded) {
    go(hash, true);
    return;
  }
  if (isProtectedRoute(hash) && !hasActiveSession(data)) {
    data.redirectAfterAuth = hash === 'payment' ? 'home' : hash;
    data.screen = 'access';
    data.authMode = 'phone';
    data.error = 'Inicia sesión para acceder a tus cobros.';
    if (announceError) announce(data.error);
    return;
  }
  if (hash === 'payment' && !data.payment) {
    data.screen = 'home';
    return;
  }
  data.screen = hash;
}
function registrationStep(step) {
  data.registrationStep = step;
  go('registration');
}
function setChargeMode(mode) {
  if (!['voice', 'calculator', 'review'].includes(mode)) return;
  stopListening();
  data.chargeMode = mode;
  data.error = '';
  syncHash();
  render(true);
}
function prepareCharge(amount, description, source) {
  if (!validAmount(amount)) return fail('El importe debe estar entre $0.01 y $999,999.99.');
  data.amount = Math.round(amount * 100) / 100;
  data.amountInput = data.amount.toFixed(2);
  data.description = description;
  data.source = source;
  setChargeMode('review');
  if (source === 'voice' && data.voiceReadAloud) say('El total es ' + data.amount + ' pesos. Revisa y confirma el importe.');
}
function listen() {
  try { window.speechSynthesis?.cancel(); } catch {}
  voiceInput.toggle();
}

app.addEventListener('input', event => {
  const field = event.target;
  const directFields = { fullName: 'fullName', businessName: 'businessName', dob: 'dob', email: 'email', holder: 'holder', spoken: 'voiceText', amountEdit: 'amountInput' };
  if (directFields[field.id]) { data[directFields[field.id]] = field.value; return; }
  switch (field.id) {
    case 'phoneNumber':
    case 'loginPhoneInput': {
      const raw = field.value, normalized = validatePhone(raw);
      if (!normalized || normalized !== validatePhone(data.phone)) { data.verified = false; data.code = ''; }
      data.phoneRawProblem = (raw.trim().startsWith('+') && !raw.trim().startsWith('+52')) || (digits(raw).length > 10 && !normalized);
      data.phone = raw;
      break;
    }
    case 'code': data.code = digits(field.value).slice(0, 6); field.value = data.code; break;
    case 'clabe': data.clabe = digits(field.value).slice(0, 18); field.value = data.clabe; break;
    case 'rfc': data.rfc = field.value.toUpperCase(); field.value = data.rfc; break;
    case 'adultConsent': data.consent = field.checked; break;
    case 'historySearch': {
      data.historyQuery = field.value;
      const start = field.selectionStart;
      render();
      const search = $('historySearch');
      search?.focus({ preventScroll: true });
      search?.setSelectionRange(start, start);
      break;
    }
  }
});
app.addEventListener('change', event => {
  if (event.target.id === 'adultConsent') data.consent = event.target.checked;
});
let authBusy = false;
app.addEventListener('submit', async event => {
  event.preventDefault();
  if (authBusy) return;
  data.error = '';
  switch (event.target.id) {
    case 'identityForm': {
      if (!checkIdentity()) return;
      stopSmsOtpListener();
      data.intent = 'signup';
      if (!data.verified) {
        authBusy = true;
        try {
          const otpRes = await requestPhoneOtp(data.phone);
          if (!otpRes.ok) return fail(otpRes.error);
        } finally {
          authBusy = false;
        }
      }
      registrationStep(data.verified ? 'bank' : 'code');
      break;
    }
    case 'loginForm': {
      const phone = validatePhone(data.phone);
      if (!phone || data.phoneRawProblem) return fail('Ingresa un celular mexicano de 10 dígitos.');
      stopSmsOtpListener();
      authBusy = true;
      try {
        const otpRes = await requestPhoneOtp(phone);
        if (!otpRes.ok) return fail(otpRes.error);
      } finally {
        authBusy = false;
      }
      data.phone = phone;
      data.intent = 'login';
      data.code = '';
      data.authMode = 'code';
      go('access');
      break;
    }
    case 'smsForm': {
      stopSmsOtpListener();
      authBusy = true;
      let result;
      try {
        result = await verifyPhoneOtpCode(data.phone, data.code);
      } finally {
        authBusy = false;
      }
      if (!result.ok) return fail(result.error);
      establishSession(data, {
        mode: result.mode,
        source: 'sms',
        ...(result.session || {}),
        fullName: data.fullName
      });
      data.code = '';
      restoreDemoMovements();
      if (data.intent === 'signup') {
        registrationStep('bank');
      } else {
        const target = data.redirectAfterAuth || 'home';
        data.redirectAfterAuth = null;
        go(target);
      }
      break;
    }
    case 'bankForm':
      if (checkBank()) registrationStep('review');
      break;
  }
});
app.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.to) {
    if (button.dataset.to === 'history') data.selectedMovementRef = '';
    go(button.dataset.to); return;
  }
  if (button.dataset.movementRef) { data.selectedMovementRef = button.dataset.movementRef; go('history'); return; }
  if (button.dataset.historyFilter) { data.historyFilter = button.dataset.historyFilter; render(); return; }
  if (button.dataset.charge) { resetNextSale(button.dataset.charge); return; }
  if (button.dataset.mode) { setChargeMode(button.dataset.mode); return; }
  if (button.dataset.entity) { data.entity = button.dataset.entity; render(); return; }
  if (button.dataset.key) {
    const key = button.dataset.key;
    if (key === '=' && evaluate(data.calculation) === null) return fail('No se puede calcular esta operación.');
    data.calculation = updateCalculation(data.calculation, key);
    data.error = '';
    render();
    if (key === '=') announce('Resultado: ' + data.calculation);
    return;
  }
  switch (button.dataset.action) {
    case 'signup': data.intent = 'signup'; registrationStep('identity'); break;
    case 'demoLogin': {
      establishSession(data, { mode: 'demo', source: 'demo-login', phone: data.phone });
      restoreDemoMovements();
      const target = data.redirectAfterAuth || 'home';
      data.redirectAfterAuth = null;
      go(target);
      announce('Acceso simulado.');
      break;
    }
    case 'editPhone':
      stopSmsOtpListener();
      data.code = ''; data.verified = false; data.authMode = 'phone';
      if (data.intent === 'signup') registrationStep('identity'); else go('access');
      break;
    case 'registrationBack': {
      stopSmsOtpListener();
      const previous = { identity: null, code: 'identity', bank: 'identity', review: 'bank', ready: 'review' }[data.registrationStep];
      if (previous) registrationStep(previous);
      else { data.authMode = 'phone'; go('access'); }
      break;
    }
    case 'resend': {
      if (authBusy) break;
      stopSmsOtpListener();
      data.code = ''; data.error = '';
      authBusy = true;
      let otpRes;
      try {
        otpRes = await requestPhoneOtp(data.phone);
      } finally {
        authBusy = false;
      }
      if (!otpRes.ok) return fail(otpRes.error);
      render();
      announce(otpRes.mode === 'supabase' ? 'Se reenvió el código SMS a tu celular.' : 'El código de demostración es 123456.');
      break;
    }
    case 'toggleClabe': data.showClabe = !data.showClabe; render(); break;
    case 'fillTestClabe':
      data.clabe = '999123456789012346'; data.email = data.email.trim() || 'comercio.prueba@ejemplo.com';
      data.businessName = data.businessName.trim() || 'Tacos Juanita';
      data.holder = data.holder.trim() || 'Comercio de demostración'; data.showClabe = true; data.error = ''; render(); break;
    case 'simulateRequest': if (checkBank()) registrationStep('ready'); break;
    case 'demoPasskey': {
      establishSession(data, { mode: 'demo', source: 'demo-passkey', phone: data.phone, fullName: data.fullName, businessName: data.businessName });
      restoreDemoMovements();
      const target = data.redirectAfterAuth || 'home';
      data.redirectAfterAuth = null;
      go(target);
      announce('Acceso rápido simulado. No registramos huella ni rostro.');
      break;
    }
    case 'chargeBack': if (data.chargeMode === 'review') setChargeMode(data.source); else go('home'); break;
    case 'listen': listen(); break;
    case 'voiceReadToggle':
      data.voiceReadAloud = !data.voiceReadAloud;
      if (!data.voiceReadAloud) { try { window.speechSynthesis?.cancel(); } catch {} }
      render();
      break;
    case 'interpret': {
      stopListening();
      handleVoicePhrase(data.voiceText); break;
    }
    case 'voiceConfirm': stopListening(); reviewVoiceTotal(); break;
    case 'voiceClear': stopListening(); data.voiceItems = []; data.voiceText = ''; data.voiceMessage = 'Puedes iniciar una nueva venta.'; data.error = ''; render(); break;
    case 'calcPay': {
      const result = evaluate(data.calculation);
      if (result === null) return fail('Completa una operación válida antes de cobrar.');
      prepareCharge(result, 'Importe calculado: ' + data.calculation, 'calculator'); break;
    }
    case 'speakAmount':
      if (!validAmount(data.amountInput)) return fail('Revisa el importe antes de escucharlo.');
      say('El importe indicado es ' + data.amountInput + ' pesos.'); break;
    case 'generateQR':
      if (!validAmount(data.amountInput)) { fail('El importe debe estar entre $0.01 y $999,999.99.'); $('amountEdit').focus(); return; }
      data.amount = Math.round(Number(data.amountInput) * 100) / 100;
      data.lastId += 1;
      data.payment = {
        id: data.lastId, reference: 'CVDEMO-' + Date.now().toString(36).toUpperCase() + '-' + data.lastId,
        amount: data.amount, description: data.description, status: 'pending', businessName: merchantName(),
        method: data.source, createdAt: new Date().toISOString(), confirmedAt: null
      };
      data.historyDemoExamples = false;
      data.history.unshift(data.payment);
      persistDemoMovements();
      go('payment'); announce('QR ilustrativo generado. No es válido para pagar.'); break;
    case 'editAmount': data.chargeMode = 'review'; go('charge'); break;
    case 'simulatePaid':
      if (!data.payment || data.payment.status !== 'pending') return;
      data.payment.status = 'confirmed';
      data.payment.confirmedAt = new Date().toISOString();
      persistDemoMovements();
      syncHash();
      render(true); announce('Pago simulado. No se realizó una transferencia real.');
      if (data.voiceReadAloud) say('Pagaste ' + data.payment.amount + ' pesos mexicanos en ' + data.payment.businessName + '. Pago simulado.');
      break;
    case 'nextSale': resetNextSale('voice'); break;
    case 'backToMovements': data.selectedMovementRef = ''; go('history'); break;
    case 'readMovement': {
      const movement = movementRecords().find(record => record.reference === data.selectedMovementRef);
      if (movement) say('Movimiento de demostración por ' + movement.amount + ' pesos mexicanos en ' + movement.businessName + '. Estado ' + movementStatus(movement.status).label + '. Referencia ' + movement.reference);
      break;
    }
    case 'logout': {
      stopListening();
      stopSmsOtpListener();
      await signOutSession(data);
      clearDemoMovements();
      const { large, contrast } = data;
      data = { ...initialState(), screen: 'access', large, contrast };
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      window.speechSynthesis?.cancel();
      render(true); break;
    }
  }
});

$('workNav')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-work-nav]');
  if(!button||!hasActiveSession(data))return;
  const screen=button.dataset.workNav;
  if(screen==='history'){data.selectedMovementRef='';go('history');return;}
  if(screen==='voice'||screen==='calculator'){
    stopListening();data.chargeMode=screen;go('charge');
  }
});

$('largeBtn').addEventListener('click', () => { data.large = !data.large; render(); });
$('contrastBtn').addEventListener('click', () => { data.contrast = !data.contrast; render(); });
$('voiceBtn').addEventListener('click', () => {
  say((app.querySelector('h1')?.textContent || 'CobraVoz') + '. ' + (app.querySelector('.subtitle')?.textContent || ''));
});
function routeChanged() {
  if (location.hash === lastRoutedHash) return;
  lastRoutedHash = location.hash;
  applyHashRoute(true);
}
window.addEventListener('hashchange', routeChanged);
window.addEventListener('popstate', routeChanged);
window.addEventListener('pagehide', () => {
  stopListening();
  stopSmsOtpListener();
});
restoreSession(data);
restoreDemoMovements();
keepSessionFresh();
window.addEventListener('pageshow',keepSessionFresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)keepSessionFresh();});
window.setInterval(keepSessionFresh,60000);
applyHashRoute(false);
loadViews().then(() => {
  loaded = true;
  render();
  syncHash(true);
  if (data.error) announce(data.error);
}).catch(error => {
  console.error('No se pudieron cargar las vistas de CobraVoz.', error);
  app.textContent = 'No se pudieron cargar las pantallas. Recarga la página para intentarlo de nuevo.';
  app.setAttribute('role', 'alert');
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => console.error('No se pudo registrar el service worker.', error));
  });
}

