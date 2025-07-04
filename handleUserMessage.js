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

Tu tarea es recopilar estos datos uno a uno, confirmando después de cada respuesta:
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

Después que TODOS los datos estén completos, haz un resumen alegre con todos los detalles y pregunta:
“¿Está todo correcto para finalizar la reservación?”

Si el cliente responde que sí, entonces y SOLO ENTONCES responde:

{ "action": "finalize" }

Nunca lo envíes antes. Siempre da una respuesta natural junto al JSON. Nunca respondas solo con el JSON.
`.trim(),
      },
      ...messages,
    ],
    temperature: 0.7,
  });

  const reply = response.choices[0].message.content;
  const toolCalls = extractAllJson(reply);
  console.log("ToolCalls parsed:", toolCalls);

  // Normalize Spanish keys
  const fieldMap = {
    nombre: "name",
    nombre_adulto: "name",
    cumpleañero: "birthdayName",
    edad: "birthdayAge",
    fecha: "date",
    hora: "time",
    dirección: "address",
    direccion: "address",
    niños: "children",
    paquete: "package",
    adicionales: "extras",
    precio: "price",
    teléfono: "phone",
    telefono: "phone",
    correo: "email",
    correo_electronico: "email",
  };

  for (const toolCall of toolCalls) {
    if (toolCall?.field && toolCall?.value) {
      const normalized =
        fieldMap[toolCall.field.toLowerCase()] || toolCall.field;
      session.data[normalized] = toolCall.value;
    }
  }

  // Check for finalize
  const finalizeCall = toolCalls.find((tc) => tc.action === "finalize");
  if (finalizeCall) {
    console.log("Session data before creating booking:", session.data);

    const requiredFields = [
      "name",
      "birthdayName",
      "birthdayAge",
      "date",
      "time",
      "address",
      "children",
      "package",
      "extras",
      "price",
      "phone",
      "email",
    ];
    const missing = requiredFields.filter((field) => !session.data[field]);

    if (missing.length === 0) {
      const bookingData = { ...session.data, status: "Booked" };
      console.log("✅ Final bookingData to be saved:", bookingData);

      await Booking.create(bookingData);
      await sendEmail(bookingData.email, bookingData);
      await Session.deleteOne({ senderId });

      return "🎉 ¡Gracias por reservar con Pelukita! 🎈 Tu evento ha sido guardado con éxito y te hemos enviado un correo de confirmación. ¡Va a ser una fiesta brutal!";
    } else {
      console.log("❌ Cannot finalize. Missing:", missing);
      return `⚠️ Falta información: ${missing.join(
        ", "
      )}. ¿Puedes completarla?`;
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

function extractAllJson(text) {
  const jsonMatches = text.match(/\{[^{}]+\}/g);
  if (!jsonMatches) return [];
  return jsonMatches
    .map((str) => {
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = handleUserMessage;
