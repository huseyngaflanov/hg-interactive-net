/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.helloWorld = onRequest({ region: "europe-west1" }, (request, response) => {
  response.send("Hello from Firebase!");
  db.collection("test").doc("test").update({ count: admin.firestore.FieldValue.increment(1) });
});

exports.sendMessage = onCall({ cors: true, region: "europe-west1" }, async (request) => {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const { chatId, message } = request.data;
  const db = admin.firestore();

  const chatRef = db.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();

  if (!chatSnap.exists) {
    throw new HttpsError("not-found", "Chat not found");
  }

  const chat = chatSnap.data();
  if (!chat.members.includes(uid)) {
    throw new HttpsError("permission-denied", "Not a member");
  }

  const safeMessage = {
    type: message.type,
    text: message.text,
    time: admin.firestore.FieldValue.serverTimestamp(),
    sender: uid,
  };

  await chatRef.collection("messages").add(safeMessage);
  await chatRef.update({ lastMessage: safeMessage });

  return { success: true };
});




exports.createChat = onCall({ cors: true, region: "europe-west1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const otherUid = request.data?.otherUid;
  if (!otherUid || typeof otherUid !== "string") {
    throw new HttpsError("invalid-argument", "otherUid is required");
  }
  if (otherUid === uid) {
    throw new HttpsError("invalid-argument", "Cannot create chat with yourself");
  }

  const chatRef = await db.collection("chats").add({
    members: [uid, otherUid],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: null,
  });

  return { chatId: chatRef.id };
});
exports.getUserChats = onCall({ cors: true, region: "europe-west1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const snap = await db
    .collection("chats")
    .where("members", "array-contains", uid)
    .limit(50)
    .get();

  // 🔹 If no chats, return empty array
  if (snap.empty) {
    return [];
  }

  const result = [];

  for (const doc of snap.docs) {
    const chat = doc.data() || {};
    const chatId = doc.id;

    // never assume members exists
    const members = Array.isArray(chat.members) ? chat.members : [];

    const otherUid = members.find(m => m !== uid) || null;

    let otherUser = "Unknown";

    if (otherUid) {
      const userDoc = await db.collection("users").doc(otherUid).get();
      if (userDoc.exists) {
        const data = userDoc.data() || {};
        otherUser = data.name || "Unknown";
      }
    }

    result.push({
      chatId,
      otherUser,
      lastMessage: chat.lastMessage || null,
    });
  }

  return result;
});
