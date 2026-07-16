require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../lib/db');
const { classifyTicket } = require('../lib/gemini');
const { createTrelloCard } = require('../lib/trello');
const { enviarNotificacionUrgente, enviarRespuestaFAQ } = require('../lib/email');
const { hashPassword, comparePassword, signToken, requireAuth } = require('../lib/auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const ROLES = ['empleado', 'tecnico', 'gerente'];

// ---------- HEALTH CHECK ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'helpdesk-ia', timestamp: new Date().toISOString() });
});

// =====================================================
// AUTENTICACIÓN
// =====================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ error: 'Faltan campos: nombre, email, password, rol' });
    }
    if (!ROLES.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${ROLES.join(', ')}` });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const db = await connectDB();
    const existente = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existente) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    }

    const passwordHash = await hashPassword(password);
    const nuevoUsuario = {
      nombre,
      email: email.toLowerCase(),
      passwordHash,
      rol,
      creado: new Date()
    };

    const result = await db.collection('users').insertOne(nuevoUsuario);
    nuevoUsuario._id = result.insertedId;

    const token = signToken(nuevoUsuario);
    res.status(201).json({
      mensaje: 'Cuenta creada exitosamente',
      token,
      usuario: { nombre: nuevoUsuario.nombre, email: nuevoUsuario.email, rol: nuevoUsuario.rol }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan email o password' });
    }

    const db = await connectDB();
    const usuario = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!usuario) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    const passwordOk = await comparePassword(password, usuario.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    const token = signToken(usuario);
    res.json({
      mensaje: 'Sesión iniciada',
      token,
      usuario: { nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth(), (req, res) => {
  res.json({ usuario: req.user });
});

// =====================================================
// TICKETS
// =====================================================

// Empleado: ver solo sus propios tickets
app.get('/api/tickets/mine', requireAuth(), async (req, res) => {
  try {
    const db = await connectDB();
    const tickets = await db.collection('tickets')
      .find({ creadoPor: req.user.email })
      .sort({ creado: -1 })
      .toArray();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Técnico: bandeja de tickets abiertos/en proceso (para tomar o atender)
app.get('/api/tickets/cola', requireAuth(['tecnico', 'gerente']), async (req, res) => {
  try {
    const db = await connectDB();
    const tickets = await db.collection('tickets')
      .find({ estado: { $in: ['abierto', 'en_proceso'] } })
      .sort({ creado: -1 })
      .toArray();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gerente (y técnico para referencia): listar todos los tickets
app.get('/api/tickets', requireAuth(['gerente', 'tecnico']), async (req, res) => {
  try {
    const db = await connectDB();
    const tickets = await db.collection('tickets').find({}).sort({ creado: -1 }).toArray();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ver un ticket puntual (el empleado solo puede ver el suyo)
app.get('/api/tickets/:id', requireAuth(), async (req, res) => {
  try {
    const db = await connectDB();
    const ticket = await db.collection('tickets').findOne({ _id: new ObjectId(req.params.id) });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    if (req.user.rol === 'empleado' && ticket.creadoPor !== req.user.email) {
      return res.status(403).json({ error: 'No puedes ver este ticket' });
    }

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear ticket (cualquier usuario autenticado, normalmente el empleado)
app.post('/api/tickets', requireAuth(), async (req, res) => {
  try {
    const { titulo, descripcion, prioridad, email } = req.body;

    if (!titulo || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: titulo, descripcion' });
    }

    const db = await connectDB();

    const nuevoTicket = {
      titulo,
      descripcion,
      prioridad: prioridad || 'normal',
      email: email || req.user.email,
      creadoPor: req.user.email,
      creadoPorNombre: req.user.nombre,
      tecnicoAsignado: null,
      estado: 'abierto',
      creado: new Date(),
      clasificacion: null,
      trelloUrl: null,
      mensajes: []
    };

    const result = await db.collection('tickets').insertOne(nuevoTicket);
    nuevoTicket._id = result.insertedId;

    let respuesta = { mensaje: 'Ticket creado exitosamente', ticket: nuevoTicket };

    // El agente de IA (Gemini) actúa como un "recepcionista": lee TODOS los
    // tickets que llegan, no solo los urgentes, y decide qué hacer con cada uno.
    if (process.env.GEMINI_API_KEY) {
      try {
        const clasificacion = await classifyTicket(titulo, descripcion);
        const update = { clasificacion };

        // Caso: es una pregunta frecuente -> Gemini ya trae la respuesta,
        // se la mandamos por correo al usuario y cerramos el ticket solo.
        if (clasificacion.es_pregunta_frecuente && clasificacion.respuesta_sugerida) {
          update.estado = 'cerrado';
          respuesta.mensaje = 'Es una pregunta frecuente: el agente de IA respondió automáticamente y cerró el ticket';
          respuesta.respuestaSugerida = clasificacion.respuesta_sugerida;

          if (process.env.EMAIL_USER) {
            try {
              await enviarRespuestaFAQ(nuevoTicket, clasificacion.respuesta_sugerida);
              respuesta.respuestaAutomaticaEnviada = true;
            } catch (emailErr) {
              respuesta.avisoEmail = `No se pudo enviar la respuesta automática por correo: ${emailErr.message}`;
            }
          }
        } else {
          // Caso: no es pregunta frecuente. Si Gemini decide escalar (prioridad
          // alta/crítica), se crea la tarjeta en Trello y se notifica por correo.
          if (clasificacion.escalar && process.env.TRELLO_API_KEY) {
            const trelloUrl = await createTrelloCard(nuevoTicket, clasificacion);
            update.trelloUrl = trelloUrl;
            respuesta.trello = trelloUrl;
            nuevoTicket.trelloUrl = trelloUrl;
          }

          if (clasificacion.escalar && process.env.EMAIL_USER) {
            try {
              await enviarNotificacionUrgente(nuevoTicket, clasificacion);
              respuesta.notificacionEnviada = true;
            } catch (emailErr) {
              respuesta.avisoEmail = `No se pudo enviar la notificación por correo: ${emailErr.message}`;
            }
          }

          respuesta.mensaje = 'Ticket creado y clasificado automáticamente por el agente de IA';
        }

        await db.collection('tickets').updateOne({ _id: nuevoTicket._id }, { $set: update });
        respuesta.clasificacion = clasificacion;
      } catch (aiErr) {
        respuesta.avisoIA = `El ticket se guardó pero el agente de IA falló: ${aiErr.message}`;

        // Aunque falle la IA, si el usuario ya marcó el ticket como urgente, igual notificamos.
        const esUrgente = ['urgente', 'alta', 'critica'].includes((prioridad || '').toLowerCase());
        if (esUrgente && process.env.EMAIL_USER) {
          try {
            await enviarNotificacionUrgente(nuevoTicket, null);
            respuesta.notificacionEnviada = true;
          } catch (emailErr) {
            respuesta.avisoEmail = `No se pudo enviar la notificación por correo: ${emailErr.message}`;
          }
        }
      }
    }

    res.status(201).json(respuesta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar estado/prioridad (técnico y gerente)
app.put('/api/tickets/:id', requireAuth(['tecnico', 'gerente']), async (req, res) => {
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

// El técnico toma un ticket para sí mismo
app.put('/api/tickets/:id/asignar', requireAuth(['tecnico']), async (req, res) => {
  try {
    const db = await connectDB();
    await db.collection('tickets').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { tecnicoAsignado: req.user.email, tecnicoNombre: req.user.nombre, estado: 'en_proceso' } }
    );
    res.json({ mensaje: 'Ticket asignado a ti' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agregar un mensaje al hilo del ticket (empleado en el suyo, técnico/gerente en cualquiera)
app.post('/api/tickets/:id/mensajes', requireAuth(), async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: 'Falta el texto del mensaje' });

    const db = await connectDB();
    const ticket = await db.collection('tickets').findOne({ _id: new ObjectId(req.params.id) });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    if (req.user.rol === 'empleado' && ticket.creadoPor !== req.user.email) {
      return res.status(403).json({ error: 'No puedes escribir en este ticket' });
    }

    const mensaje = {
      autor: req.user.nombre,
      rol: req.user.rol,
      texto,
      fecha: new Date()
    };

    await db.collection('tickets').updateOne(
      { _id: ticket._id },
      { $push: { mensajes: mensaje } }
    );

    res.status(201).json({ mensaje: 'Mensaje agregado', nuevoMensaje: mensaje });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar ticket (solo gerente)
app.delete('/api/tickets/:id', requireAuth(['gerente']), async (req, res) => {
  try {
    const db = await connectDB();
    await db.collection('tickets').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ mensaje: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clasificación manual con el agente de IA (técnico y gerente)
app.post('/api/agent/triage', requireAuth(['tecnico', 'gerente']), async (req, res) => {
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

// Métricas (solo gerente)
app.get('/api/metrics', requireAuth(['gerente']), async (req, res) => {
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

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Help Desk IA corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
