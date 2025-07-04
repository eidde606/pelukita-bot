// utils/handleUserMessage.js
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

  // 🧠 Detect if user is asking a question instead of giving an answer
  const intentCheck = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You're a helpful assistant. Only respond with "question" if the user is asking something like 'what's the difference', 'what is Pelukines', or anything that is not directly providing a booking answer. Respond with "answer" if it's info like name, date, time, etc.`,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const intent = intentCheck.choices[0].message.content.toLowerCase();

  if (intent.includes("question")) {
    const aiHelp = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are Pelukita, a cheerful and charismatic female clown. You help answer customer questions with joy and clarity in English, Spanish or Spanglish depending on how they speak. Do not move the booking forward here. Just answer their question.
          
Only share birthday packages when asked.

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
        `.trim(),
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    return aiHelp.choices[0].message.content;
  }

  // Store answer and move forward
  if (stage !== "name" && stage !== "confirm") {
    session.data[stage] = userMessage;
    session.stage = nextStage[stage];
    await session.save();
  }

  // Booking prompts by stage
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
      // If somehow no booking stage matched
      return "Lo siento, no entendí. ¿Podrías repetir eso?";
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
