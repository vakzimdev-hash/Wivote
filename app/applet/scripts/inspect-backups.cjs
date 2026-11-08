const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const db = admin.firestore();
if (firebaseConfig.firestoreDatabaseId) {
  // Use specific database ID if needed, or default
}

async function run() {
  console.log("=== CHECKING FIRESTORE BACKUPS & CUSTOMERS ===");
  try {
    const wsSnap = await db.collection('workspaces').get();
    console.log(`Workspaces found: ${wsSnap.size}`);

    for (const wsDoc of wsSnap.docs) {
      const wsId = wsDoc.id;
      const wsData = wsDoc.data();
      console.log(`\nWorkspace: ${wsId} (${wsData.name})`);

      // Check customers
      const custSnap = await db.collection('workspaces').doc(wsId).collection('customers').get();
      console.log(`  - Customers count: ${custSnap.size}`);
      custSnap.docs.forEach(d => {
        if (d.id === '__deleted_names__') {
          console.log(`    * Tombstone __deleted_names__:`, d.data());
        } else {
          const c = d.data();
          console.log(`    * Customer ${d.id}: ${c.name} (${c.cellNumber || 'No cell'})`);
        }
      });

      // Check workspace backups
      const bkpSnap = await db.collection('workspaces').doc(wsId).collection('workspace_backups').get();
      console.log(`  - Workspace Backups count: ${bkpSnap.size}`);
      bkpSnap.docs.forEach(d => {
        const b = d.data();
        console.log(`    * Backup ${d.id}: "${b.triggerEvent}" at ${b.createdAt} (Customers count: ${b.summary?.customersCount || b.snapshot?.customers?.length || 0})`);
      });
    }

    // Check root customers collection
    const rootCustSnap = await db.collection('customers').get();
    console.log(`\nRoot customers count: ${rootCustSnap.size}`);
    rootCustSnap.docs.forEach(d => {
      const c = d.data();
      console.log(`  * Root Customer ${d.id}: ${c.name} (${c.cellNumber || 'No cell'})`);
    });

    // Check root system backups
    const sysBkpSnap = await db.collection('saas_config').doc('system_backups').collection('snapshots').get();
    console.log(`\nSystem Snapshots count: ${sysBkpSnap.size}`);
    sysBkpSnap.docs.forEach(d => {
      const b = d.data();
      console.log(`  * System Snapshot ${d.id}: "${b.triggerEvent}" at ${b.createdAt} (Customers count: ${b.summary?.customersCount || b.snapshot?.customers?.length || 0})`);
    });

  } catch (err) {
    console.error("Error inspecting Firestore:", err);
  }
}

run();
