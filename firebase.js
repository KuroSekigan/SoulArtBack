import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    // 🔑 Aquí importante: reemplazamos los "\n" de la private key
    privateKey: serviceAccount.private_key.replace(/\\n/g, '\n')
  })
});

export default admin;