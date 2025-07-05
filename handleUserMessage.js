const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");
const sendEmail = require("./sendEmail");
const moment = require("moment");
require("moment/locale/es");
moment.locale("es");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function calculatePrice(selectedPackage, extras) {
  const prices = {
    Pelukines: 650,
    Pelukones: 1500,
    giantMascot: 60,
    popcorn: 200,
    cottonCandy: 200,
    dj: 1000,
  };

  let total =
    selectedPackage === "Pelukones" ? prices.Pelukones : prices.Pelukines;

  if (extras) {
    const extrasArray = Array.isArray(extras)
      ? extras
      : extras.toLowerCase().includes("ninguno")
      ? []
      : extras.split(",").map((e) => e.trim());

    if (extrasArray.includes("giantMascot")) total += prices.giantMascot;
    if (extrasArray.includes("popcorn")) total += prices.popcorn;
    if (extrasArray.includes("cottonCandy")) total += prices.cottonCandy;
    if (extrasArray.includes("dj")) total += prices.dj;
  }

  return total;
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

  const keyMap = {
    name: ["name", "nombre"],
    birthdayName: [
      "birthdayname",
      "cumpleañero",
      "cumpleañera",
      "cumpleanos",
      "nombrecumple",
    ],
    birthdayAge: ["birthdayage", "edad", "edadcumple"],
    date: ["date", "fecha"],
    time: ["time", "hora"],
    address: ["address", "dirección", "direccion"],
    children: [
      "numberofkids",
      "niños",
      "cantidadniños",
      "kids",
      "cantidaddeniños",
      "children",
      "childrennumber",
    ],
    package: ["package", "paquete"],
    extras: ["additionals", "extras", "adicionales"],
    price: ["price", "total", "totalprice", "costo"],
    phone: ["phone", "telefono", "teléfono"],
    email: ["email", "correo", "correoelectronico"],
  };

  const normalizeKey = (key) => {
    const cleanKey = key.toLowerCase().replace(/\s|_/g, "");
    for (const [normalized, aliases] of Object.entries(keyMap)) {
      if (
        aliases.some(
          (alias) => cleanKey === alias.toLowerCase().replace(/\s|_/g, "")
        )
      ) {
        return normalized;
      }
    }
    return cleanKey;
  };

  for (const toolCall of toolCalls) {
    if (toolCall?.field && toolCall.value !== undefined) {
      const normalized = normalizeKey(toolCall.field);

      if (normalized === "date") {
        try {
          const year = new Date().getFullYear();
          const dateResponse = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You are a date formatter. Convert the following human date (in Spanish or English) into strict format YYYY-MM-DD. If the user does not provide a year, assume it is ${year}. Only return the date in that format. No explanations. No quotes. No extra text.`,
              },
              { role: "user", content: toolCall.value },
            ],
            temperature: 0,
          });

          const cleanDate = dateResponse.choices[0].message.content.trim();
          const parsedDate = moment(cleanDate, "YYYY-MM-DD", true);
          if (!parsedDate.isValid()) {
            return "⚠️ La fecha no se pudo entender. Por favor, escribe una fecha como '11 de noviembre'.";
          }
          if (parsedDate.isBefore(moment(), "day")) {
            return "⚠️ Esa fecha ya pasó. Por favor, elige una fecha futura.";
          }
          session.data[normalized] = parsedDate.format("YYYY-MM-DD");
          continue;
        } catch (err) {
          console.error("🛑 Error parsing date:", err);
          return "😔 Lo siento, hubo un problema entendiendo la fecha.";
        }
      }

      if (normalized === "package") {
        const val = toolCall.value.toLowerCase();
        session.data.package = val.includes("pelukones")
          ? "Pelukones"
          : val.includes("pelukines")
          ? "Pelukines"
          : toolCall.value;
        continue; // do not overwrite it again below
      }

      session.data[normalized] = toolCall.value;
    }
  }

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

  const isFinalConfirmation =
    /^(sí|si|ok|vale|correcto|todo (bien|perfecto)|está (bien|correcto|perfecto))$/i.test(
      userMessage.trim()
    );

  const finalizeCall =
    toolCalls.find((tc) => tc.action === "finalize") ||
    (isFinalConfirmation ? { action: "finalize" } : null);

  if (finalizeCall) {
    console.log("Session data before creating booking:", session.data);

    const expectedPrice = calculatePrice(
      session.data.package,
      session.data.extras
    );
    const providedPrice = parseInt(
      (session.data.price || "").toString().replace(/[^\d]/g, ""),
      10
    );

    if (providedPrice !== expectedPrice) {
      return `⚠️ El precio proporcionado (${session.data.price}) no coincide con el esperado (${expectedPrice}). ¿Puedes confirmar el paquete y adicionales?`;
    }

    if (missing.length === 0) {
      const bookingData = { ...session.data, status: "Booked" };
      try {
        await Booking.create(bookingData);
        await sendEmail(bookingData.email, bookingData);
        await Session.deleteOne({ senderId });
        return "🎉 ¡Gracias por reservar con Pelukita! 🎈 Tu evento ha sido guardado con éxito y te hemos enviado un correo de confirmación. ¡Va a ser una fiesta brutal!";
      } catch (err) {
        console.error("❌ Error finalizing booking:", err);
        return "😔 ¡Lo siento! Hubo un problema al procesar tu reserva.";
      }
    } else {
      return `⚠️ Falta información: ${missing.join(
        ", "
      )}. ¿Puedes completarla?`;
    }
  }

  session.messages = messages;
  await session.save();

  const cleaned = reply
    .replace(/\{[^{}]*\}/g, "")
    .replace(/^[,\s\n\r]+$/gm, "")
    .trim();
  return cleaned;
}

module.exports = handleUserMessage;
