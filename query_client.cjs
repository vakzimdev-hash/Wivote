const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const config = require("./firebase-applet-config.json");

const app = initializeApp({
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  appId: config.appId
});
const db = getFirestore(app, config.firestoreDatabaseId || undefined);

async function run() {
  try {
    const wsSnap = await getDocs(collection(db, "workspaces"));
    console.log("Workspaces count:", wsSnap.size);
    for (const wsDoc of wsSnap.docs) {
      console.log(`\n=================== Workspace: ${wsDoc.id} (${wsDoc.data().name}) ===================`);
      
      // legacy_devices
      try {
        const ldSnap = await getDocs(collection(db, "workspaces", wsDoc.id, "legacy_devices"));
        console.log(`legacy_devices count: ${ldSnap.size}`);
        ldSnap.docs.forEach(d => {
          console.log("  LD:", d.id, JSON.stringify(d.data(), null, 2));
        });
      } catch (e) {
        console.error("  Error legacy_devices:", e.message);
      }

      // legacyDevices
      try {
        const ldSnap2 = await getDocs(collection(db, "workspaces", wsDoc.id, "legacyDevices"));
        if (ldSnap2.size > 0) {
          console.log(`legacyDevices count: ${ldSnap2.size}`);
          ldSnap2.docs.forEach(d => {
            console.log("  LD2:", d.id, JSON.stringify(d.data(), null, 2));
          });
        }
      } catch (e) {
        // ignore
      }

      // vouchers
      try {
        const vSnap = await getDocs(collection(db, "workspaces", wsDoc.id, "vouchers"));
        let soldVouchers = [];
        vSnap.docs.forEach(d => {
          const v = d.data();
          if (v.status === "Sold") {
            soldVouchers.push({ id: d.id, code: v.code, plan: v.plan, price: v.price, agentName: v.assignedAgentName, agentId: v.assignedAgentId, soldAt: v.soldAt, customerName: v.customerName, customerCell: v.customerCell });
          }
        });
        console.log(`Total vouchers: ${vSnap.size}, Total Sold vouchers: ${soldVouchers.length}`);
        console.log("Sold vouchers:", JSON.stringify(soldVouchers, null, 2));
      } catch (e) {
        console.error("  Error vouchers:", e.message);
      }

      // users
      try {
        const uSnap = await getDocs(collection(db, "workspaces", wsDoc.id, "users"));
        console.log(`Users count: ${uSnap.size}`);
        uSnap.docs.forEach(d => {
          console.log("  User:", d.id, JSON.stringify(d.data()));
        });
      } catch (e) {
        console.error("  Error users:", e.message);
      }

      // cash drops
      try {
        const cdSnap = await getDocs(collection(db, "workspaces", wsDoc.id, "cash_drops"));
        console.log(`Cash drops count: ${cdSnap.size}`);
        cdSnap.docs.forEach(d => {
          console.log("  CD:", d.id, JSON.stringify(d.data()));
        });
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    console.error("Fatal:", err);
  } finally {
    process.exit(0);
  }
}
run();
