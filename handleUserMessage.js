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
    date: "📅 ¿Qué fecha es la fiesta?",
    time: "⏰ ¿A qué hora comenzará?",
    service: "🎁 ¿Qué paquete deseas? Pelukines o Pelukones?",
    price: "💰 ¿Cuál es el precio que se acordó?",
    phone: "📱 ¿Cuál es tu número de teléfono?",
    address: "📍 ¿Dónde será la fiesta?",
    notes: "📝 ¿Algo más que Pelukita deba saber?",
  };

  // Greet without advancing
  if (greetings.includes(lowerMessage)) {
    return stage === "name"
      ? "👋 ¡Hola! ¿Cuál es tu nombre, por favor?"
      : `👋 ¡Hola de nuevo! ${followUp[stage] || ""}`.trim();
  }

  // Show paquetes info without advancing
  if (askingForPackages) {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are Pelukita, a joyful and charismatic female clown who offers fun birthday experiences. If the user asks about your services, explain clearly in Spanglish or Spanish based on their style.

🎉 *Paquete Pelukines* – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas
- 2 horas de show interactivo con juegos, piñata, canto de cumpleaños
- Parlante incluido
- Extras:
  🧸 Muñeco gigante: $60
  🍿 Popcorn o algodón (50 unidades): $200
  🎧 DJ (4 horas): $1000

🎊 *Paquete Pelukones* – $1500 – Ideal para fiestas en local:
- Todo lo del Pelukines más:
  🧸 Muñeco incluido
  🍿 Popcorn y algodón incluidos
  🎧 DJ profesional (4 horas)
`.trim(),
        },
        { role: "user", content: userMessage },
      ],
    });

    return aiResponse.choices[0].message.content;
  }

  // Validate input before saving
  const inputLooksValid = userMessage.length > 2 && !userMessage.includes("?");

  if (stage !== "confirm" && nextStage[stage] && inputLooksValid) {
    session.data[stage] = userMessage;
    session.stage = nextStage[stage];
    await session.save();
  }

  // Prompt based on current stage
  switch (session.stage) {
    case "name":
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
      return "❓ No entendí muy bien eso. ¿Podrías decirlo de otra forma?";
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
