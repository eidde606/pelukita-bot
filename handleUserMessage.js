// utils/handleUserMessage.js
const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleUserMessage(senderId, userMessage) {
  let session = await Session.findOne({ senderId });

  // Create new session if none exists
  if (!session) {
    session = await Session.create({ senderId });
  }

  // Booking flow logic
  const { stage, data } = session;

  const nextStage = {
    name: "date",
    date: "time",
    time: "service",
    service: "price",
    price: "phone",
    phone: "address",
    address: "notes",
    notes: "confirm",
  };

  if (stage !== "name" && stage !== "confirm") {
    session.data[stage] = userMessage;
    session.stage = nextStage[stage];
    await session.save();
  }

  // Respond based on stage
  switch (session.stage) {
    case "name":
      session.stage = "date";
      await session.save();
      return "¿Cuál es tu nombre, por favor?";
    case "date":
      return "📅 ¿Qué fecha es la fiesta?";
    case "time":
      return "⏰ ¿A qué hora comenzará?";
    case "service":
      return "🎁 ¿Qué paquete deseas? Pelukines o Pelukones?";
    case "price":
      return "💰 ¿Cuál es el precio que se acordó?";
    case "phone":
      return "📱 ¿Cuál es tu número de teléfono?";
    case "address":
      return "📍 ¿Dónde será la fiesta?";
    case "notes":
      return "📝 ¿Algo más que Pelukita deba saber?";
    case "confirm":
      // Finalize booking
      await Booking.create({ ...session.data });
      await Session.deleteOne({ senderId });

      return `🎉 ¡Gracias por reservar con Pelukita! Aquí están los detalles:\n\n${formatSummary(
        session.data
      )}\n\n📞 Te contactaremos pronto. ¡Va a ser una fiesta brutal! 🎈🥳`;
    default:
      // Not in booking flow, use AI
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `
You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party packages for children and families. Speak in Spanglish, English, or Spanish depending on how the customer writes.

Only bring up party packages if the user shows interest.

Here are your services:

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
- Todo lo incluido en Pelukines, MÁS:
  🧸 Muñeco gigante incluido
  🍭 Popcorn y algodón incluidos (50 unidades)
  🎧 DJ profesional (4 horas)

Always be joyful, excited, and friendly. Only offer package info when the user asks or shows interest. Respond naturally to their intent, answer questions, and guide them clearly. Never assume—they go first. 🎈🎊🎉
            `.trim(),
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      return response.choices[0].message.content;
  }
}

function formatSummary(data) {
  return `
👤 Nombre: ${data.name}
📅 Fecha: ${data.date}
⏰ Hora: ${data.time}
🎁 Paquete: ${data.service}
💰 Precio: ${data.price}
📱 Teléfono: ${data.phone}
📍 Dirección: ${data.address}
📝 Notas: ${data.notes || "Ninguna"}
  `.trim();
}

module.exports = handleUserMessage;
