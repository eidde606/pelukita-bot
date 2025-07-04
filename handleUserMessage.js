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
📞 Teléfono: 804-735-8835

🎉 *Paquete Pelukines* – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas para todos los niños.
- 2 horas de show interactivo: juegos, concursos, rompe piñata, happy birthday.
- Parlante incluido.
Adicionales:
🧸 Muñeco gigante: $60
🍿 Carrito popcorn o algodón (50 unidades): $200
🎧 DJ adicional (4 horas): $1000

🎊 *Paquete Pelukones* – $1500 – Ideal para fiestas en local:
Todo lo del Pelukines MÁS:
🧸 Muñeco gigante incluido
🍭 Popcorn y algodón incluidos (50 unidades)
🎧 DJ profesional (4 horas)

Tu tarea es recopilar estos datos, uno por uno:
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

Después de recopilar todos, haz un resumen alegre.

⚠️ Si el cliente responde con algo como “sí”, “todo bien”, “correcto”, etc., repite toda la información que recopilaste en este formato exacto:

\`\`\`json
[
  { "field": "name", "value": "Eddie" },
  { "field": "birthdayName", "value": "Lucas" },
  { "field": "birthdayAge", "value": "5" },
  ...
  { "action": "finalize" }
]
\`\`\`

✅ NO OMITAS NINGUNO. NUNCA pongas solo \`{ "action": "finalize" }\` sin los otros campos.
`.trim(),
      },
      ...messages,
    ],
    temperature: 0.7,
  });

  const reply = response.choices[0].message.content;
  const toolCalls = extractAllJson(reply);
  console.log("ToolCalls parsed:", toolCalls);

  const normalizeKey = (key) => {
    const str = key.toLowerCase().replace(/\s|_/g, "");
    if (str.includes("name") && str.includes("adult")) return "name";
    if (str.includes("birthdayname")) return "birthdayName";
    if (str.includes("edad") || str.includes("age")) return "birthdayAge";
    if (str.includes("fecha") || str.includes("date")) return "date";
    if (str.includes("hora") || str.includes("time")) return "time";
    if (str.includes("direccion") || str.includes("address")) return "address";
    if (
      str.includes("niño") ||
      str.includes("kids") ||
      str.includes("children")
    )
      return "children";
    if (str.includes("paquete") || str.includes("package")) return "package";
    if (
      str.includes("extra") ||
      str.includes("addon") ||
      str.includes("adicional")
    )
      return "extras";
    if (
      str.includes("precio") ||
      str.includes("totalprice") ||
      str.includes("price")
    )
      return "price";
    if (str.includes("telefono") || str.includes("phone")) return "phone";
    if (str.includes("correo") || str.includes("email")) return "email";
    return key;
  };

  for (const toolCall of toolCalls) {
    if (toolCall?.field && toolCall.value !== undefined) {
      const normalized = normalizeKey(toolCall.field);
      session.data[normalized] = toolCall.value;
    }
  }

  const isFinalConfirmation =
    /^(sí|si|todo bien|está correcto|correcto|está bien|todo está bien|está perfecto|está todo bien)$/i.test(
      userMessage.trim()
    );

  const finalizeCall =
    toolCalls.find((tc) => tc.action === "finalize") ||
    (isFinalConfirmation ? { action: "finalize" } : null);

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
