// Todas las llamadas usan rutas relativas (/api/...) para que funcionen igual
// en local (http://localhost:3000) y en producción (Vercel).

async function crearTicket(payload) {
  const res = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al crear el ticket');
  return data;
}

async function listarTickets() {
  const res = await fetch('/api/tickets');
  if (!res.ok) throw new Error('Error al listar tickets');
  return res.json();
}

async function actualizarTicket(id, payload) {
  const res = await fetch(`/api/tickets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Error al actualizar el ticket');
  return res.json();
}

async function eliminarTicket(id) {
  const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Error al eliminar el ticket');
  return res.json();
}

async function clasificarConIA(ticketId) {
  const res = await fetch('/api/agent/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al clasificar con IA');
  return data;
}

async function obtenerMetricas() {
  const res = await fetch('/api/metrics');
  if (!res.ok) throw new Error('Error al obtener métricas');
  return res.json();
}

function formatoFecha(fechaStr) {
  const f = new Date(fechaStr);
  return f.toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
}
