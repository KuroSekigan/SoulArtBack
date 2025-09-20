import admin from "firebase-admin";
import serviceAccount from "./soulart-599bf-firebase-adminsdk-fbsvc-644beedef3.json" assert { type: "json" };

// Inicializar Firebase Admin con la clave privada
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

export default admin;
