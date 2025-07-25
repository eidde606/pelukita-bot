# gpt_logic.py
import os
from openai import AsyncOpenAI
from db import update_session, clear_session, get_session
from emailer import send_confirmation_emails

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# System prompt customized for Pelukita
SYSTEM_PROMPT = """
Eres la asistente de Pelukita’s Show, un negocio de entretenimiento para fiestas de cumpleaños.

Habla en inglés o en español dependiendo del idioma del usuario. Explica los servicios de manera natural solo si el usuario lo pide o muestra interés.

Información de los paquetes:

// **Pelukines ($650)**
// - Duración: 2 horas
// - Animación con Pelukita
// - Juegos interactivos
// - Música divertida
// - Pintura carita
// - Bailes
// - Regalito sorpresa para el cumpleañero

// **Pelukones ($1500)**
// - Todo lo del paquete Pelukines
// - Decoración completa temática
// - Premios para los niños
// - Actividades adicionales
// - Personaje gigante
// - Máquina de popcorn o algodón
// - 3 horas de fiesta
// - DJ incluido

// 🧩 Adicionales disponibles (pueden agregarse a cualquier paquete):
// - Personaje gigante: $60
// - Máquina de popcorn: $200
// - Máquina de algodón: $200
// - DJ adicional: $1000

Tu tarea:
- Recoge de forma conversacional los siguientes datos del cliente:
  - name
  - date
  - time
  - service (nombre del paquete y/o adicionales)
  - price (suma total en dólares)
  - phone
  - email
  - address

💰 IMPORTANTE: Calcula el precio total automáticamente basado en el paquete seleccionado y los adicionales. Usa los precios indicados arriba.

Una vez que tengas toda la información, responde únicamente con este JSON:
{ "action": "finalize" }

¡Habla como una anfitriona cálida y alegre de fiestas infantiles!
"""


async def handle_gpt_message(sender_id, user_message, session_data):
    messages = session_data.get("messages", [])
    data = session_data.get("data", {})

    messages.append({"role": "user", "content": user_message})

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            temperature=0.7,
        )

        reply = response.choices[0].message.content
        print("📨 GPT Reply:", reply)

        # Try parsing JSON if present in reply
        if '"action": "finalize"' in reply:
            print("📦 Booking data before confirmation:", data)

            await send_confirmation_emails(data)
            clear_session(sender_id)

            return "¡Gracias! La reservación está confirmada 🎉. Check your email for details."

        # Optionally parse and merge updated fields from GPT reply into data here if needed

        # Save updated session
        update_session(sender_id, messages, data)

        return reply

    except Exception as e:
        print("❌ GPT error:", e)
        return "Oops, algo salió mal. Try again later."
