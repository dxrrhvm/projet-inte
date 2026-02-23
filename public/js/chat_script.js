const firebaseConfig = {
  apiKey: "AIzaSyBkpMTOrHP8G_chHaGs15DMXqQHmjjnekw",
  authDomain: "projetfinal-166a0.firebaseapp.com",
  projectId: "projetfinal-166a0",
  storageBucket: "projetfinal-166a0.firebasestorage.app",
  messagingSenderId: "131861956577",
  appId: "1:131861956577:web:cc4bb9712a934d312f34a0",
  measurementId: "G-ZXJ1F0QZPJ"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomId = null;
let role = null;
let heartbeatInterval = null;
let unsubscribeChat = null;
let unsubscribeRoom = null;
let unsubscribeCandidates = null;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('strangerVideo');
const chatLog = document.querySelector('.chat-log');
const chatInput = document.querySelector('.chat-input');
const sendBtn = document.getElementById('send-btn-real');
const stopBtn = document.getElementById('stop-btn-real');
const quitBtn = document.getElementById('quit-btn');

if (!localStream) {
    init();
}

async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        localVideo.onloadedmetadata = () => { localVideo.play(); };
        
        chatLog.innerHTML = '';
        
        await findStranger();
    } catch (err) {
        alert("Erreur caméra : " + err.message);
        window.location.href = "index.html";
    }
}

async function findStranger() {
    chatLog.innerHTML = '<div class="system-msg">Looking for someone you can chat with...</div>';
    
    const roomsRef = db.collection('rooms');
    const snapshot = await roomsRef.where('status', '==', 'waiting').orderBy('createdAt').limit(1).get();
    
    if (snapshot.empty) createRoom();
    else joinRoom(snapshot.docs[0].id);
}

async function createRoom() {
    role = 'caller';
    const roomRef = db.collection('rooms').doc();
    roomId = roomRef.id;

    peerConnection = new RTCPeerConnection(servers);
    setupPeerConnection();

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const roomWithOffer = {
        status: 'waiting',
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
    };
    await roomRef.set(roomWithOffer);
    startHeartbeat(roomId);

    unsubscribeRoom = roomRef.onSnapshot(async snapshot => {
        if (!snapshot.exists || (snapshot.data() && snapshot.data().status === 'disconnected')) {
            if (peerConnection && peerConnection.iceConnectionState !== 'closed') {
                addSystemMessage("Stranger skipped.");
                nextStranger();
            }
            return;
        }

        // Cas 2: Réponse (Answer) reçue
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data && data.answer) {
            const answer = new RTCSessionDescription(data.answer);
            await peerConnection.setRemoteDescription(answer);
            // On ne met le message que si on n'a pas déjà connecté
            addSystemMessage("Stranger connected!");
        }
    });

    listenToICECandidates(roomRef, 'calleeCandidates');
    listenToChat(roomRef);
}

async function joinRoom(id) {
    role = 'callee';
    roomId = id;

    const roomRef = db.collection('rooms').doc(roomId);
    
    // On essaie de rejoindre. Si ça échoue (concurrence), on retente findStranger
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(roomRef);
            if (!doc.exists || doc.data().status !== 'waiting') {
                throw "Room already taken";
            }
            transaction.update(roomRef, { status: 'busy', lastActive: firebase.firestore.FieldValue.serverTimestamp() });
        });
    } catch (e) {
        console.log("Room busy, retrying...");
        return findStranger(); // Réessayer une autre salle
    }

    addSystemMessage("Stranger connected!");
    startHeartbeat(roomId);

    peerConnection = new RTCPeerConnection(servers);
    setupPeerConnection();

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    const roomSnapshot = await roomRef.get();
    const offer = roomSnapshot.data().offer;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await roomRef.update({
        answer: { type: answer.type, sdp: answer.sdp },
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
    });

    unsubscribeRoom = roomRef.onSnapshot(async snapshot => {
        if (!snapshot.exists || (snapshot.data() && snapshot.data().status === 'disconnected')) {
            if (peerConnection && peerConnection.iceConnectionState !== 'closed') {
                addSystemMessage("Stranger skipped.");
                nextStranger();
            }
        }
    });

    listenToICECandidates(roomRef, 'callerCandidates');
    listenToChat(roomRef);
}

