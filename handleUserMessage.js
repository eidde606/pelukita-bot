const OpenAI = require("openai");
const Session = require("./Session");
const Booking = require("./Booking");
const sendEmail = require("./sendEmail");
const moment = require("moment");
const sendWhatsAppMessage = require("./sendWhatsApp");
require("moment/locale/es");
moment.locale("es");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const calculatePrice = (selectedPackage, extras) => {
  const prices = {
    Pelukines: 650,
    Pelukones: 1500,
    giantMascot: 600,
    popcorn: 200,
    cottonCandy: 200,
    dj: 150,
  };

  let total =
    selectedPackage === "Pelukones" ? prices.Pelukones : prices.Pelukines;

  const extrasArray = Array.isArray(extras)
    ? extras
    : typeof extras === "string"
    ? extras.toLowerCase().includes("ninguno")
      ? []
      : extras.split(",").map((e) => e.trim().toLowerCase())
    : [];

  if (extrasArray.includes("giant mascot")) total += prices.giantMascot;
  if (extrasArray.includes("popcorn")) total += prices.popcorn;
  if (
    extrasArray.includes("cotton candy") ||
    extrasArray.includes("máquina de algodón")
  )
    total += prices.cottonCandy;
  if (extrasArray.includes("dj")) total += prices.dj;

  return total;
};

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
Eres Pelukita, una payasita alegre, carismática y profesional. Ayudas a las familias a reservar fiestas infantiles hablando de forma natural, en español o Spanglish, según cómo te hablen.

🎯 Tu objetivo es tener una conversación divertida, fluida y amable, NUNCA mostrando campos técnicos como \`birthdayName\` o \`phone\`. Solo al final, cuando ya tienes toda la información, devuelves los datos como JSON con los siguientes nombres EXACTOS (sin traducirlos ni cambiarlos):

- name  
- birthdayName  
- birthdayAge  
- date  
- time  
- address  
- numberOfKids  
- package  
- additionals  
- price  
- phone  
- email  

Incluye siempre esto al final:
- action: "finalize"

✅ Ejemplo de salida final:
\`\`\`json
[
  { "field": "name", "value": "Eddie" },
  { "field": "birthdayName", "value": "Lucas" },
  { "field": "birthdayAge", "value": "5" },
  ...
  { "field": "price", "value": "$650" },
  { "action": "finalize" }
]
\`\`\`

🎁 Información de los paquetes:

**Pelukines ($650)**  
- Duración: 2 horas  
- Animación con Pelukita  
- Juegos interactivos  
- Música divertida  
- Pintura carita  
- Bailes  
- Regalito sorpresa para el cumpleañero

**Pelukones ($1500)**  
- Todo lo del paquete Pelukines  
- Decoración completa temática  
- Premios para los niños  
- Actividades adicionales  
- Personaje gigante  
- Máquina de popcorn o algodón  
- 3 horas de fiesta  
- DJ incluido

🧩 Adicionales disponibles (pueden agregarse a cualquier paquete):

- Personaje gigante: $60  
- Máquina de popcorn: $200  
- Máquina de algodón: $200  
- DJ adicional: $1000

💰 Reglas para el campo \`price\`:
- Si el paquete es “Pelukines” y no hay adicionales, el precio es "$650".
- Si el paquete es “Pelukones” y no hay adicionales, el precio es "$1500".
- Si hay adicionales, suma sus precios al total.
- Si no puedes calcular el precio exacto, pregunta qué adicionales desea antes de finalizar.

⚠️ Durante la conversación, **NUNCA muestres ni menciones los nombres técnicos** como \`birthdayAge\` o \`email\`. Habla naturalmente: pregunta “¿Cuántos años cumple?” o “¿Cuál es tu correo?” y luego tú lo traduces internamente al campo correcto.

🎉 Tu tono debe ser dulce, alegre y profesional. Tu misión es hacer la reservación lo más fácil, divertida y clara posible.
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
      if (toolCall.field === "date") {
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
          session.data.date = parsedDate.format("YYYY-MM-DD");
          continue;
        } catch (err) {
          console.error("🛑 Error parsing date:", err);
          return "😔 Lo siento, hubo un problema entendiendo la fecha.";
        }
      }

      if (toolCall.field === "package") {
        const val = toolCall.value.toLowerCase();
        session.data.package = val.includes("pelukones")
          ? "Pelukones"
          : val.includes("pelukines")
          ? "Pelukines"
          : toolCall.value;
        continue;
      }

      session.data[toolCall.field] = toolCall.value;
    }
  }

  const requiredFields = [
    "name",
    "birthdayName",
    "birthdayAge",
    "date",
    "time",
    "address",
    "numberOfKids",
    "package",
    "additionals",
    "price",
    "phone",
    "email",
  ];
  const missing = requiredFields.filter((field) => !session.data[field]);

  const isFinalConfirmation =
    /^(sí|si|Si|ok|vale|correcto|todo (bien|perfecto)|está (bien|correcto|perfecto))$/i.test(
      userMessage.trim()
    );

  const finalizeCall =
    toolCalls.find((tc) => tc.action === "finalize") ||
    (isFinalConfirmation ? { action: "finalize" } : null);

  if (finalizeCall) {
    console.log("Session data before creating booking:", session.data);

    const expectedPrice = calculatePrice(
      session.data.package,
      session.data.additionals
    );
    const providedPrice = parseInt(
      (session.data.price || "").toString().match(/\d+/)?.[0] || "0",
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

        await sendWhatsAppMessage(bookingData);

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

  const sessionExists = await Session.exists({ senderId });
  if (sessionExists) {
    session.messages = messages;
    try {
      await session.save();
    } catch (err) {
      console.error("❌ Failed to save session:", err.message);
    }
  }

  const cleaned = reply
    .replace(/\{[^{}]*\}/g, "")
    .replace(/^[,\s\n\r]+$/gm, "")
    .trim();
  return cleaned;
}

module.exports = handleUserMessage;
