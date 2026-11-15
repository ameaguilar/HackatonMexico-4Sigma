import { money, evaluate, updateCalculation } from './payments.js';
import { createVoiceController, speakText } from './voice.js?v=voice-1';
import { processVoiceCommand } from './voice-commands.js';
import { demoQrSvg } from './demo-qr.js';
import { movementStatus, filterMovements, movementTotals, exampleMovements } from './movements.js';
import {
  isProtectedRoute,
  hasActiveSession,
  restoreSession,
  refreshSessionIfNeeded,
  establishSession,
  signOutSession,
  requestPhoneOtp,
  verifyPhoneOtpCode,
  startSmsOtpListener,
  stopSmsOtpListener,
  getSupabaseConfig
} from './supabase-auth.js';

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
async function loadViews() {
  const files = await Promise.all(pageNames.map(async name => {
    const response = await fetch('./pages/' + name + '.html');
    if (!response.ok) throw new Error('No se pudo cargar la vista ' + name);
    return [name, await response.text()];
  }));
  for (const [name, source] of files) {
    // Leer las plantillas sin serializarlas mantiene intactos los marcadores de atributos.
    for (const match of source.matchAll(/<template id="([\w-]+)">([\s\S]*?)<\/template>/g)) {
      if (Object.hasOwn(templates, match[1])) throw new Error('Plantilla duplicada: ' + match[1]);
      templates[match[1]] = match[2];
    }
    if (!Object.hasOwn(templates, name)) throw new Error('Falta la plantilla principal: ' + name);
  }
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
