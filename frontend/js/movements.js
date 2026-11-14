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

export function movementStatus(status) {
  return statuses[status] || statuses.failed;
}

// Filtra sin modificar la colección original y presenta primero lo más reciente.
export function filterMovements(records, { status = 'all', query = '' } = {}) {
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
export function movementTotals(records) {
  let confirmed = 0, pending = 0;
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.status === 'confirmed') confirmed += amountCents(record.amount);
    if (record?.status === 'pending') pending += amountCents(record.amount);
  }
  return { confirmed: confirmed / 100, pending: pending / 100 };
}

// Cada llamada genera ejemplos nuevos, claramente separados del historial real.
export function exampleMovements() {
  const now = Date.now();
  const time = milliseconds => new Date(now - milliseconds).toISOString();
  return [
    { reference: 'CV-EJ-1048', businessName: 'Tacos Juanita', amount: 180, status: 'confirmed', method: 'calculator', createdAt: time(42 * 60000), confirmedAt: time(41 * 60000), description: 'Venta de demostración', example: true },
    { reference: 'CV-EJ-1047', businessName: 'Tacos Juanita', amount: 85, status: 'pending', method: 'voice', createdAt: time(95 * 60000), description: 'Cobro por voz de demostración', example: true },
    { reference: 'CV-EJ-1046', businessName: 'Tacos Juanita', amount: 125, status: 'confirmed', method: 'voice', createdAt: time(25 * 3600000), confirmedAt: time(25 * 3600000 - 60000), description: 'Venta anterior de demostración', example: true },
    { reference: 'CV-EJ-1045', businessName: 'Tacos Juanita', amount: 60, status: 'expired', method: 'calculator', createdAt: time(27 * 3600000), description: 'Solicitud vencida de demostración', example: true }
  ];
}
