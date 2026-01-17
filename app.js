import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, set, push, onValue, remove, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  databaseURL: "https://app-chat-c8721-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let room, userId, username;
let pcMap = {};
let localStream = null;

const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const joinBox = document.getElementById("joinBox");
const roomUI = document.getElementById("roomUI");
const joinedText = document.getElementById("joinedText");

document.getElementById("createBtn").onclick = () => join(true);
document.getElementById("joinBtn").onclick = () => join(false);
document.getElementById("micBtn").onclick = toggleMic;
document.getElementById("leaveBtn").onclick = leaveRoom;

function join(create) {
  username = usernameInput.value.trim();
  room = roomName.value.trim();
  const pass = roomPass.value;

  if (!username || !room || !pass) return alert("Fill everything");

  userId = crypto.randomUUID();

  const roomRef = ref(db, `rooms/${room}`);
  const userRef = ref(db, `rooms/${room}/users/${userId}`);

  if (create) {
    set(roomRef, { password: pass });
  }

  set(userRef, { name: username });
  onDisconnect(userRef).remove();

  joinBox.hidden = true;
  roomUI.hidden = false;

  joinedText.textContent = `You have joined "${room}" room`;

  watchUsers();
  watchSignals();
}

function watchUsers() {
  const usersRef = ref(db, `rooms/${room}/users`);
  onValue(usersRef, snap => {
    if (!snap.exists()) {
      remove(ref(db, `rooms/${room}`));
      return;
    }

    snap.forEach(child => {
      const id = child.key;
      if (id !== userId && !pcMap[id]) {
        createPeer(id);
      }
    });
  });
}

function createPeer(peerId) {
  const pc = new RTCPeerConnection(servers);
  pcMap[peerId] = pc;

  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }

  pc.ontrack = e => {
    const audio = document.createElement("audio");
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      push(ref(db, `signals/${room}/${peerId}`), {
        from: userId,
        candidate: e.candidate
      });
    }
  };

  pc.createOffer().then(o => {
    pc.setLocalDescription(o);
    set(ref(db, `signals/${room}/${peerId}/${userId}`), { offer: o });
  });
}

function watchSignals() {
  const sigRef = ref(db, `signals/${room}/${userId}`);
  onValue(sigRef, snap => {
    snap.forEach(child => {
      const data = child.val();
      const from = child.key;

      if (data.offer) {
        answer(from, data.offer);
      }
      if (data.answer) {
        pcMap[from]?.setRemoteDescription(data.answer);
      }
      if (data.candidate) {
        pcMap[from]?.addIceCandidate(data.candidate);
      }
    });
  });
}

function answer(from, offer) {
  const pc = new RTCPeerConnection(servers);
  pcMap[from] = pc;

  if (localStream) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }

  pc.ontrack = e => {
    const audio = document.createElement("audio");
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      push(ref(db, `signals/${room}/${from}`), {
        from: userId,
        candidate: e.candidate
      });
    }
  };

  pc.setRemoteDescription(offer).then(() =>
    pc.createAnswer().then(a => {
      pc.setLocalDescription(a);
      set(ref(db, `signals/${room}/${from}/${userId}`), { answer: a });
    })
  );
}

async function toggleMic() {
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    document.getElementById("micBtn").textContent = "Mic On";
  }
}

function leaveRoom() {
  remove(ref(db, `rooms/${room}/users/${userId}`));
  location.reload();
}
