const fetch = require('node-fetch');

const SYSTEM_PROMPT = `Eres un asistente de Help Desk. Tu trabajo es clasificar tickets de soporte técnico.

Reglas:
- Si el texto menciona "servidor caído", "no responde el sistema" o algo similar -> prioridad "critica", categoria "infraestructura"
- Si menciona palabras como "urgente", "urgen" -> prioridad "alta"
- Si es una pregunta de tipo "¿cómo...?" sobre un proceso conocido (ej. reiniciar VPN, cambiar contraseña) -> es PREGUNTA FRECUENTE, prioridad "baja"
- Si es un problema de hardware (impresora, mouse, teclado, monitor) -> categoria "hardware"
- Si es un problema de acceso (login, contraseña, permisos) -> categoria "acceso"
- Si es un problema de red (wifi, VPN, internet) -> categoria "red"
- Si es un problema de software (aplicación, error, instalación) -> categoria "software"

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:
{
  "prioridad": "critica|alta|media|baja",
  "categoria": "hardware|software|red|acceso|infraestructura",
  "escalar": true|false,
  "equipo": "level1|level2|devops|infraestructura",
  "es_pregunta_frecuente": true|false,
  "respuesta_sugerida": "Si es_pregunta_frecuente es true, escribe aquí una respuesta breve paso a paso. Si no, deja este campo vacío."
}

Ejemplos:
Ticket: "El servidor no responde" -> {"prioridad":"critica","categoria":"infraestructura","escalar":true,"equipo":"infraestructura","es_pregunta_frecuente":false,"respuesta_sugerida":""}
Ticket: "¿Cómo reinicio mi contraseña?" -> {"prioridad":"baja","categoria":"acceso","escalar":false,"equipo":"level1","es_pregunta_frecuente":true,"respuesta_sugerida":"1. Ve a la página de login. 2. Haz clic en 'Olvidé mi contraseña'. 3. Sigue las instrucciones del correo."}
Ticket: "La impresora no imprime" -> {"prioridad":"media","categoria":"hardware","escalar":false,"equipo":"level1","es_pregunta_frecuente":false,"respuesta_sugerida":""}`;

async function classifyTicket(titulo, descripcion) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta la variable de entorno GEMINI_API_KEY');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nClasifica este ticket:\nTítulo: "${titulo}"\nDescripción: "${descripcion}"`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error de Gemini API: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  let clean = rawText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
  return JSON.parse(clean);
}

module.exports = { classifyTicket };
