const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const mongoose = require("mongoose");

const Booking = require("./Booking");

const Session = require("./Session");

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(bodyParser.json());

// Root endpoint
app.get("/", (req, res) => {
  res.send("Pelukita Messenger Bot is live!");
});

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully");
    return res.status(200).send(challenge);
  } else {
    console.warn("❌ Webhook verification failed");
    return res.sendStatus(403);
  }
});

// Handle incoming messages (POST)
app.post("/webhook", async (req, res) => {
  console.log("🔔 Webhook triggered:", JSON.stringify(req.body, null, 2));

  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text.trim();
        console.log("💬 Incoming message:", userMessage);

        let botReply = "Lo siento, algo salió mal...";

        let session = await Session.findOne({ senderId });

        if (session) {
          const stage = session.stage;
          const data = session.data || {};

          switch (stage) {
            case "name":
              data.name = userMessage;
              session.stage = "date";
              botReply = "📅 ¿Qué día es la fiesta? (ej. 2025-08-15)";
              break;

            case "date":
              data.date = userMessage;
              session.stage = "time";
              botReply = "⏰ ¿A qué hora es la fiesta?";
              break;

            case "time":
              data.time = userMessage;
              session.stage = "service";
              botReply = "🎈 ¿Qué paquete deseas? (Pelukines o Pelukones)";
              break;

            case "service":
              data.service = userMessage;
              data.price = userMessage.toLowerCase().includes("pelukon")
                ? "$1500"
                : "$650";
              session.stage = "phone";
              botReply = "📞 ¿Cuál es tu número de teléfono?";
              break;

            case "phone":
              data.phone = userMessage;
              session.stage = "address";
              botReply = "📍 ¿Cuál es la dirección del evento?";
              break;

            case "address":
              data.address = userMessage;
              session.stage = "notes";
              botReply = "📝 ¿Alguna nota adicional?";
              break;

            case "notes":
              data.notes = userMessage;
              session.stage = "confirm";
              botReply = `🎉 Aquí está el resumen de tu reservación:

👤 Nombre: ${data.name}
📅 Fecha: ${data.date}
⏰ Hora: ${data.time}
🎁 Paquete: ${data.service}
💵 Precio: ${data.price}
📞 Teléfono: ${data.phone}
📍 Dirección: ${data.address}
📝 Notas: ${data.notes}

👉 Escribe *confirm* para guardar o *cancel* para comenzar otra vez.`;
              break;

            case "confirm":
              if (userMessage.toLowerCase() === "confirm") {
                try {
                  const newBooking = new Booking({ ...data });
                  await newBooking.save();
                  await Session.deleteOne({ senderId });
                  botReply =
                    "✅ ¡Tu reservación ha sido guardada exitosamente! 🎉 Gracias por confiar en Pelukita.";
                } catch (err) {
                  console.error("❌ Error saving booking:", err);
                  botReply =
                    "😓 Lo siento, hubo un error al guardar tu reservación.";
                }
              } else if (userMessage.toLowerCase() === "cancel") {
                await Session.deleteOne({ senderId });
                botReply =
                  "❌ Reservación cancelada. Si deseas comenzar otra vez, solo escribe *hola*.";
              } else {
                botReply =
                  "❓ Por favor escribe *confirm* para guardar o *cancel* para comenzar otra vez.";
              }
              break;

            default:
              botReply = "❓ No entendí eso. Escribe *cancel* para reiniciar.";
          }

          session.data = data;
          await session.save();
        } else {
          // No active session → use OpenAI to reply in character
          try {
            const completion = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: `
You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party packages for children and families. You speak in Spanglish or full Spanish or english depending on how the customer messages you.

These are your services:

🎉 *Paquete Pelukines* – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas para todos los niños.
- 2 horas de show interactivo que incluye:
  • Juegos y concursos con premios para niños y adultos.
  • Rompe la piñata y canto del Happy Birthday.
- Pelukita lleva su propio speaker para animar el evento.
- Adicionales disponibles:
  🧸 Muñeco gigante: $60 (Mario, Luigi, Mickey, Minnie, Plin Plin, Zenon)
  🍿 Carrito de popcorn o algodón de azúcar (50 unidades): $200
  🎧 DJ adicional (4 horas): $1000

🎊 *Paquete Pelukones* – $1500 – Ideal para fiestas en local:
- Todo lo incluido en Pelukines, más:
  🧸 Muñeco gigante incluido a elección.
  🍭 Carrito de popcorn y algodón de azúcar con 50 unidades.
  🎧 DJ profesional (4 horas).

Always respond with joy, emojis, and excitement like a party host. Be helpful, answer customer questions clearly, and offer to explain the differences between packages if asked.
                  `.trim(),
                },
                {
                  role: "user",
                  content: userMessage,
                },
              ],
            });

            botReply = completion.choices[0].message.content;

            if (
              userMessage.toLowerCase().includes("book") ||
              userMessage.toLowerCase().includes("reservar")
            ) {
              const newSession = new Session({ senderId, stage: "name" });
              await newSession.save();
              botReply += `\n\n🎉 ¡Vamos a reservar! ¿Cuál es tu nombre?`;
            }
          } catch (err) {
            console.error(
              "❌ OpenAI error:",
              err.response?.data || err.message
            );
            botReply =
              "😅 ¡Ups! Pelukita tuvo un problema entendiendo. Intenta de nuevo.";
          }
        }

        // Send reply
        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
            {
              recipient: { id: senderId },
              message: { text: botReply },
            }
          );
          console.log("✅ Bot reply sent to:", senderId);
        } catch (err) {
          console.error("❌ Sending error:", err.response?.data || err.message);
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  } else {
    return res.sendStatus(404);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
