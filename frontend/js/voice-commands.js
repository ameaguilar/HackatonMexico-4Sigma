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
export function processVoiceCommand(raw, items = []) {
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
