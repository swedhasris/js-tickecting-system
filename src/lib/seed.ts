import { firebaseAvailable, db } from "./firebase";
import { collection, getDocs, addDoc, query, limit, setDoc, doc } from "firebase/firestore";

export async function seedInitialData() {
  // Performance: Skip if already seeded in this browser session
  const SEED_KEY = "connectit_seed_done_v1";
  if (localStorage.getItem(SEED_KEY)) {
    return;
  }

  // Skip seeding if Firebase is not configured
  if (!firebaseAvailable) {
    console.log("[Seed] Firebase not available — skipping Firestore seed.");
    localStorage.setItem(SEED_KEY, "1");
    return;
  }

  try {
    const slaRef = collection(db, "sla_policies");
    const snapshot = await getDocs(query(slaRef, limit(1)));
    
    if (snapshot.empty) {
      console.log("Seeding initial SLA policies...");
      const policies = [
        { name: "P1 - Critical", priority: "1 - Critical", responseTimeHours: 1, resolutionTimeHours: 4, isActive: true },
        { name: "P2 - High", priority: "2 - High", responseTimeHours: 2, resolutionTimeHours: 8, isActive: true },
        { name: "P3 - Moderate", priority: "3 - Moderate", responseTimeHours: 4, resolutionTimeHours: 24, isActive: true },
        { name: "P4 - Low", priority: "4 - Low", responseTimeHours: 8, resolutionTimeHours: 48, isActive: true },
        { name: "Standard Inquiry", priority: "4 - Low", category: "Inquiry / Help", responseTimeHours: 12, resolutionTimeHours: 72, isActive: true }
      ];
      
      for (const p of policies) {
        await addDoc(slaRef, p);
      }
      console.log("SLA policies seeded successfully.");
    }

    // Seed some initial dashboards if needed
    const dashRef = collection(db, "dashboards");
    const dashSnap = await getDocs(query(dashRef, limit(1)));
    if (dashSnap.empty) {
       console.log("Seeding initial dashboards data...");
       const dashboards = [
         { name: "Incident Management", description: "Standard incident tracking", active: true, views: 0 },
         { name: "Asset Overview", description: "IT Asset list", active: true, views: 0 }
       ];
       for (const d of dashboards) {
         await addDoc(dashRef, d);
       }
    }

    const categoryRef = collection(db, "settings_categories");
    const categorySnap = await getDocs(query(categoryRef, limit(1)));
    if (categorySnap.empty) {
      console.log("Seeding service catalog...");

      const categoryDoc = doc(categoryRef);
      await setDoc(categoryDoc, {
        name: "IT Support",
        isActive: true,
        createdAt: new Date().toISOString()
      });

      const networkSubcategoryDoc = doc(collection(db, "settings_subcategories"));
      const accessSubcategoryDoc = doc(collection(db, "settings_subcategories"));

      await setDoc(networkSubcategoryDoc, {
        name: "Network Support",
        categoryId: categoryDoc.id,
        categoryName: "IT Support",
        isActive: true,
        createdAt: new Date().toISOString()
      });

      await setDoc(accessSubcategoryDoc, {
        name: "Access Management",
        categoryId: categoryDoc.id,
        categoryName: "IT Support",
        isActive: true,
        createdAt: new Date().toISOString()
      });

      const wanServiceDoc = doc(collection(db, "settings_services"));
      const identityServiceDoc = doc(collection(db, "settings_services"));

      await setDoc(wanServiceDoc, {
        name: "WAN Connectivity",
        providerName: "Airtel",
        categoryId: categoryDoc.id,
        categoryName: "IT Support",
        subcategoryId: networkSubcategoryDoc.id,
        subcategoryName: "Network Support",
        isActive: true,
        createdAt: new Date().toISOString()
      });

      await setDoc(identityServiceDoc, {
        name: "Identity Access",
        providerName: "Internal IT",
        categoryId: categoryDoc.id,
        categoryName: "IT Support",
        subcategoryId: accessSubcategoryDoc.id,
        subcategoryName: "Access Management",
        isActive: true,
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, "settings_groups"), {
        name: "Network Team",
        members: ["Arun", "Divya", "Karan"],
        categoryIds: [categoryDoc.id],
        subcategoryIds: [networkSubcategoryDoc.id],
        serviceIds: [wanServiceDoc.id],
        isActive: true,
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, "settings_groups"), {
        name: "Access Team",
        members: ["Monika", "Rahul"],
        categoryIds: [categoryDoc.id],
        subcategoryIds: [accessSubcategoryDoc.id],
        serviceIds: [identityServiceDoc.id],
        isActive: true,
        createdAt: new Date().toISOString()
      });
    }

  } catch (error) {
    console.warn("Seeding skipped or failed:", error);
  }

  // Mark as seeded regardless of outcome to prevent repeated attempts
  localStorage.setItem(SEED_KEY, "1");
}
