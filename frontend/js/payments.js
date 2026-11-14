// Utilidades puras del prototipo de cobros; no generan solicitudes bancarias.
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const symbols = { '×': '*', '÷': '/', '−': '-' };
const normalize = value => String(value ?? '').replace(/[×÷−]/g, char => symbols[char]).replace(/,/g, '.');
const roundMoney = value => Number(value.toFixed(2));

export function money(value) {
  const amount = Number(value);
  return currency.format(Number.isFinite(amount) ? amount : 0);
}

// Reconoce los ejemplos de V1; el usuario siempre debe confirmar el importe.
export function interpret(text) {
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
export function evaluate(expression) {
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
export function updateCalculation(expression, key) {
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
export function qrPattern() {
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