// --- FONCTIONS COMMUNES ---

function setupPeerConnection() {
    peerConnection.oniceconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
            if (peerConnection) nextStranger();
        }
    };
    registerPeerConnectionListeners();
}

// --- SKIP ---
async function nextStranger() {
    showGrayScreen();
    
    // Signaler départ
    if (roomId) {
        try { await db.collection('rooms').doc(roomId).update({ status: 'disconnected' }); } catch(e) {}
    }

    cleanupConnections();
    
    // IMPORTANT : On ne met pas de message ici car findStranger le fera
    chatInput.value = '';
    
    await findStranger();
}

function cleanupConnections() {
    if (peerConnection) {
        peerConnection.oniceconnectionstatechange = null; // Stop écoute
        peerConnection.close();
        peerConnection = null;
    }
    
    if (unsubscribeChat) unsubscribeChat();
    if (unsubscribeRoom) unsubscribeRoom();
    if (unsubscribeCandidates) unsubscribeCandidates();
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    if (roomId) {
        const idToDelete = roomId;
        roomId = null;
        setTimeout(() => { db.collection('rooms').doc(idToDelete).delete().catch(e => {}); }, 2000);
    }
}

// --- UTILS ---
function showGrayScreen() {
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.style.display = "none";
        if (remoteVideo.parentElement) remoteVideo.parentElement.style.backgroundColor = "#dddddd";
    }
}

function registerPeerConnectionListeners() {
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            const col = role === 'caller' ? 'callerCandidates' : 'calleeCandidates';
            db.collection('rooms').doc(roomId).collection(col).add(event.candidate.toJSON());
        }
    };
    peerConnection.ontrack = event => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
        remoteVideo.style.display = "block";
        if (remoteVideo.parentElement) remoteVideo.parentElement.style.backgroundColor = "black";
    };
}

function listenToICECandidates(roomRef, col) {
    unsubscribeCandidates = roomRef.collection(col).onSnapshot(s => {
        s.docChanges().forEach(async c => {
            if (c.type === 'added') await peerConnection.addIceCandidate(new RTCIceCandidate(c.doc.data()));
        });
    });
}

function listenToChat(roomRef) {
    unsubscribeChat = roomRef.collection('messages').orderBy('createdAt').onSnapshot(s => {
        s.docChanges().forEach(c => {
            if (c.type === 'added') {
                const msg = c.doc.data();
                if (msg.sender !== role) displayMessage("Stranger", msg.text);
            }
        });
    });
}

async function sendMessage() {
    const text = chatInput.value;
    if (!text.trim() || !roomId) return;
    displayMessage("You", text);
    chatInput.value = '';
    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text, sender: role, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function updateLastActive(id) {
    if(id) db.collection('rooms').doc(id).update({lastActive: firebase.firestore.FieldValue.serverTimestamp()}).catch(e=>{});
}

function startHeartbeat(id) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => updateLastActive(id), 60000);
}

function displayMessage(sender, text) {
    const div = document.createElement('div');
    div.innerHTML = `<span class="${sender === "You" ? "you-label" : "stranger-label"}">${sender}:</span> ${text}`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function addSystemMessage(text) {
    // Petit filtre pour éviter les doublons consécutifs identiques
    if (chatLog.lastChild && chatLog.lastChild.innerText === text) return;

    const div = document.createElement('div');
    div.className = "system-msg";
    div.innerText = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

// --- EVENTS ---
sendBtn.addEventListener('click', sendMessage);
stopBtn.addEventListener('click', nextStranger);
quitBtn.addEventListener('click', () => {
    if (roomId) db.collection('rooms').doc(roomId).update({ status: 'disconnected' }).catch(e=>{});
    cleanupConnections();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    window.location.href = "index.html";
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') nextStranger(); });
window.addEventListener('beforeunload', async () => { if (roomId) await db.collection('rooms').doc(roomId).update({ status: 'disconnected' }); });