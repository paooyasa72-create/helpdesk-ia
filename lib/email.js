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

async function enviarRespuestaFAQ(ticket, textoRespuesta) {
  if (!ticket.email) return; // sin correo del usuario no hay a quién responder

  const transportador = crearTransportador();

  const asunto = `Re: ${ticket.titulo} — Respuesta automática`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px;">
      <h2 style="color:#3fb27f;">✅ Tu ticket ya tiene respuesta</h2>
      <p>Hola, tu consulta fue identificada como una pregunta frecuente y el asistente de IA ya te dejó la respuesta:</p>
      <p><b>Tu pregunta:</b> ${ticket.titulo}</p>
      <div style="background:#f4f4f4; padding:14px; border-radius:8px; margin:14px 0; white-space:pre-line;">
        ${textoRespuesta}
      </div>
      <p>Este ticket se cerró automáticamente. Si tu problema no se resolvió, puedes crear un nuevo ticket.</p>
      <p style="color:#888; font-size:12px;">Notificación automática del Help Desk Inteligente.</p>
    </div>
  `;

  await transportador.sendMail({
    from: `"Help Desk Inteligente" <${process.env.EMAIL_USER}>`,
    to: ticket.email,
    subject: asunto,
    html
  });
}

module.exports = { enviarNotificacionUrgente, enviarRespuestaFAQ };
