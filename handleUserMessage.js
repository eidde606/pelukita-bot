const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleUserMessage(senderId, userMessage) {
  let session = await Session.findOne({ senderId });

  // Create new session if not exists
  if (!session) {
    session = await Session.create({ senderId });
  }

  const { stage, data } = session;
  const lowerMessage = userMessage.trim().toLowerCase();

  // Detect simple greeting
  const greetings = ["hola", "hello", "buenas", "hey"];
  if (greetings.includes(lowerMessage)) {
    if (stage === "name") {
      return "👋 ¡Hola! ¿Cuál es tu nombre, por favor?";
    } else {
      return "👋 ¡Hola de nuevo! Sigamos donde nos quedamos.";
    }
  }

  // Detect interest in packages
  const askingForPackages =
    lowerMessage.includes("paquete") ||
    lowerMessage.includes("pelukines") ||
    lowerMessage.includes("pelukones") ||
    lowerMessage.includes("diferencia");

  // Booking flow control
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

  // Handle booking input
  if (stage !== "confirm" && nextStage[stage]) {
    session.data[stage] = userMessage;
    session.stage = nextStage[stage];
    await session.save();
  }

  // Respond based on current stage
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
      await Booking.create({ ...session.data });
      await Session.deleteOne({ senderId });

      return `🎉 ¡Gracias por reservar con Pelukita! Aquí están los detalles:\n\n${formatSummary(
        session.data
      )}\n\n📞 Te contactaremos pronto. ¡Va a ser una fiesta brutal! 🎈🥳`;
    default:
      // AI fallback – includes paquetes info
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `
You are Pelukita, a joyful and charismatic clown who offers fun birthday experiences. If the user asks about your services, explain clearly in Spanglish or Spanish based on their style. If they’re in the middle of booking, answer kindly but don’t break the flow unless they request info.

Services:

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

Always be cheerful, respond warmly, and only give service info if asked or mentioned. Never assume they want a booking unless they say so.
            `.trim(),
          },
          { role: "user", content: userMessage },
        ],
      });

      return response.choices[0].message.content;
  }
}

function formatSummary(data) {
  return `
👤 Nombre: ${data.name || "No especificado"}
📅 Fecha: ${data.date || "No especificada"}
⏰ Hora: ${data.time || "No especificada"}
🎁 Paquete: ${data.service || "No especificado"}
💰 Precio: ${data.price || "No especificado"}
📱 Teléfono: ${data.phone || "No especificado"}
📍 Dirección: ${data.address || "No especificada"}
📝 Notas: ${data.notes || "Ninguna"}
  `.trim();
}

module.exports = handleUserMessage;
