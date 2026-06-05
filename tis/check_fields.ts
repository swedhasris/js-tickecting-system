import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, (firebaseConfig as any).firestoreDatabaseId);

async function checkFields() {
  try {
    const querySnapshot = await getDocs(collection(db, "tickets"));
    console.log(`Checking ${querySnapshot.size} tickets in Firestore:`);
    let count = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Check if number is missing
      if (!data.number) {
        count++;
        console.log(`MISSING NUMBER - ID: ${doc.id} | Title: ${data.title} | Status: ${data.status} | Fields: ${Object.keys(data).join(", ")}`);
      }
    });
    console.log(`Total tickets missing number: ${count}`);
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

checkFields();
