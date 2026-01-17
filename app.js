// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  databaseURL: "https://app-chat-c8721-default-rtdb.asia-southeast1.firebasedatabase.app/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ===== DOM ELEMENTS =====
const createRoomName = document.getElementById("createRoomName");
const createRoomPassword = document.getElementById("createRoomPassword");
const createUserName = document.getElementById("createUserName");
const createBtn = document.getElementById("createBtn");

const roomsList = document.getElementById("roomsList");
const notificationDiv = document.getElementById("notification");

const chatSection = document.getElementById("chatSection");
const roomTitle = document.getElementById("roomTitle");
const chatDiv = document.getElementById("chat");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");

// ===== GLOBALS =====
let currentRoomId = null;
let currentUserName = null;
let localStream = null;
let micOn = false;

// ===== UTILS =====
function showNotification(msg) {
  notificationDiv.textContent = msg;
  notificationDiv.classList.remove("hidden");
  notificationDiv.style.opacity = 1;
  setTimeout(() => {
    notificationDiv.style.opacity = 0;
    setTimeout(() => notificationDiv.classList.add("hidden"), 500);
  }, 3000);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 10);
}

function log(msg) {
  const p = document.createElement("p");
  p.textContent = msg;
  chatDiv.appendChild(p);
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

// ===== CREATE ROOM =====
createBtn.onclick = async () => {
  const name = createRoomName.value.trim();
  const password = createRoomPassword.value.trim();
  const userName = createUserName.value.trim();
  if (!name || !password || !userName) return alert("All fields required");

  const roomId = generateRoomId();
  currentRoomId = roomId;
  currentUserName = userName;

  await db.ref("rooms/" + roomId).set({
    name,
    password,
    createdAt: Date.now(),
    users: { [userName]: { joinedAt: Date.now() } },
    messages: {}
  });

  showNotification(`You have joined "${name}" Room`);
  roomTitle.textContent = name;
  chatSection.classList.remove("hidden");

  listenToMessages(roomId);

  // Open a new tab with the same page for “full room experience”
  window.open(window.location.href + `?room=${roomId}&name=${userName}`, "_blank");

  // Clear inputs
  createRoomName.value = "";
  createRoomPassword.value = "";
  createUserName.value = "";
};

// ===== LIST ACTIVE ROOMS =====
async function updateRoomsList() {
  const snapshot = await db.ref("rooms").get();
  roomsList.innerHTML = "";
  const rooms = snapshot.val() || {};
  for (const roomId in rooms) {
    const li = document.createElement("li");
    li.textContent = rooms[roomId].name;
    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Join";
    joinBtn.onclick = () => joinRoom(roomId);
    li.appendChild(joinBtn);
    roomsList.appendChild(li);
  }
}
setInterval(updateRoomsList, 2000);

// ===== JOIN ROOM =====
async function joinRoom(roomId) {
  const roomSnap = await db.ref("rooms/" + roomId).get();
  const room = roomSnap.val();
  if (!room) return alert("Room not found");

  const password = prompt("Enter room password:");
  if (password !== room.password) return alert("Wrong password");

  const userName = prompt("Enter your name:");
  if (!userName) return alert("Name required");

  currentRoomId = roomId;
  currentUserName = userName;

  await db.ref(`rooms/${roomId}/users/${userName}`).set({ joinedAt: Date.now() });

  showNotification(`You have joined "${room.name}" Room`);
  roomTitle.textContent = room.name;
  chatSection.classList.remove("hidden");

  listenToMessages(roomId);

  // Open new tab for full room experience
  window.open(window.location.href + `?room=${roomId}&name=${userName}`, "_blank");
}

// ===== MESSAGING =====
sendBtn.onclick = async () => {
  const msg = messageInput.value.trim();
  if (!msg || !currentRoomId || !currentUserName) return;
  messageInput.value = "";
  await db.ref(`rooms/${currentRoomId}/messages/${Date.now()}`).set({
    user: currentUserName,
    text: msg
  });
};

function listenToMessages(roomId) {
  db.ref(`rooms/${roomId}/messages`).off();
  db.ref(`rooms/${roomId}/messages`).on("child_added", snapshot => {
    const { user, text } = snapshot.val();
    log(`${user}: ${text}`);
  });
}

// ===== MIC =====
micBtn.onclick = async () => {
  if (!micOn) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micBtn.textContent = "🎙️ On";
    micOn = true;
  } else {
    localStream.getTracks().forEach(track => track.stop());
    micBtn.textContent = "🎤";
    micOn = false;
  }
};

// ===== LOAD FROM URL PARAMS =====
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  const nameParam = params.get("name");
  if (roomParam && nameParam) {
    currentRoomId = roomParam;
    currentUserName = nameParam;
    db.ref(`rooms/${currentRoomId}/name`).get().then(snap => {
      roomTitle.textContent = snap.val() || "Chat Room";
    });
    chatSection.classList.remove("hidden");
    showNotification(`You have joined "${roomTitle.textContent}" Room`);
    listenToMessages(currentRoomId);
  }
});
