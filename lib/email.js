const nodemailer = require('nodemailer');

function crearTransportador() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error('Faltan las variables de entorno EMAIL_USER y/o EMAIL_PASS');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

async function enviarNotificacionUrgente(ticket, clasificacion) {
  const destinatario = process.env.NOTIFY_EMAIL || process.env.EMAIL_USER;
  const transportador = crearTransportador();

  const prioridad = (clasificacion?.prioridad || ticket.prioridad || 'urgente').toUpperCase();
  const categoria = clasificacion?.categoria || 'sin clasificar';

  const asunto = `🚨 Ticket ${prioridad}: ${ticket.titulo}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px;">
      <h2 style="color:#e35d5d;">🚨 Ticket urgente recibido</h2>
      <p><b>Título:</b> ${ticket.titulo}</p>
      <p><b>Descripción:</b> ${ticket.descripcion}</p>
      <p><b>Prioridad:</b> ${prioridad}</p>
      <p><b>Categoría:</b> ${categoria}</p>
      <p><b>Reportado por:</b> ${ticket.creadoPorNombre || ticket.email}</p>
      ${ticket.trelloUrl ? `<p><b>Tarjeta en Trello:</b> <a href="${ticket.trelloUrl}">${ticket.trelloUrl}</a></p>` : ''}
      <p style="color:#888; font-size:12px;">Notificación automática del Help Desk Inteligente.</p>
    </div>
  `;

  await transportador.sendMail({
    from: `"Help Desk Inteligente" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: asunto,
    html
  });
}

module.exports = { enviarNotificacionUrgente };
