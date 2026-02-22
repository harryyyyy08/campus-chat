const { io } = require("socket.io-client");

const TOKEN = process.env.TOKEN; // set in PowerShell
const CONV_ID = Number(process.env.CONV_ID || 0);
const NAME = process.env.NAME || "client";

if (!TOKEN || !CONV_ID) {
  console.log(
    "Usage: set TOKEN=... ; set CONV_ID=3 ; set NAME=harry ; node client_test.js",
  );
  process.exit(1);
}

const socket = io("http://localhost:3001", {
  auth: { token: TOKEN },
});

socket.on("connect", () => {
  console.log(`[${NAME}] connected`, socket.id);

  // socket.emit("join_conversation", { conversation_id: CONV_ID });

  // send a message after connect (optional)
  // socket.emit("send_message", { conversation_id: CONV_ID, body: `Hello from ${NAME}` }, console.log);
});

socket.on("joined_conversations", (list) => {
  console.log(`[${NAME}] joined_conversations:`, list);
});

socket.on("connect_error", (err) => {
  console.log(`[${NAME}] connect_error:`, err.message);
});

socket.on("new_message", (msg) => {
  console.log(`[${NAME}] new_message:`, msg);
});

socket.on("presence", (p) => {
  // console.log(`[${NAME}] presence:`, p);
});

// Allow typing messages in terminal (basic)
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const text = chunk.trim();
  if (!text) return;
  socket.emit(
    "send_message",
    { conversation_id: CONV_ID, body: text },
    (ack) => {
      console.log(`[${NAME}] ack:`, ack);
    },
  );
});
