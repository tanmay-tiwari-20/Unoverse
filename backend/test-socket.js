const { io } = require("socket.io-client");
const socket = io("http://localhost:3001");

socket.on("connect", () => {
  console.log("Connected to server");
  socket.emit("create-room", { name: "Bot" });
});

socket.on("joined-successfully", ({ room }) => {
  console.log("Joined room:", room.code);
  socket.emit("start-game");
});

socket.on("game-started", () => {
  console.log("Game started");
});

socket.on("game-updated", (state) => {
  console.log("Game Updated! Discard Pile:");
  console.log(JSON.stringify(state.discardPile, null, 2));
  process.exit(0);
});

socket.on("error", (err) => {
  console.error("Error:", err);
  process.exit(1);
});
