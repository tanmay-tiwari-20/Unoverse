const { io } = require("socket.io-client");

const socket1 = io("http://localhost:3001");
const socket2 = io("http://localhost:3001");

let roomCode = "";

socket1.on("connect", () => {
  socket1.emit("create-room", { name: "Player 1" });
});

socket1.on("joined-successfully", ({ room }) => {
  roomCode = room.code;
  socket2.emit("join-room", { code: roomCode, name: "Player 2" });
});

socket2.on("joined-successfully", () => {
  socket1.emit("start-game");
});

socket1.on("game-updated", (payload) => {
  console.log("Player 1 Payload hands keys:", Object.keys(payload.hands));
  console.log("Player 1 Seat 1 hand length:", payload.hands[1]?.length);
  console.log("Player 1 Seat 2 hand length:", payload.hands[2]?.length);
});

socket2.on("game-updated", (payload) => {
  console.log("Player 2 Payload hands keys:", Object.keys(payload.hands));
  console.log("Player 2 Seat 1 hand length:", payload.hands[1]?.length);
  console.log("Player 2 Seat 2 hand length:", payload.hands[2]?.length);
  setTimeout(() => process.exit(0), 500);
});
