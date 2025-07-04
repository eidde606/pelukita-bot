const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");
const sendEmail = require("./sendEmail");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const fieldMap = {
  name: ["name", "adultname", "nombre"],
  birthdayName: ["birthdayname", "nombrenino", "nombrenio", "cumpleañero"],
  birthdayAge: ["birthdayage", "edad", "age"],
  date: ["date", "fecha"],
  time: ["time", "hora"],
  address: ["address", "dirección", "direccion"],
  children: [
    "children",
    "numberofchildren",
    "number_of_children",
    "numero_de_niños",
    "niños",
    "numeroniños",
    "numeroninos",
    "kidsnumber",
    "numberofkids",
    "childrenamount",
  ],
  package: ["package", "paquete"],
  extras: [
    "extras",
    "adicionales",
    "additional",
    "additionals",
    "addons",
    "extra",
  ],
  price: ["price", "totalprice", "precio"],
  phone: ["phone", "teléfono", "telefono"],
  email: ["email", "correo", "correo_electronico"],
};

function normalizeKey(key) {
  const lower = key.toLowerCase().replace(/\s|_/g, "");
  for (const [standard, aliases] of Object.entries(fieldMap)) {
    if (aliases.includes(lower)) return standard;
  }
  return lower;
}

function extractAllJson(text) {
  const jsonMatches = text.match(/\{[^{}]*\}/g) || [];
  return jsonMatches
    .map((str) => {
      try {
        const parsed = JSON.parse(str);
        if (parsed.field || parsed.action) return parsed;
        return null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

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

  if (!session.data) session.data = {};
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

  for (const toolCall of toolCalls) {
    if (toolCall?.field && toolCall.value !== undefined) {
      const normalized = normalizeKey(toolCall.field);
      session.data[normalized] = toolCall.value;
    }
  }

  const isFinalConfirmation =
    /^(sí|si|ok|vale|correcto|está (correcto|bien|perfecto)|todo (bien|está bien|está perfecto))$/i.test(
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

      try {
        await Booking.create(bookingData);
        await sendEmail(bookingData.email, bookingData);
        await Session.deleteOne({ senderId });

        return "🎉 ¡Gracias por reservar con Pelukita! 🎈 Tu evento ha sido guardado con éxito y te hemos enviado un correo de confirmación. ¡Va a ser una fiesta brutal!";
      } catch (error) {
        console.error("❌ Error finalizing booking:", error);
        return "😔 ¡Lo siento! Ocurrió un problema al guardar tu reserva. Por favor, intenta de nuevo o llámanos al 804-735-8835.";
      }
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

module.exports = handleUserMessage;
