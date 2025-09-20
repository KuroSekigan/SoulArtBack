import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

// Inicializar Firebase Admin con la clave privada
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

export default admin;
