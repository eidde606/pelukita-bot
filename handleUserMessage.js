const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");
const sendEmail = require("./sendEmail");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleUserMessage(senderId, userMessage) {
  let session = await Session.findOne({ senderId });

  if (!session) {
    session = await Session.create({
      senderId,
      stage: "start",
      completed: false,
      data: {},
    });
  }

  const messages = session.messages || [];
  messages.push({ role: "user", content: userMessage });

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `
Eres Pelukita, una payasita alegre, carismática y profesional que ofrece experiencias divertidas para cumpleaños. Hablas en Spanglish, español o inglés, según cómo te escriba el cliente.
Tu contacto oficial es:
Telefono: 804-735-8835

Solo explicas los servicios si el cliente pregunta por ellos. Nunca interrumpas el flujo de la conversación si el cliente está haciendo una reservación, a menos que te pidan información.

🎉 *Paquete Pelukines* – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas para todos los niños.
- 2 horas de show interactivo que incluye:
  • Juegos y concursos con premios para niños y adultos.
  • Rompe la piñata y canto del Happy Birthday.
- Parlante incluido.
- Adicionales:
  🧸 Muñeco gigante: $60 (Mario, Luigi, Mickey, Minnie, Plin Plin, Zenon)
  🍿 Carrito de popcorn o algodón de azúcar (50 unidades): $200
  🎧 DJ adicional (4 horas): $1000

🎊 *Paquete Pelukones* – $1500 – Ideal para fiestas en local:
- Todo lo incluido en Pelukines MÁS:
  🧸 Muñeco gigante incluido
  🍭 Popcorn y algodón incluidos (50 unidades)
  🎧 DJ profesional (4 horas)

Recolecta el siguiente flujo de datos uno a uno:
- Nombre del adulto
- Nombre del cumpleañero
- Edad del cumpleañero
- Fecha
- Hora
- Dirección
- Número de niños
- Paquete
- Adicionales (si hay)
- Precio total
- Teléfono
- Correo electrónico

Cuando el cliente diga que todo está correcto, responde con { "action": "finalize" }. Antes de eso, guarda los campos como { "field": "nombre", "value": "Eddie" }, etc.

Nunca respondas con solo el JSON. Siempre incluye una respuesta natural para el cliente.
        `.trim(),
      },
      ...messages,
    ],
    temperature: 0.7,
  });

  const reply = response.choices[0].message.content;
  const toolCalls = extractAllJson(reply);

  // Loop through all parsed toolCalls
  for (const toolCall of toolCalls) {
    if (toolCall?.field && toolCall?.value) {
      session.data[toolCall.field] = toolCall.value;
    }

    if (toolCall?.action === "finalize") {
      const bookingData = { ...session.data, status: "Booked" };

      if (
        bookingData.name &&
        bookingData.date &&
        bookingData.time &&
        bookingData.phone &&
        bookingData.address &&
        bookingData.email
      ) {
        await Booking.create(bookingData);
        await sendEmail(bookingData.email, bookingData);
        await Session.deleteOne({ senderId });

        return "🎉 ¡Gracias por reservar con Pelukita! 🎈 Tu evento ha sido guardado con éxito y te hemos enviado un correo de confirmación. ¡Va a ser una fiesta brutal!";
      } else {
        return "⚠️ Algo salió mal. Faltan datos para guardar la reservación. ¿Puedes verificar toda la información?";
      }
    }
  }

  session.messages = messages;
  await session.save();

  const cleaned = reply
    .replace(/\{[^}]+\}/g, "")
    .replace(/^[,\s\n\r]+$/gm, "")
    .trim();
  return cleaned;
}

function extractJson(text) {
  try {
    const match = text.match(/\{[^}]+\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

module.exports = handleUserMessage;
