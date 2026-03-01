const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

exports.cleanupDeadRooms = onSchedule("every 1 minutes", async (event) => {
    
    const now = Date.now();
    const cutoff = now - (2 * 60 * 1000); 
    const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoff);

    const batch = db.batch();
    let deletedCount = 0;

    const videoSnapshot = await db.collection('rooms')
        .where('lastActive', '<', cutoffTimestamp)
        .get();

    videoSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
    });

    const textSnapshot = await db.collection('text_rooms')
        .where('lastActive', '<', cutoffTimestamp)
        .get();

    textSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
    });

    if (deletedCount > 0) {
        await batch.commit();
        console.log(`Nettoyage terminé : ${deletedCount} salles supprimées (Vidéo et Texte).`);
    } else {
        console.log("Aucune salle morte trouvée.");
    }
});