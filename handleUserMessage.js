const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleUserMessage(senderId, userMessage) {
  let session = await Session.findOne({ senderId });

  if (!session) {
    session = await Session.create({ senderId });
  }

  const { stage, data } = session;
  const lowerMessage = userMessage.trim().toLowerCase();

  const greetings = ["hola", "hello", "buenas", "hey"];
  const askingForPackages =
    lowerMessage.includes("paquete") ||
    lowerMessage.includes("pelukines") ||
    lowerMessage.includes("pelukones") ||
    lowerMessage.includes("diferencia");

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

  const followUp = {
    name: "👤 ¿Cuál es tu nombre?",
    date: "📅 ¿Qué fecha es la fiesta?",
    time: "⏰ ¿A qué hora comenzará?",
    service: "🎁 ¿Qué paquete deseas? Pelukines o Pelukones?",
    price: "💰 ¿Cuál es el precio que se acordó?",
    phone: "📱 ¿Cuál es tu número de teléfono?",
    address: "📍 ¿Dónde será la fiesta?",
    notes: "📝 ¿Algo más que Pelukita deba saber?",
  };

  // If greeting, reply nicely but don’t advance
  if (greetings.includes(lowerMessage)) {
    return stage === "name"
      ? "👋 ¡Hola! ¿Cuál es tu nombre, por favor?"
      : `👋 ¡Hola de nuevo! ${followUp[stage] || ""}`;
  }

  // If asking about packages, respond using AI and don’t save anything
  if (askingForPackages || lowerMessage.includes("?")) {
    const ai = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are Pelukita, a joyful and charismatic female clown who offers fun birthday experiences. Only explain services if the user asks about them, and never break the booking flow unless it's a request for info.

🎉 *Paquete Pelukines* – $650
- 1 hora de pinta caritas
- 2 horas de show con juegos y piñata
- Parlante incluido
- Add-ons: Muñeco gigante $60, Popcorn $200, DJ $1000

🎊 *Paquete Pelukones* – $1500
- Todo lo del Pelukines +
- Muñeco + popcorn + DJ profesional (4 hrs)
        `.trim(),
        },
        { role: "user", content: userMessage },
      ],
    });

    return ai.choices[0].message.content;
  }

  // ✅ Only save input if it’s NOT a greeting, question, or empty
  const shouldSave =
    !greetings.includes(lowerMessage) &&
    !lowerMessage.includes("?") &&
    lowerMessage.length >= 2;

  if (shouldSave && stage !== "confirm" && nextStage[stage]) {
    session.data[stage] = userMessage;
    session.stage = nextStage[stage];
    await session.save();
  }

  // Respond with the next question based on current stage
  switch (session.stage) {
    case "name":
      session.stage = "date";
      await session.save();
      return followUp.name;
    case "date":
    case "time":
    case "service":
    case "price":
    case "phone":
    case "address":
    case "notes":
      return followUp[session.stage];
    case "confirm":
      await Booking.create({ ...session.data });
      await Session.deleteOne({ senderId });

      return `🎉 ¡Gracias por reservar con Pelukita! Aquí están los detalles:\n\n${formatSummary(
        session.data
      )}\n\n📞 Te contactaremos pronto. ¡Va a ser una fiesta brutal! 🎈🥳`;
    default:
      return "¿Puedes repetir eso, por favor?";
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
