# db.py
from pymongo import MongoClient
import os

client = MongoClient(os.getenv("MONGODB_URI"))

db = client["pelukita_db"]
sessions = db["sessions"]


def get_or_create_session(sender_id):
    session = sessions.find_one({"senderId": sender_id})
    if not session:
        session = {"senderId": sender_id, "messages": [], "data": {}}
        sessions.insert_one(session)
    return session


def update_session(sender_id, messages, data):
    sessions.update_one(
        {"senderId": sender_id}, {"$set": {"messages": messages, "data": data}}
    )


def clear_session(sender_id):
    sessions.delete_one({"senderId": sender_id})


def get_session(sender_id):
    return sessions.find_one({"senderId": sender_id})
