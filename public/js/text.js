const firebaseConfig = {
    apiKey: "AIzaSyBkpMTOrHP8G_chHaGs15DMXqQHmjjnekw",
    authDomain: "projetfinal-166a0.firebaseapp.com",
    projectId: "projetfinal-166a0",
    storageBucket: "projetfinal-166a0.firebasestorage.app",
    messagingSenderId: "131861956577",
    appId: "1:131861956577:web:cc4bb9712a934d312f34a0",
    measurementId: "G-ZXJ1F0QZPJ"
};

// --- USER ID ---
let myUserId = localStorage.getItem('vibe_uid');
if (!myUserId) {
    myUserId = crypto.randomUUID(); 
    localStorage.setItem('vibe_uid', myUserId);
}

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Variables globales (Pas de WebRTC ici !)
let roomId = null;
let role = null;
let heartbeatInterval = null;
let unsubscribeChat = null;
let unsubscribeRoom = null;

// --- GESTION DES TAGS ---
const urlParams = new URLSearchParams(window.location.search);
const rawTags = urlParams.get('tags') || '';
const myTags = rawTags.split(/[\s,]+/).filter(t => t.trim().length > 0).map(t => t.toLowerCase()).slice(0, 10);
let hasDisplayedMatchedTag = false;

// UI Elements
const chatLog = document.querySelector('.chat-log');
const chatInput = document.querySelector('.chat-input');
const sendBtn = document.getElementById('send-btn-real');
const stopBtn = document.getElementById('stop-btn-real');
const quitBtn = document.getElementById('quit-btn');

// Initialisation au chargement
init();

async function init() {
    chatLog.innerHTML = '';
    await findStranger();
}

async function findStranger() {
    chatLog.innerHTML = '<div class="system-msg">Looking for someone you can chat with...</div>';
    hasDisplayedMatchedTag = false; 
    
    // ATTENTION : On utilise 'text_rooms' pour ne pas se mélanger avec la vidéo !
    const roomsRef = db.collection('text_rooms');
    let validRoomId = null;
    let commonTag = null;

    if (myTags.length > 0) {
        const snapshotTags = await roomsRef.where('status', '==', 'waiting')
                                         .where('tags', 'array-contains-any', myTags)
                                         .orderBy('createdAt').limit(5).get();
        
        if (!snapshotTags.empty) {
            for (let doc of snapshotTags.docs) {
                const roomData = doc.data();
                if (roomData.callerId && roomData.callerId !== myUserId) {
                    validRoomId = doc.id;
                    if (roomData.tags && roomData.tags.length > 0) {
                        const intersection = myTags.filter(t => roomData.tags.includes(t));
                        if (intersection.length > 0) commonTag = intersection[0];
                    }
                    break;
                }
            }
        }
    }

    if (!validRoomId) {
        const snapshotAny = await roomsRef.where('status', '==', 'waiting')
                                        .orderBy('createdAt').limit(5).get();
        
        if (!snapshotAny.empty) {
            for (let doc of snapshotAny.docs) {
                const roomData = doc.data();
                if (roomData.callerId && roomData.callerId !== myUserId) {
                    validRoomId = doc.id;
                    commonTag = null; 
                    break;
                }
            }
        }
    }
    
    if (validRoomId) {
        joinRoom(validRoomId, commonTag); 
    } else {
        createRoom();
    }
}

async function createRoom() {
    role = 'caller';
    const roomRef = db.collection('text_rooms').doc();
    roomId = roomRef.id;

    const roomData = {
        status: 'waiting',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        tags: myTags,
        hasTags: myTags.length > 0,
        matchedTag: null,
        callerId: myUserId 
    };
    
    await roomRef.set(roomData);
    startHeartbeat(roomId);

    // On écoute le changement de statut pour savoir si quelqu'un rejoint
    unsubscribeRoom = roomRef.onSnapshot(snapshot => {
        if (!snapshot.exists || (snapshot.data() && snapshot.data().status === 'disconnected')) {
            addSystemMessage("Stranger disconnected.");
            nextStranger();
            return;
        }

        const data = snapshot.data();
        
        // Si le statut passe à 'busy', ça veut dire que l'inconnu a rejoint !
        if (data.status === 'busy' && !hasDisplayedMatchedTag) {
            addSystemMessage("Stranger connected!");
            if (data.matchedTag) {
                addSystemMessage(`You both like ${data.matchedTag}!`);
            }
            hasDisplayedMatchedTag = true;
        }
    });

    listenToChat(roomRef);
}

async function joinRoom(id, commonTag = null) {
    role = 'callee';
    roomId = id;

    const roomRef = db.collection('text_rooms').doc(roomId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(roomRef);
            if (!doc.exists || doc.data().status !== 'waiting') {
                throw "Room already taken";
            }
            
            transaction.update(roomRef, { 
                status: 'busy', 
                lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                matchedTag: commonTag 
            });
        });
    } catch (e) {
        console.log("Room busy, retrying...");
        return findStranger(); 
    }

    addSystemMessage("Stranger connected!");
    if (commonTag && !hasDisplayedMatchedTag) {
        addSystemMessage(`You both like ${commonTag}!`);
        hasDisplayedMatchedTag = true;
    }

    startHeartbeat(roomId);

    unsubscribeRoom = roomRef.onSnapshot(snapshot => {
        if (!snapshot.exists || (snapshot.data() && snapshot.data().status === 'disconnected')) {
            addSystemMessage("Stranger disconnected.");
            nextStranger();
        }
    });

    listenToChat(roomRef);
}

// --- SKIP & UTILS ---
async function nextStranger() {
    if (roomId) {
        try { await db.collection('text_rooms').doc(roomId).update({ status: 'disconnected' }); } catch (e) { }
    }
    cleanupConnections();
    chatInput.value = '';
    await findStranger();
}

function cleanupConnections() {
    if (unsubscribeChat) unsubscribeChat();
    if (unsubscribeRoom) unsubscribeRoom();
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    if (roomId) {
        const idToDelete = roomId;
        roomId = null;
        setTimeout(() => { db.collection('text_rooms').doc(idToDelete).delete().catch(e => { }); }, 2000);
    }
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
    await db.collection('text_rooms').doc(roomId).collection('messages').add({
        text: text, sender: role, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function updateLastActive(id) {
    if (id) db.collection('text_rooms').doc(id).update({ lastActive: firebase.firestore.FieldValue.serverTimestamp() }).catch(e => { });
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
    if (roomId) db.collection('text_rooms').doc(roomId).update({ status: 'disconnected' }).catch(e => { });
    cleanupConnections();
    window.location.href = "/";
});
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') nextStranger(); });
window.addEventListener('beforeunload', async () => { if (roomId) await db.collection('text_rooms').doc(roomId).update({ status: 'disconnected' }); });