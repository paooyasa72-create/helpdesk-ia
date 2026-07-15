require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../lib/db');
const { classifyTicket } = require('../lib/gemini');
const { createTrelloCard } = require('../lib/trello');

const app = express();
app.use(cors());
app.use(express.json());

// Sirve el frontend cuando se corre localmente (en Vercel lo maneja vercel.json)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- HEALTH CHECK ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'helpdesk-ia', timestamp: new Date().toISOString() });
});

// ---------- LISTAR TODOS LOS TICKETS ----------
app.get('/api/tickets', async (req, res) => {
  try {
    const db = await connectDB();
    const tickets = await db.collection('tickets').find({}).sort({ creado: -1 }).toArray();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- VER UN TICKET ----------
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const db = await connectDB();
    const ticket = await db.collection('tickets').findOne({ _id: new ObjectId(req.params.id) });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- CREAR TICKET (+ dispara el agente de IA) ----------
app.post('/api/tickets', async (req, res) => {
  try {
    const { titulo, descripcion, prioridad, email } = req.body;

    if (!titulo || !descripcion || !email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: titulo, descripcion, email' });
    }

    const db = await connectDB();

    const nuevoTicket = {
      titulo,
      descripcion,
      prioridad: prioridad || 'normal',
      email,
      estado: 'abierto',
      creado: new Date(),
      clasificacion: null,
      trelloUrl: null
    };

    const result = await db.collection('tickets').insertOne(nuevoTicket);
    nuevoTicket._id = result.insertedId;

    let respuesta = {
      mensaje: 'Ticket creado exitosamente',
      ticket: nuevoTicket
    };

    // Si el ticket es urgente/alta, se llama automáticamente al agente de IA
    const esUrgente = ['urgente', 'alta', 'critica'].includes((prioridad || '').toLowerCase());

    if (esUrgente && process.env.GEMINI_API_KEY) {
      try {
        const clasificacion = await classifyTicket(titulo, descripcion);

        const update = { clasificacion };

        if (clasificacion.escalar && process.env.TRELLO_API_KEY) {
          const trelloUrl = await createTrelloCard(nuevoTicket, clasificacion);
          update.trelloUrl = trelloUrl;
          respuesta.trello = trelloUrl;
        }

        await db.collection('tickets').updateOne(
          { _id: nuevoTicket._id },
          { $set: update }
        );

        respuesta.clasificacion = clasificacion;
        respuesta.mensaje = 'Ticket creado y clasificado automáticamente por el agente de IA';
      } catch (aiErr) {
        respuesta.avisoIA = `El ticket se guardó pero el agente de IA falló: ${aiErr.message}`;
      }
    }

    res.status(201).json(respuesta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ACTUALIZAR TICKET ----------
app.put('/api/tickets/:id', async (req, res) => {
  try {
    const db = await connectDB();
    const { estado, prioridad } = req.body;
    const update = {};
    if (estado) update.estado = estado;
    if (prioridad) update.prioridad = prioridad;

    await db.collection('tickets').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );

    res.json({ mensaje: 'Ticket actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ELIMINAR TICKET ----------
app.delete('/api/tickets/:id', async (req, res) => {
  try {
    const db = await connectDB();
    await db.collection('tickets').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ mensaje: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ENDPOINT DEL AGENTE DE IA (clasificación manual / on-demand) ----------
app.post('/api/agent/triage', async (req, res) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId) return res.status(400).json({ error: 'Falta ticketId' });

    const db = await connectDB();
    const ticket = await db.collection('tickets').findOne({ _id: new ObjectId(ticketId) });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    const clasificacion = await classifyTicket(ticket.titulo, ticket.descripcion);

    const update = { clasificacion };

    if (clasificacion.escalar) {
      const trelloUrl = await createTrelloCard(ticket, clasificacion);
      update.trelloUrl = trelloUrl;
    }

    await db.collection('tickets').updateOne({ _id: ticket._id }, { $set: update });

    res.json({ mensaje: 'Ticket clasificado', clasificacion, trelloUrl: update.trelloUrl || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- MÉTRICAS PARA EL DASHBOARD ----------
app.get('/api/metrics', async (req, res) => {
  try {
    const db = await connectDB();
    const tickets = await db.collection('tickets').find({}).toArray();

    const total = tickets.length;
    const porPrioridad = {};
    const porCategoria = {};
    const porEstado = {};

    tickets.forEach(t => {
      const prio = t.clasificacion?.prioridad || t.prioridad || 'sin_clasificar';
      const cat = t.clasificacion?.categoria || 'sin_clasificar';
      porPrioridad[prio] = (porPrioridad[prio] || 0) + 1;
      porCategoria[cat] = (porCategoria[cat] || 0) + 1;
      porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
    });

    res.json({ total, porPrioridad, porCategoria, porEstado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Arranque local (Vercel ignora esto y usa el export de abajo)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Help Desk IA corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
