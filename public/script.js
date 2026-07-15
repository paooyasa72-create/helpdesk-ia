// Todas las llamadas usan rutas relativas (/api/...) para que funcionen igual
// en local (http://localhost:3000) y en producción (Vercel).
// Usan authFetch (definido en auth.js) para incluir el token de sesión.

async function crearTicket(payload) {
  return authFetch('/api/tickets', { method: 'POST', body: JSON.stringify(payload) });
}

async function listarTickets() {
  return authFetch('/api/tickets');
}

async function actualizarTicket(id, payload) {
  return authFetch(`/api/tickets/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

async function eliminarTicket(id) {
  return authFetch(`/api/tickets/${id}`, { method: 'DELETE' });
}

async function clasificarConIA(ticketId) {
  return authFetch('/api/agent/triage', { method: 'POST', body: JSON.stringify({ ticketId }) });
}

async function obtenerMetricas() {
  return authFetch('/api/metrics');
}

function formatoFecha(fechaStr) {
  const f = new Date(fechaStr);
  return f.toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
}
