firebase.initializeApp({
  databaseURL: "https://app-chat-c8721-default-rtdb.asia-southeast1.firebasedatabase.app/"
});
const db = firebase.database();

let roomId, roomName, userName;
let localStream = null;
let peers = {};

const lobby = document.getElementById("lobby");
const roomUI = document.getElementById("room");
const chat = document.getElementById("chat");
const toast = document.getElementById("toast");
const micBtn = document.getElementById("micBtn");

function notify(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

// ===== ROOM LIST =====
db.ref("rooms").on("value", snap => {
  const list = document.getElementById("roomList");
  list.innerHTML = "";
  const rooms = snap.val() || {};
  for (let id in rooms) {
    const li = document.createElement("li");
    li.textContent = rooms[id].name;
    li.onclick = () => joinRoom(id);
    list.appendChild(li);
  }
});

// ===== CREATE =====
createBtn.onclick = async () => {
  userName = nameInput.value.trim();
  roomName = roomNameInput.value.trim();
  roomId = Math.random().toString(36).slice(2, 8);

  await db.ref(`rooms/${roomId}`).set({
    name: roomName,
    pass: roomPassInput.value,
    created: Date.now(),
    users: {}
  });

  joinRoom(roomId, true);
};

// ===== JOIN =====
async function joinRoom(id, creator = false) {
  const snap = await db.ref(`rooms/${id}`).get();
  if (!snap.exists()) return;

  const room = snap.val();
  roomId = id;
  roomName = room.name;

  if (!creator) {
    const pass = prompt("Room password?");
    if (pass !== room.pass) return alert("Wrong password");
    userName = prompt("Your name?");
  }

  await db.ref(`rooms/${roomId}/users/${userName}`).set(true);

  lobby.classList.add("hidden");
  roomUI.classList.remove("hidden");
  notify(`You have joined "${roomName}" room`);

  await startMic();
  setupSignaling();
  listenChat();
}

// ===== CHAT =====
sendBtn.onclick = () => {
  const msg = msgInput.value.trim();
  if (!msg) return;
  msgInput.value = "";
  db.ref(`rooms/${roomId}/chat`).push({ user: userName, text: msg });
};

function listenChat() {
  db.ref(`rooms/${roomId}/chat`).on("child_added", s => {
    const m = s.val();
    chat.innerHTML += `<p><b>${m.user}:</b> ${m.text}</p>`;
    chat.scrollTop = chat.scrollHeight;
  });
}

// ===== MIC =====
async function startMic() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
}

micBtn.onclick = () => {
  const track = localStream.getTracks()[0];
  track.enabled = !track.enabled;
  micBtn.classList.toggle("on", track.enabled);
};

// ===== WEBRTC =====
function setupSignaling() {
  db.ref(`rooms/${roomId}/users`).on("value", snap => {
    const users = snap.val() || {};
    for (let other in users) {
      if (other !== userName && !peers[other]) createPeer(other, true);
    }
  });

  db.ref(`signals/${roomId}`).on("child_added", async snap => {
    const { from, type, data } = snap.val();
    if (from === userName) return;

    if (!peers[from]) createPeer(from, false);

    const pc = peers[from];

    if (type === "offer") {
      await pc.setRemoteDescription(data);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(from, "answer", answer);
    }

    if (type === "answer") {
      await pc.setRemoteDescription(data);
    }

    if (type === "ice") {
      pc.addIceCandidate(data);
    }
  });
}

function createPeer(other, makeOffer) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = e => {
    if (e.candidate) sendSignal(other, "ice", e.candidate);
  };

  pc.ontrack = e => {
    const a = document.createElement("audio");
    a.srcObject = e.streams[0];
    a.autoplay = true;
  };

  peers[other] = pc;
  if (makeOffer) makeOfferTo(other);
}

async function makeOfferTo(other) {
  const pc = peers[other];
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal(other, "offer", offer);
}

function sendSignal(to, type, data) {
  db.ref(`signals/${roomId}`).push({ from: userName, to, type, data });
}

// ===== LEAVE =====
leaveBtn.onclick = async () => {
  Object.values(peers).forEach(p => p.close());
  peers = {};
  localStream.getTracks().forEach(t => t.stop());

  await db.ref(`rooms/${roomId}/users/${userName}`).remove();

  lobby.classList.remove("hidden");
  roomUI.classList.add("hidden");
};

// ===== CLEANUP =====
setInterval(async () => {
  const snap = await db.ref("rooms").get();
  const now = Date.now();
  for (let id in snap.val() || {}) {
    const r = snap.val()[id];
    if (!r.users || now - r.created > 30 * 60 * 1000) {
      db.ref(`rooms/${id}`).remove();
      db.ref(`signals/${id}`).remove();
    }
  }
}, 60000);
