import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES module fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔑 Load JSON manually (NO assert, NO error)
const serviceAccountPath = path.join(__dirname, "firebaseAdmin.json");
const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf-8")
);

// 🔥 Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
