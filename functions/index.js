const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// Cette fonction tourne automatiquement toutes les 1 minutes
exports.cleanupDeadRooms = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    
    const now = Date.now();
    // On supprime tout ce qui n'a pas bougé depuis 2 minutes
    const cutoff = now - (2 * 60 * 1000); 
    const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoff);

    // 1. Chercher les salles "mortes" (lastActive < il y a 2 min)
    const snapshot = await db.collection('rooms')
        .where('lastActive', '<', cutoffTimestamp)
        .get();

    if (snapshot.empty) {
        return null;
    }

    // 2. Supprimer en masse (Batch)
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        
        // Optionnel : Supprimer aussi les sous-collections (messages/candidats)
        // Note : Firestore ne supprime pas récursivement par défaut, 
        // mais pour un MVP, supprimer le document parent suffit à le cacher.
    });

    await batch.commit();
    console.log(`Nettoyage terminé : ${snapshot.size} salles supprimées.`);
    return null;
});