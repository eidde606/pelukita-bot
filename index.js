const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const Booking = require("./Booking");
const Session = require("./Session");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.get("/", (req, res) => {
  res.send("Pelukita Messenger Bot is live!");
});

const paquetesText = `🎊 ¡Claro! Ofrezco dos paquetes de fiesta llenos de diversión:

1️⃣ 🎉 Paquete Pelukines – $650 – Ideal para fiestas en casa:
- 1 hora de pinta caritas
- 2 horas de show con juegos y concursos
- Piñata y Happy Birthday 🎂
- Parlante incluido 🔊
Adicionales:
🧸 Muñeco gigante: $60
🍿 Popcorn o algodón (50): $200
🎧 DJ (4 horas): $1000

2️⃣ 🎊 Paquete Pelukones – $1500 – Ideal para locales:
- Todo lo de Pelukines
- Muñeco incluido 🧸
- Popcorn y algodón incluidos 🍭
- DJ profesional (4 horas) 🎧`;

const getDefaultGreeting = () => {
  return "¡Hola, hola! 🎈🎉 ¿Cómo puedo alegrar tu día? ¿Quieres saber sobre mis paquetes o deseas hacer una reservación? 🎁🎂";
};

const isBookingIntent = (message) => {
  return /reservar|reserva|quiero.*paquete|me interesa/i.test(message);
};

const isAskingForPaquetes = (message) => {
  return /paquetes|ofreces|qué incluye|servicios/i.test(message);
};

const requiredFields = [
  "name",
  "date",
  "time",
  "service",
  "price",
  "phone",
  "address",
];

app.post("/webhook", async (req, res) => {
  const message = req.body.message?.text || "";
  const senderId = req.body.sender?.id || "";

  if (!senderId || !message) return res.sendStatus(400);

  let session = await Session.findOne({ senderId });
  if (!session) {
    session = new Session({ senderId });
    await session.save();
  }

  let response = "";
  const lower = message.toLowerCase();

  // Check for general interest or greeting
  if (/hola|buenas/i.test(lower)) {
    response = getDefaultGreeting();
  } else if (isAskingForPaquetes(lower)) {
    response = paquetesText;
  } else if (isBookingIntent(lower)) {
    response =
      "¡Genial! Para reservar tu fiesta necesito algunos datos. ¿Cuál es tu nombre?";
    session.stage = "name";
    await session.save();
  } else if (requiredFields.includes(session.stage)) {
    session.data[session.stage] = message;
    const nextFieldIndex = requiredFields.indexOf(session.stage) + 1;
    if (nextFieldIndex < requiredFields.length) {
      session.stage = requiredFields[nextFieldIndex];
      response = `Perfecto. Ahora dime tu ${session.stage}.`;
    } else {
      session.stage = "done";
      await Booking.create({ ...session.data });
      response = `✅ ¡Reservación guardada! 🎉 Pelukita te verá el ${session.data.date} a las ${session.data.time}. 🥳`;
    }
    await session.save();
  } else {
    response =
      "😓 No entendí muy bien. Puedes preguntarme sobre los paquetes o si deseas hacer una reservación.";
  }

  return res.json({ reply: response });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
