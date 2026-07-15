const fetch = require('node-fetch');

async function createTrelloCard(ticket, clasificacion) {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const listId = process.env.TRELLO_LIST_ID;

  if (!key || !token || !listId) {
    throw new Error('Faltan variables de entorno de Trello (TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_LIST_ID)');
  }

  const name = `[${clasificacion.prioridad.toUpperCase()}] ${ticket.titulo}`;
  const desc = `**Descripción:** ${ticket.descripcion}\n**Categoría:** ${clasificacion.categoria}\n**Equipo asignado:** ${clasificacion.equipo}\n**Email del usuario:** ${ticket.email}\n**Ticket ID:** ${ticket._id}`;

  const url = `https://api.trello.com/1/cards?key=${key}&token=${token}&idList=${listId}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(desc)}`;

  const response = await fetch(url, { method: 'POST' });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error de Trello API: ${response.status} ${errText}`);
  }

  const card = await response.json();
  return card.shortUrl || card.url;
}

module.exports = { createTrelloCard };
