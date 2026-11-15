// Cliente de autenticación Supabase, WebOTP y guardián de rutas protegidas para CobraVoz.
export const SUPABASE_PROJECT_REF = 'a0c4242b-2057-404e-ad69-19958fa9e54e';
export const PROTECTED_ROUTES = new Set(['home', 'charge', 'payment', 'history']);
export const PUBLIC_ROUTES = new Set(['access', 'registration']);

const SESSION_STORAGE_KEY = 'cobravoz.auth.session';
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // Demo: caja de jornada con cierre explícito.

let otpAbortController = null;

export function isProtectedRoute(screen) {
  return PROTECTED_ROUTES.has(screen);
}

function readMetaContent(name) {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || '';
}

export function getSupabaseConfig() {
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

export function hasActiveSession(state) {
  if (!state?.authenticated || !state?.authSession) return false;
  const expiresAt = Number(state.authSession.expiresAt || 0);
  if (expiresAt > 0 && expiresAt <= Date.now()) return state.authSession.mode === 'supabase' && Boolean(state.authSession.refreshToken);
  return true;
}

export function restoreSession(state) {
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

export function establishSession(state, sessionInfo = {}) {
  // La demo permanece abierta hasta cerrar sesión; Supabase respeta la expiración del servidor.
  const expiresAt = (sessionInfo.mode || 'demo') === 'demo'
    ? 0 : (Number(sessionInfo.expiresAt) || (Date.now() + DEFAULT_SESSION_TTL_MS));
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
export function refreshSessionIfNeeded(state){
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

export async function signOutSession(state) {
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

export async function requestPhoneOtp(phone) {
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

export async function verifyPhoneOtpCode(phone, code) {
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

export function stopSmsOtpListener() {
  if (otpAbortController) {
    otpAbortController.abort();
    otpAbortController = null;
  }
}

export async function startSmsOtpListener(formEl, inputEl) {
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
