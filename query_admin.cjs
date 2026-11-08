const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const config = require("./firebase-applet-config.json");

try {
  initializeApp({
    projectId: config.projectId
  });
  const db = getFirestore(config.firestoreDatabaseId || undefined);
  
  async function test() {
    console.log("Querying workspaces with admin SDK...");
    const snap = await db.collection("workspaces").get();
    console.log("Workspaces count:", snap.size);
    for (const doc of snap.docs) {
      console.log("\n=== WS:", doc.id, doc.data().name, "===");
      const ldSnap = await db.collection("workspaces").doc(doc.id).collection("legacy_devices").get();
      console.log(`  legacy_devices (${ldSnap.size}):`);
      ldSnap.docs.forEach(d => {
        console.log("   ", d.id, JSON.stringify(d.data()));
      });
      const ldSnap2 = await db.collection("workspaces").doc(doc.id).collection("legacyDevices").get();
      console.log(`  legacyDevices (${ldSnap2.size}):`);
      ldSnap2.docs.forEach(d => {
        console.log("   ", d.id, JSON.stringify(d.data()));
      });
      const vSnap = await db.collection("workspaces").doc(doc.id).collection("vouchers").get();
      let histecVouchers = [];
      vSnap.docs.forEach(d => {
        const v = d.data();
        const n = (v.assignedAgentName || "").toLowerCase();
        const id = (v.assignedAgentId || "").toLowerCase();
        if (n.includes("histec") || id.includes("histec")) {
          histecVouchers.push({ id: d.id, code: v.code, plan: v.plan, price: v.price, status: v.status, soldAt: v.soldAt });
        }
      });
      console.log(`  Histec vouchers count (${histecVouchers.length}):`, JSON.stringify(histecVouchers, null, 2));

      const uSnap = await db.collection("workspaces").doc(doc.id).collection("users").get();
      uSnap.docs.forEach(d => {
        const u = d.data();
        if ((u.name || "").toLowerCase().includes("histec") || d.id.includes("histec")) {
          console.log("  Histec user:", d.id, JSON.stringify(u));
        }
      });
    }
  }
  test().then(() => process.exit(0)).catch(e => {
    console.error("Admin query error:", e);
    process.exit(1);
  });
} catch (e) {
  console.error("Init error:", e);
  process.exit(1);
}
