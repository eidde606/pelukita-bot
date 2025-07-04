const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const mongoose = require("mongoose");

const Booking = require("./Booking");
const Session = require("./Session");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Pelukita Messenger Bot is live!");
});

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
        const data = session?.data || {};

        const stagePrompts = {
          name: "¿Cuál es tu nombre?",
          date: "¿Qué día es la fiesta?",
          time: "¿A qué hora es la fiesta?",
          service: "¿Qué paquete deseas? (Pelukines o Pelukones)",
          phone: "¿Cuál es tu número de teléfono?",
          address: "¿Cuál es la dirección del evento?",
          notes: "¿Hay alguna nota adicional?",
        };

        try {
          const extracted = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `You are a data parser. Given any natural sentence from a user about booking a clown party, extract and return a JSON object with the fields: name, date, time, service (Pelukines or Pelukones), phone, address, notes. Dates must be YYYY-MM-DD and time in HH:MM AM/PM. If unknown, return null.`,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          const parsed = JSON.parse(extracted.choices[0].message.content);
          const fields = Object.keys(stagePrompts);

          if (!session) {
            session = new Session({ senderId, data: {}, stage: "name" });
          }

          for (const field of fields) {
            if (!data[field] && parsed[field]) {
              data[field] = parsed[field];
              if (field === "service") {
                data.price = parsed[field].toLowerCase().includes("pelukon")
                  ? "$1500"
                  : "$650";
              }
            }
          }

          session.data = data;

          const nextField = fields.find((f) => !data[f]);

          if (!nextField) {
            session.stage = "confirm";
          } else {
            session.stage = nextField;
          }

          await session.save();

          if (session.stage === "confirm") {
            if (userMessage.toLowerCase() === "confirm") {
              try {
                const newBooking = new Booking({ ...data });
                await newBooking.save();
                await Session.deleteOne({ senderId });
                botReply = `✅ ¡Tu reservación ha sido guardada exitosamente! 🎉 Pelukita está feliz y te verá el día ${data.date} a las ${data.time}. ¡Prepárate para la diversión! 🥳🎈`;
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
            }
          } else {
            const pelukitaResponse = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: `You are Pelukita, a cheerful and charismatic female clown who offers fun-filled birthday party packages for children and families. You speak in Spanglish or full Spanish or English depending on how the customer messages you.

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

Always respond with joy, emojis, and excitement like a party host. Be helpful, answer customer questions clearly, and guide them through the reservation process.`,
                },
                {
                  role: "user",
                  content: `Ayúdame a preguntar lo siguiente: "${
                    stagePrompts[session.stage]
                  }"`,
                },
              ],
            });

            botReply = pelukitaResponse.choices[0].message.content;
          }
        } catch (err) {
          console.error("❌ OpenAI parsing error:", err);
          botReply =
            "😓 Pelukita no entendió. ¿Podrías escribirlo de otra manera?";
        }

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

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
