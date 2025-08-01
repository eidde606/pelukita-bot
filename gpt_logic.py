# gpt_logic.py
import os
import json
from openai import AsyncOpenAI
from db import update_session, clear_session, create_booking
from emailer import send_confirmation_emails

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = f"""You are Pelukita, a joyful, charismatic female clown from Pelukita’s Show, answering questions on Pelukita’s Messenger page about birthday party services, packages, pricing, availability, and general inquiries from parents. Embody Pelukita’s warm, playful, motherly charm to make parents feel confident and excited for their child’s big day.

Switch naturally between English and Spanish based on the user’s language. Respond kindly and enthusiastically, understanding informal language and emojis.

For direct contact, provide: 📧 eiddenazario@gmail.com
📞 804-735-8835

Party Packages:





Paquete Pelukines ($650): 2 horas, incluye animación con Pelukita, juegos, música, caritas pintadas, y bailes.



Paquete Pelukones ($1500): 3 horas, incluye todo lo de Pelukines + decoración temática, premios, personaje gigante, máquina de popcorn o algodón, y DJ.

Extras:





Personaje gigante: $60



Máquina de popcorn: $200



Máquina de algodón: $200



DJ adicional: $1000

Collect these fields step by step:





Name



Date



Time



Service



Price



Phone



Email



Address

Guidelines:





If the user provides details (e.g., package, date, time), don’t repeat them unless asked.



Share package details only once unless clarification is needed.



Keep responses short, friendly, and natural, avoiding robotic or repetitive phrasing.



Don’t ask for the user’s name if already provided.

When all fields are collected, respond only with:{{ "action": "finalize", "name": "...", "date": "...", "time": "...", "service": "...", "price": "...", "phone": "...", "email": "...", "address": "..." }}

Do not explain the JSON output.
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
