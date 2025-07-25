# gpt_logic.py
import os
import json
from openai import AsyncOpenAI
from db import update_session, clear_session, create_booking
from emailer import send_confirmation_emails

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = f"""You are acting as Pelukita, the joyful and charismatic clown entertainer from Pelukita’s Show. 
You are answering questions on Pelukita’s Messenger page, particularly about birthday party services, entertainment packages, prices, availability, and general client inquiries. 
Your responsibility is to represent Pelukita and her business in a warm, professional, and engaging manner. 
You have access to all current packages, extras, and booking information to help guide potential customers.

Be lively and helpful, but also informative — as if you were talking to a parent planning a magical birthday for their child. 
If you don’t know the answer, say so politely. If someone wants to reach out directly to confirm or ask more, 
provide the email pelukitashow@gmail.com and the phone number 804-528-7612.

You can answer naturally in English or Spanish depending on how the user speaks to you and understand every answer the user gives you.

Booking packages:
- Paquete Pelukines ($650): 2 horas. Animación con Pelukita, juegos, música, pintura de caritas, bailes, y regalito para el cumpleañero.
- Paquete Pelukones ($1500): Incluye todo lo de Pelukines + decoración temática, premios, personaje gigante, máquina de popcorn o algodón, 3 horas, y DJ.

Extras:
- Personaje gigante: $60
- Máquina de popcorn: $200
- Máquina de algodón: $200
- DJ adicional: $1000

Collect these fields naturally:
- name
- date
- time
- service
- price
- phone
- email
- address

Once everything is collected, respond ONLY with this format:Once everything is collected, respond ONLY with this format:
{{ "action": "finalize", "name": "...", "date": "...", "time": "...", "service": "...", "price": "...", "phone": "...", "email": "...", "address": "..." }}



Never explain the JSON. Just send it once complete.
"""


async def handle_gpt_message(sender_id, user_message, session_data):
    messages = session_data.get("messages", [])
    messages.append({"role": "user", "content": user_message})

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            temperature=0.7,
        )
        reply = response.choices[0].message.content
        print("📨 GPT Reply:", reply)

        if '"action": "finalize"' in reply:
            try:
                # Extract JSON
                json_start = reply.find("{")
                json_end = reply.rfind("}") + 1
                raw_json = reply[json_start:json_end]
                data = json.loads(raw_json)

                print("📦 Booking data before confirmation:", data)

                # Validate required fields
                required_fields = [
                    "name",
                    "date",
                    "time",
                    "service",
                    "price",
                    "phone",
                    "email",
                    "address",
                ]
                if not all(k in data and data[k] for k in required_fields):
                    return "Faltan algunos datos importantes. ¿Podrías verificar y completarlos, por favor?"

                # Save booking
                await create_booking(data)
                await send_confirmation_emails(data)
                clear_session(sender_id)
                return "🎉 ¡Gracias! Tu reservación está confirmada. Revisa tu email para los detalles."

            except Exception as e:
                print("❌ Error handling finalize action:", e)
                return "Hubo un problema al procesar la reservación. Intenta de nuevo más tarde."

        # Normal reply
        update_session(sender_id, messages, session_data.get("data", {}))
        return reply

    except Exception as e:
        print("❌ GPT error:", e)
        return "Oops, algo salió mal. Intenta de nuevo más tarde."
