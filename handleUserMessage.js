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

Tu trabajo es recopilar los siguientes datos uno a uno, y para cada uno incluye un JSON con este formato:
{ "field": "nombre", "value": "Ángela" }

Nunca omitas ese JSON en tu respuesta. Confirma con el cliente cada dato antes de pasar al siguiente.

Datos a recopilar:
- nombre del adulto
- nombre del cumpleañero
- edad del cumpleañero
- fecha
- hora
- dirección
- número de niños
- paquete
- adicionales (si hay)
- precio total
- teléfono
- correo electrónico

Cuando hayas recopilado **todos los datos**, haz un resumen alegre con todos los detalles. Si el cliente responde que “sí” o “está correcto”, entonces responde así:

1. Agradece con entusiasmo.
2. Repite un resumen corto de la reserva.
3. Al final, **incluye todos los datos en JSON** en un solo bloque como este:

{ "field": "name", "value": "Eddie" }
{ "field": "birthdayName", "value": "Edian" }
{ "field": "birthdayAge", "value": "10" }
...
{ "field": "email", "value": "eiddenazario@gmail.com" }
{ "action": "finalize" }

⚠️ NO pongas el JSON antes del texto. Siempre va al final de la respuesta.
⚠️ Si no incluyes todos los campos al confirmar, no se puede guardar la reserva.

NO repreguntes si ya se confirmó. No digas “¿está correcto?” si ya te dijeron que sí.
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

  // Fallback: detect confirmation in plain text if GPT forgot to include finalize
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
