const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");
const sendEmail = require("./sendEmail");
const moment = require("moment");
require("moment/locale/es");
moment.locale("es");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function calculatePrice(selectedpackage, extras) {
  const prices = {
    Pelukines: 650,
    Pelukones: 1500,
    giantMascot: 60,
    popcorn: 200,
    cottonCandy: 200,
    dj: 1000,
  };
  let total =
    selectedpackage === "Pelukones" ? prices.Pelukones : prices.Pelukines;
  if (extras) {
    const extrasArray = Array.isArray(extras)
      ? extras
      : extras.split(",").map((e) => e.trim());
    if (extrasArray.includes("giantMascot")) total += prices.giantMascot;
    if (extrasArray.includes("popcorn")) total += prices.popcorn;
    if (extrasArray.includes("cottonCandy")) total += prices.cottonCandy;
    if (extrasArray.includes("dj")) total += prices.dj;
  }
  return total;
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
    name: ["name", "adultname", "nombre", "adultnombre"],
    birthdayName: ["birthdayname", "nombrenino", "nombrenio", "birthdaykid"],
    birthdayAge: ["age", "edad", "birthdayage"],
    date: ["fecha", "date"],
    time: ["hora", "time"],
    address: ["direccion", "address"],
    children: ["niño", "kids", "children", "ninos", "childrennumber"],
    package: ["paquete", "package"],
    extras: [
      "extra",
      "addon",
      "adicional",
      "extras",
      "adicionales",
      "additional",
    ],
    price: ["precio", "totalprice", "price"],
    phone: ["telefono", "phone"],
    email: ["correo", "email"],
  };

  const normalizeKey = (key) => {
    const lowerKey = key.toLowerCase().replace(/\s|_/g, "");
    for (const [normalized, aliases] of Object.entries(keyMap)) {
      if (aliases.some((alias) => lowerKey.includes(alias))) {
        return normalized;
      }
    }
    return lowerKey;
  };

  for (const toolCall of toolCalls) {
    if (toolCall?.field && toolCall.value !== undefined) {
      const normalized = normalizeKey(toolCall.field);

      if (normalized === "date") {
        let input = toolCall.value.trim().toLowerCase();
        input = input.charAt(0).toUpperCase() + input.slice(1);

        const monthMap = {
          enero: "January",
          febrero: "February",
          marzo: "March",
          abril: "April",
          mayo: "May",
          junio: "June",
          julio: "July",
          agosto: "August",
          septiembre: "September",
          octubre: "October",
          noviembre: "November",
          diciembre: "December",
        };

        for (const [es, en] of Object.entries(monthMap)) {
          if (input.includes(es)) {
            input = input.replace(es, en);
            break;
          }
        }

        if (!/\d{4}/.test(input)) {
          input += ` ${new Date().getFullYear()}`;
        }

        const parsedDate = moment(input, ["D MMMM YYYY", "MMMM D YYYY"], true);
        if (!parsedDate.isValid() || parsedDate.isBefore(moment(), "day")) {
          return "⚠️ La fecha proporcionada no es válida o está en el pasado. Por favor, ingresa una fecha futura.";
        }

        session.data[normalized] = parsedDate.format("YYYY-MM-DD");
        continue;
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
    /^(sí|si|ok|vale|correcto|está (correcto|bien|perfecto)|todo (bien|está bien|está perfecto))$/i.test(
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
    if (session.data.price != expectedPrice) {
      return `⚠️ El precio proporcionado (${session.data.price}) no coincide con el esperado (${expectedPrice}). ¿Puedes confirmar el paquete y adicionales?`;
    }

    if (missing.length === 0) {
      const bookingData = { ...session.data, status: "Booked" };
      console.log("✅ Final bookingData to be saved:", bookingData);

      try {
        await Booking.create(bookingData);
        await sendEmail(bookingData.email, bookingData);
        await Session.deleteOne({ senderId });
        return "🎉 ¡Gracias por reservar con Pelukita! 🎈 Tu evento ha sido guardado con éxito y te hemos enviado un correo de confirmación. ¡Va a ser una fiesta brutal!";
      } catch (error) {
        console.error("Error finalizing booking:", error);
        return "😔 ¡Lo siento! Hubo un problema al procesar tu reserva. Por favor, intenta de nuevo o contáctanos al 804-735-8835.";
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
    .replace(/\{[^{}]*\}/g, "")
    .replace(/^[,\s\n\r]+$/gm, "")
    .trim();

  return cleaned;
}

function extractAllJson(text) {
  const jsonMatches = text.match(/\{[^{}]*\}/g) || [];
  return jsonMatches
    .map((str) => {
      try {
        const parsed = JSON.parse(str);
        if (parsed.field || parsed.action) return parsed;
        return null;
      } catch (error) {
        console.warn("Invalid JSON detected:", str, error);
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = handleUserMessage;
