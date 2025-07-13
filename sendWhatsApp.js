const Twilio = require("twilio");

const client = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendWhatsAppMessage({ date, time }) {
  try {
    const response = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${process.env.PELUKITA_WHATSAPP_NUMBER}`,

      contentSid: "HXb5b62575e6e4ff6129ad7c8efe1f983e",
      contentVariables: JSON.stringify({
        1: date,
        2: time,
      }),
    });
    console.log("✅ WhatsApp message sent to Pelukita:");
  } catch (error) {
    console.error("❌ Error sending WhatsApp message:", error.message);
  }
}

module.exports = sendWhatsAppMessage;
