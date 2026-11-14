/* CobraVoz — chatbot local de FAQs, sin llamadas a proveedores ni datos sensibles. */
const faq = [['¿Qué es CobraVoz?','CobraVoz permite preparar cobros en pesos mexicanos con la voz o una calculadora. La demo no procesa pagos bancarios.','cobravoz que es aplicación'],
 ['¿Cómo hago un cobro con voz?','En la pantalla principal selecciona Cobrar con voz, dicta una frase corta, revisa el total y confirma antes de generar el QR.','voz hablar micrófono dictar escuchar'],
 ['¿Cómo funciona la calculadora?','Selecciona Calcular y cobrar, suma tus productos y pulsa el botón de total para preparar el cobro.','calculadora sumar total'],
 ['¿Cómo paga el cliente con CoDi?','El comercio muestra un QR CoDi auténtico y el cliente lo escanea o acepta desde una app bancaria compatible. La app debe esperar la confirmación verificada.','codi qr banco pagar cliente'],
 ['¿Cuándo sé que ya recibí el dinero?','Solo cuando el estado de la operación aparezca como Confirmado tras la verificación del servidor. No bastan capturas de pantalla ni un QR generado.','confirmado recibido confirmacion pago pendiente'],
 ['¿Qué significa pendiente?','La solicitud se creó, pero no hay confirmación bancaria. No entregues un comprobante de pago confirmado basándote solo en ese estado.','pendiente espera no pagado'],
 ['¿Puedo cobrar en dólares?','No. CobraVoz está diseñado para cobrar únicamente en pesos mexicanos (MXN).','dolares usd euros moneda pesos extranjeros'],
 ['¿Qué necesito para registrarme?','En el diseño actual se solicita ser mayor de 18 años, un celular mexicano +52 y después datos de contacto y cuenta bancaria. El proceso productivo requerirá validaciones reales.','registrarme registro edad telefono +52 sms'],
 ['¿Por qué me piden CLABE?','Para preparar el registro de la cuenta bancaria mexicana que recibirá directamente los pagos. No compartas tu CLABE con el chatbot.','clabe cuenta bancaria titular'],
 ['¿Qué pasa si el QR vence o no funciona?','Genera una nueva solicitud desde el cobro si el sistema indica que venció. Confirma primero que la anterior no fue pagada para evitar duplicados.','qr vencio caduca error falla'],
 ['¿Puedo usar CobraVoz si tengo baja visión?','La interfaz ofrece texto ampliado, alto contraste y lectura audible. También debe funcionar con los lectores de pantalla del teléfono.','discapacidad baja vision ciego accesible contraste'],
 ['¿Puedo utilizarla si no funciona el micrófono?','Sí. Usa Calcular y cobrar o introduce el monto por texto. El reconocimiento de voz depende de navegador, permisos y conectividad.','microfono no funciona sin voz internet'],
 ['¿Puedo devolver un pago?','Las devoluciones no se realizan desde este chatbot. El comercio deberá atenderlas por sus canales autorizados y su banco según corresponda.','devolucion reembolso regresar dinero'],
 ['¿Qué hago si me equivoco de importe?','Antes de generar el QR, usa Corregir importe. Si ya existe una solicitud, revisa su estado antes de preparar otra.','equivoco monto error corregir'],
 ['¿Hay costos por usar CobraVoz?','Las tarifas comerciales de CobraVoz aún no están definidas en esta demo. No confundas las condiciones de la API de Pey con una promesa de gratuidad del software.','precio costo comision gratis tarifa'],
 ['¿Cómo protegen mis datos?','Consulta el aviso de privacidad de CobraVoz. El documento de esta demo es un borrador y debe completarse antes del lanzamiento. Nunca compartas códigos SMS ni información bancaria en este chat.','datos privacidad seguridad personales'],
 ['¿Cómo solicito soporte?','Por ahora el centro de ayuda contiene respuestas generales. El canal de soporte humano se anunciará antes del lanzamiento; la demo no puede abrir tickets reales.','soporte humano ayuda contacto agente'],
 ['¿Dónde veo mis movimientos?','En Inicio selecciona Mis movimientos. Podrás identificar importes y estados; en esta demostración todos los movimientos son ficticios.','movimientos historial recibos ventas']];
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const phone=document.getElementById('phone');
const dock=document.createElement('div');
dock.className='cv-help-dock';
dock.innerHTML='<button id="cvHelpFab" class="cv-help-fab" type="button" aria-haspopup="dialog" aria-controls="cvHelpPanel" aria-expanded="false">✳ ¿Te ayudo?</button>'+
'<section id="cvHelpPanel" class="cv-help-panel" role="dialog" aria-modal="true" aria-label="Asistente de ayuda" hidden>'+
'<div class="cv-help-head"><div><strong>Ayuda CobraVoz</strong><small>Respuestas frecuentes · No accede a cuentas</small></div><button class="cv-help-close" id="cvHelpClose" type="button" aria-label="Cerrar chat">×</button></div>'+
'<div class="cv-help-log" id="cvHelpLog" role="log" aria-live="polite"></div><div id="cvHelpQuick" class="cv-help-quick"></div>'+
'<form class="cv-help-form" id="cvHelpForm"><label class="sr-only" for="cvHelpQuestion">Escribe tu duda</label><input id="cvHelpQuestion" type="text" maxlength="180" autocomplete="off" placeholder="Escribe tu duda…" required><button type="submit">Enviar</button></form>'+
'<div class="cv-help-foot"><span>No compartas CLABE, SMS ni contraseñas.</span><a href="./ayuda.html#faq">Ver FAQs</a></div></section>';
document.body.appendChild(dock);
const fab=dock.querySelector('#cvHelpFab'),panel=dock.querySelector('#cvHelpPanel'),close=dock.querySelector('#cvHelpClose');
const log=dock.querySelector('#cvHelpLog'),quick=dock.querySelector('#cvHelpQuick'),form=dock.querySelector('#cvHelpForm'),question=dock.querySelector('#cvHelpQuestion');
let returnFocus=null;
const syncTheme=()=>{dock.classList.toggle('cv-help-contrast',phone.classList.contains('contrast'));dock.classList.toggle('cv-help-large',phone.classList.contains('large'));};
function positionDock(){const rect=phone.getBoundingClientRect();const gap=12;const right=Math.max(gap,innerWidth-rect.right+gap);dock.style.setProperty('--cv-help-right',right+'px');}
syncTheme();positionDock();
if('MutationObserver' in window)new MutationObserver(syncTheme).observe(phone,{attributes:true,attributeFilter:['class']});
window.addEventListener('resize',positionDock,{passive:true});
window.addEventListener('orientationchange',positionDock);
function addMessage(txt,role){const div=document.createElement('div');div.className='cv-help-message '+role;div.textContent=txt;log.appendChild(div);log.scrollTop=log.scrollHeight;}
function suggestions(){quick.replaceChildren();for(const i of [1,4,8,10]){const b=document.createElement('button');b.type='button';b.textContent=faq[i][0];b.addEventListener('click',()=>answer(faq[i][0]));quick.appendChild(b)}}
function openChat(){returnFocus=document.activeElement;fab.hidden=true;panel.hidden=false;fab.setAttribute('aria-expanded','true');if(!log.childNodes.length)addMessage('¡Hola! Puedo ayudarte con cobros, QR, CLABE y accesibilidad. No solicito datos bancarios.','bot');suggestions();close.focus();}
function closeChat(){panel.hidden=true;fab.hidden=false;fab.setAttribute('aria-expanded','false');(returnFocus&&returnFocus.isConnected?returnFocus:fab).focus();}
function matchFAQ(query){const q=norm(query),words=q.split(' ').filter(w=>w.length>2);let best=null,score=0;for(const entry of faq){const title=norm(entry[0]),all=norm(entry[0]+' '+entry[2]);let rank=title===q?25:0;if(q.length>4&&title.includes(q))rank+=11;for(const token of words){if(title.includes(token))rank+=4;else if(all.includes(token))rank+=2;}if(rank>score){score=rank;best=entry;}}return score>=4?best:null;}
function answer(value){const q=String(value||'').trim().slice(0,180);if(!q)return;
if(/(?:\d[\s-]?){16,18}/.test(q)||/\b\d{6}\b/.test(q)){addMessage('Por seguridad, no escribas claves, códigos SMS ni números de cuenta. Consulta una pregunta general, sin datos personales.','bot');return;}
addMessage(q,'user');const found=matchFAQ(q);addMessage(found?found[1]:'No tengo una respuesta confiable sobre eso. Revisa el Manual y las Preguntas frecuentes. Si es una transferencia real, consulta directamente con tu banco.','bot');}
fab.addEventListener('click',openChat);close.addEventListener('click',closeChat);
form.addEventListener('submit',event=>{event.preventDefault();const value=question.value.trim();if(!value)return;answer(value);question.value='';question.focus();});
document.addEventListener('keydown',event=>{if(panel.hidden)return;if(event.key==='Escape'){event.preventDefault();closeChat();return;}if(event.key!=='Tab')return;const focusables=[...panel.querySelectorAll('button,input,a')].filter(el=>!el.disabled&&el.offsetParent!==null);if(!focusables.length)return;const first=focusables[0],last=focusables[focusables.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!dock.contains(event.target))closeChat();});
