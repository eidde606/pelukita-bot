# emailer.py
import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

user = os.getenv("GMAIL_USER")
password = os.getenv("GMAIL_PASS")


def send_email_to_client(to_email, name, date, time, service, price, address):
    subject = "🎉 Your Party Reservation with Pelukita is Confirmed!"
    body = f"""
Hi {name},

This is a confirmation that your party has been scheduled with Pelukita’s Show.

📅 Date: {date}
🕒 Time: {time}
🎈 Service: {service}
💰 Price: {price}
📍 Address: {address}

We look forward to celebrating with you!

– Pelukita
"""

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(user, password)
            server.sendmail(user, to_email, msg.as_string())
        print("✅ Email sent to client")
    except Exception as e:
        print("❌ Error sending email to client:", e)


def send_email_to_me(name, email, date, time, service, price, address):
    subject = f"📬 NEW Pelukita Party Booking from {name}"
    body = f"""
You just received a new reservation from Messenger.

👤 Name: {name}
📧 Email: {email}
📅 Date: {date}
🕒 Time: {time}
🎈 Service: {service}
💰 Price: {price}
📍 Address: {address}

Check the schedule and follow up if needed.
"""

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = user  # Send to yourself

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(user, password)
            server.sendmail(user, user, msg.as_string())
        print("✅ Notification email sent to Pelukita (your inbox)")
    except Exception as e:
        print("❌ Error sending internal email:", e)


async def send_confirmation_emails(data):
    print("📧 Sending emails for booking:")
    print(data)

    name = data.get("name")
    email = data.get("email")
    date = data.get("date")
    time = data.get("time")
    service = data.get("service")
    price = data.get("price")
    address = data.get("address")

    if email:
        send_email_to_client(email, name, date, time, service, price, address)

    send_email_to_me(name, email, date, time, service, price, address)
