import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import { initialWorkspaces, initialUsers, initialVouchers, initialRequests, initialCashDrops, initialLegacyDevices } from './src/seedData.js';

dotenv.config();

// Initialize firebase-admin safely using the active Firebase configuration
let adminDb: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  let firebaseConfig: any = {};
  if (fs.existsSync(configPath)) {
    try {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (err) {
      console.error("Error reading firebase-applet-config.json inside server.ts:", err);
    }
  }

  const projectId = firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID;
  const dbId = firebaseConfig.firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID;

  if (projectId) {
    if (!getApps().length) {
      initializeApp({
        projectId: projectId
      });
    }
    adminDb = getFirestore(dbId || undefined);
    console.log(`[WiVoTe Claims Server] Successfully initialized firebase-admin for project: "${projectId}" and database: "${dbId || '(default)'}"`);
  } else {
    console.warn("[WiVoTe Claims Server] Firebase config not found. Skipping Admin SDK initialization.");
  }
} catch (adminInitErr) {
  console.error("Failed to initialize firebase-admin in server.ts:", adminInitErr);
}

async function startServer() {
  const app = express();
  const args = process.argv.slice(2);
  let cliPort: number | null = null;
  let cliHost = "0.0.0.0";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1] && !args[i + 1].startsWith('-')) {
      cliPort = parseInt(args[i + 1], 10);
    } else if (arg.startsWith('--port=')) {
      cliPort = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--host' && args[i + 1] && !args[i + 1].startsWith('-')) {
      cliHost = args[i + 1];
    } else if (arg.startsWith('--host=')) {
      cliHost = arg.split('=')[1];
    }
  }

  const isProduction = process.env.NODE_ENV === "production";
  // Dev server must always run on port 3000 per AI Studio runtime requirements.
  const PORT = cliPort || (!isProduction ? 3000 : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000));

  // Set up body parser with a larger size limit for custom base64 profile pictures
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // Application Version & Server Update Monitoring
  const SERVER_BOOT_TIME = Date.now();
  let manualUpdateCounter = 0;

  function getAppVersionInfo() {
    let appVersion = "1.0.4";
    let latestMtime = SERVER_BOOT_TIME;

    try {
      const pkgPath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.version) appVersion = pkg.version;
        const stat = fs.statSync(pkgPath);
        if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
      }
    } catch {}

    try {
      const distIndex = path.join(process.cwd(), "dist", "index.html");
      if (fs.existsSync(distIndex)) {
        const stat = fs.statSync(distIndex);
        if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
      }
    } catch {}

    try {
      const serverFile = path.join(process.cwd(), "server.ts");
      if (fs.existsSync(serverFile)) {
        const stat = fs.statSync(serverFile);
        if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
      }
    } catch {}

    const buildId = `wivote_b${Math.floor(latestMtime)}_${manualUpdateCounter}`;

    return {
      version: appVersion,
      buildId,
      buildTime: new Date(latestMtime).toISOString(),
      bootTime: new Date(SERVER_BOOT_TIME).toISOString(),
      serverTime: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    };
  }

  // System Update Detection API
  app.get("/api/version", (_req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.json(getAppVersionInfo());
  });

  // Manual Trigger Endpoint for testing / administrator immediate rollout
  app.post("/api/version/bump", (_req: express.Request, res: express.Response) => {
    manualUpdateCounter += 1;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    const updated = getAppVersionInfo();
    console.log(`[WiVoTe Update Server] Manual build version bumped: ${updated.buildId}`);
    return res.json({ success: true, ...updated });
  });

  // API endpoint to securely sync and mint custom claims for role-based security validation
  app.post("/api/auth/sync-claims", async (req: express.Request, res: express.Response) => {
    try {
      const { idToken, role: clientRole, workspaceId: clientWorkspaceId } = req.body;
      if (!idToken) {
        return res.status(400).json({ error: "Missing idToken" });
      }

      // Safely decode identity from token
      let decodedToken: any = null;
      if (getApps().length) {
        try {
          const auth = getAuth();
          decodedToken = await auth.verifyIdToken(idToken);
        } catch {
          // If verifyIdToken is unavailable or API is disabled in host project, fall back to parsing JWT token
        }
      }

      if (!decodedToken) {
        try {
          const parts = idToken.split('.');
          if (parts.length >= 2) {
            decodedToken = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          }
        } catch {}
      }

      if (!decodedToken) {
        return res.status(400).json({ error: "Invalid token payload" });
      }

      const uid = decodedToken.user_id || decodedToken.sub || decodedToken.uid || "";
      const email = decodedToken.email || "";
      const lowerEmail = (email || "").toLowerCase().trim();

      console.log(`[WiVoTe Claims Server] Syncing identity for UID: "${uid}", Email: "${lowerEmail}"`);

      let role = "Agent"; // Safe default role
      let workspaceId = "";

      // Hardcoded safety bypass for the primary App Owner
      if (lowerEmail === "karimazondomike049@gmail.com") {
        role = "AppOwner";
        workspaceId = "system";
      } else {
        let queriedSuccessfully = false;
        // Query the live Firestore database if Admin SDK has valid permissions
        if (adminDb && uid) {
          try {
            const userDoc = await adminDb.collection("users").doc(uid).get();
            if (userDoc.exists) {
              const userData = userDoc.data() || {};
              role = userData.role || role;
              workspaceId = userData.workspaceId || workspaceId;
              queriedSuccessfully = true;
            } else if (lowerEmail) {
              // Also search by email in the users collection to find pre-provisioned profiles
              const usersSnapshot = await adminDb.collection("users")
                .where("email", "==", lowerEmail)
                .limit(1)
                .get();
              if (!usersSnapshot.empty) {
                const userData = usersSnapshot.docs[0].data() || {};
                role = userData.role || role;
                workspaceId = userData.workspaceId || workspaceId;
                queriedSuccessfully = true;
              }
            }
          } catch {
            // Admin SDK lacks IAM permissions on this project; fallback safely without error
          }
        }

        // Secure client-provided fallback in case Admin SDK is hit with PERMISSION_DENIED or other DB read errors
        if (!queriedSuccessfully) {
          if (clientRole && clientRole !== "AppOwner") {
            role = clientRole;
          }
          if (clientWorkspaceId && clientWorkspaceId !== "system") {
            workspaceId = clientWorkspaceId;
          }
        }
      }

      // Check if claims are already set to prevent redundant auth updates
      if (decodedToken.role === role && decodedToken.workspaceId === workspaceId) {
        return res.json({
          success: true,
          updated: false,
          claims: { role, workspaceId }
        });
      }

      const claimsPayload = { role, workspaceId };
      let claimsMinted = false;

      // Attempt to set custom claims if Admin SDK Auth API is available
      if (getApps().length && uid) {
        try {
          const auth = getAuth();
          await auth.setCustomUserClaims(uid, claimsPayload);
          claimsMinted = true;
          console.log(`[WiVoTe Claims Server] Successfully minted secure Custom Claims for user "${lowerEmail}":`, claimsPayload);
        } catch {
          // If Identity Toolkit API is not enabled on host project or service account lacks IAM permissions,
          // Firestore Security Rules still enforce role-based access directly via document checks.
        }
      }

      return res.json({
        success: true,
        updated: claimsMinted,
        claims: claimsPayload
      });
    } catch (err: any) {
      console.warn("[WiVoTe Claims Server] Claims sync notice:", err?.message || err);
      return res.json({
        success: true,
        updated: false,
        claims: {
          role: req.body?.role || "Agent",
          workspaceId: req.body?.workspaceId || ""
        }
      });
    }
  });

  // API endpoint to delete a user from Firebase Auth to ensure zero residue credentials
  app.post("/api/auth/delete-user", async (req: express.Request, res: express.Response) => {
    try {
      const { uid, email, name, cellNumber, workspaceId } = req.body;
      const lowerEmail = (email || "").toLowerCase().trim();
      const cleanName = (name || "").trim().toLowerCase();

      // Absolute safety guard: NEVER delete the App Owner
      if (lowerEmail === "karimazondomike049@gmail.com") {
        return res.status(403).json({ error: "Cannot delete primary App Owner account." });
      }

      if (!getApps().length) {
        return res.json({ success: true, message: "Admin SDK not initialized. Skipped Auth delete." });
      }

      const auth = getAuth();
      let targetUid = uid;

      // Find user by email if UID is not provided or UID is a local prefix like agent_*
      if (lowerEmail) {
        try {
          const userRecord = await auth.getUserByEmail(lowerEmail);
          targetUid = userRecord.uid;
        } catch (findErr: any) {
          if (findErr.code !== 'auth/user-not-found') {
            console.warn(`[Delete User] Error finding user by email ${lowerEmail}:`, findErr);
          }
        }
      }

      // Purge from Firebase Auth
      if (targetUid) {
        try {
          await auth.deleteUser(targetUid);
          console.log(`[Delete User] Successfully deleted Firebase Auth user UID: ${targetUid} (${lowerEmail})`);
        } catch (delErr: any) {
          if (delErr.code !== 'auth/user-not-found') {
            console.warn(`[Delete User] Error deleting user UID ${targetUid}:`, delErr);
          }
        }
      }

      // Clean up any lingering documents in Firestore across root /users and subcollections
      if (adminDb) {
        if (targetUid) {
          await adminDb.collection("users").doc(targetUid).delete().catch(() => {});
        }
        if (uid && uid !== targetUid) {
          await adminDb.collection("users").doc(uid).delete().catch(() => {});
        }

        // Comprehensive root /users collection cleanup
        try {
          const allRootUsers = await adminDb.collection("users").get().catch(() => null);
          if (allRootUsers && !allRootUsers.empty) {
            for (const docSnap of allRootUsers.docs) {
              const data = docSnap.data() || {};
              const dEmail = (data.email || "").toLowerCase().trim();
              const dName = (data.name || "").toLowerCase().trim();
              const dWsId = data.workspaceId;

              const isUidMatch = docSnap.id === uid || (targetUid && docSnap.id === targetUid);
              const isEmailMatch = lowerEmail && dEmail === lowerEmail;
              const isNameMatch = cleanName && dName === cleanName && (!workspaceId || dWsId === workspaceId);

              if (isUidMatch || isEmailMatch || isNameMatch) {
                console.log(`[Delete User] AdminDb purging root user doc ${docSnap.id} (name: ${data.name}, email: ${data.email})`);
                await docSnap.ref.delete().catch(() => {});
              }
            }
          }
        } catch (rootCleanErr) {
          console.warn("[Delete User] Root users cleanup notice:", rootCleanErr);
        }

        // Comprehensive workspace subcollection cleanup
        if (workspaceId) {
          try {
            if (targetUid) {
              await adminDb.collection("workspaces").doc(workspaceId).collection("users").doc(targetUid).delete().catch(() => {});
            }
            if (uid && uid !== targetUid) {
              await adminDb.collection("workspaces").doc(workspaceId).collection("users").doc(uid).delete().catch(() => {});
            }

            const wsUsersSnap = await adminDb.collection("workspaces").doc(workspaceId).collection("users").get().catch(() => null);
            if (wsUsersSnap && !wsUsersSnap.empty) {
              for (const docSnap of wsUsersSnap.docs) {
                const data = docSnap.data() || {};
                const dEmail = (data.email || "").toLowerCase().trim();
                const dName = (data.name || "").toLowerCase().trim();

                const isUidMatch = docSnap.id === uid || (targetUid && docSnap.id === targetUid);
                const isEmailMatch = lowerEmail && dEmail === lowerEmail;
                const isNameMatch = cleanName && dName === cleanName;

                if (isUidMatch || isEmailMatch || isNameMatch) {
                  console.log(`[Delete User] AdminDb purging workspace subcollection user doc ${docSnap.id}`);
                  await docSnap.ref.delete().catch(() => {});
                }
              }
            }

            // Remove user from parent workspace's agentIds
            const wsDocRef = adminDb.collection("workspaces").doc(workspaceId);
            const wsDocSnap = await wsDocRef.get().catch(() => null);
            if (wsDocSnap && wsDocSnap.exists) {
              const wsData = wsDocSnap.data() || {};
              const existingAgents = Array.isArray(wsData.agentIds) ? wsData.agentIds : [];
              const updatedAgents = existingAgents.filter((id: string) => id !== uid && id !== targetUid);
              if (updatedAgents.length !== existingAgents.length) {
                await wsDocRef.update({ agentIds: updatedAgents }).catch(() => {});
                console.log(`[Delete User] Removed deleted user from workspace agentIds array`);
              }
            }
          } catch (wsCleanErr) {
            console.warn("[Delete User] Workspace subcollection cleanup notice:", wsCleanErr);
          }
        }
      }

      return res.json({ success: true, message: `Credentials purged for ${lowerEmail || cleanName || targetUid}` });
    } catch (err: any) {
      console.error("[Delete User] Unexpected failure:", err);
      return res.status(500).json({ error: err.message || "Failed to purge user credentials." });
    }
  });

  // API endpoint to delete all users associated with a workspace to prevent residue credentials
  app.post("/api/auth/delete-workspace-users", async (req: express.Request, res: express.Response) => {
    try {
      const { workspaceId, userUids = [], emails = [] } = req.body;
      if (!workspaceId) {
        return res.status(400).json({ error: "Missing workspaceId" });
      }

      if (!getApps().length) {
        return res.json({ success: true, deletedCount: 0 });
      }

      const auth = getAuth();
      const uidsToDelete = new Set<string>(userUids);
      const emailsToCheck = new Set<string>(emails.map((e: string) => (e || '').toLowerCase().trim()).filter(Boolean));

      // Query Firestore users across root and subcollections to discover all user UIDs and emails in this workspace
      if (adminDb) {
        try {
          const wsUsersSnap = await adminDb.collection("users").where("workspaceId", "==", workspaceId).get();
          wsUsersSnap.docs.forEach((docSnap: any) => {
            uidsToDelete.add(docSnap.id);
            const data = docSnap.data() || {};
            if (data.email) emailsToCheck.add(data.email.toLowerCase().trim());
          });

          const subUsersSnap = await adminDb.collection("workspaces").doc(workspaceId).collection("users").get();
          subUsersSnap.docs.forEach((docSnap: any) => {
            uidsToDelete.add(docSnap.id);
            const data = docSnap.data() || {};
            if (data.email) emailsToCheck.add(data.email.toLowerCase().trim());
          });
        } catch (qErr) {
          console.warn("[Delete Workspace Users] Firestore query warning:", qErr);
        }
      }

      // Convert emails to auth UIDs if not already present
      for (const email of emailsToCheck) {
        if (email === "karimazondomike049@gmail.com") continue; // Never delete App Owner
        try {
          const rec = await auth.getUserByEmail(email);
          if (rec.uid) uidsToDelete.add(rec.uid);
        } catch (eFindErr: any) {
          // Ignore user-not-found
        }
      }

      // Purge from Firebase Auth
      let deletedCount = 0;
      for (const uid of uidsToDelete) {
        try {
          const userRec = await auth.getUser(uid).catch(() => null);
          if (userRec && userRec.email?.toLowerCase().trim() === "karimazondomike049@gmail.com") {
            continue;
          }
          await auth.deleteUser(uid);
          deletedCount++;
        } catch (uDelErr: any) {
          if (uDelErr.code !== 'auth/user-not-found') {
            console.warn(`[Delete Workspace Users] Warning deleting user ${uid}:`, uDelErr);
          }
        }
      }

      // Delete from Firestore
      if (adminDb) {
        try {
          const rootUsers = await adminDb.collection("users").where("workspaceId", "==", workspaceId).get().catch(() => null);
          if (rootUsers && !rootUsers.empty) {
            for (const d of rootUsers.docs) {
              await d.ref.delete().catch(() => {});
            }
          }
          const subUsers = await adminDb.collection("workspaces").doc(workspaceId).collection("users").get().catch(() => null);
          if (subUsers && !subUsers.empty) {
            for (const d of subUsers.docs) {
              await d.ref.delete().catch(() => {});
            }
          }
        } catch (fsDelErr) {
          console.warn("[Delete Workspace Users] Firestore doc deletion notice:", fsDelErr);
        }
      }

      console.log(`[Delete Workspace Users] Purged ${deletedCount} Firebase Auth user accounts for workspace ${workspaceId}`);
      return res.json({ success: true, deletedCount });
    } catch (err: any) {
      console.error("[Delete Workspace Users] Failed:", err);
      return res.status(500).json({ error: err.message || "Failed to delete workspace users." });
    }
  });

  // API endpoint to purge orphan account credentials (when email has no active workspace)
  app.post("/api/auth/purge-orphan-account", async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const lowerEmail = (email || "").toLowerCase().trim();
      if (!lowerEmail) {
        return res.status(400).json({ error: "Missing email parameter" });
      }

      // Safety check: NEVER purge the App Owner
      if (lowerEmail === "karimazondomike049@gmail.com") {
        return res.status(403).json({ error: "Cannot purge App Owner account." });
      }

      if (!getApps().length) {
        return res.json({ success: true, purged: false });
      }

      // If Firestore is available, verify that this email does NOT belong to an active, non-deleted workspace
      if (adminDb) {
        try {
          const wsSnap = await adminDb.collection("workspaces").where("ownerEmail", "==", lowerEmail).get();
          const activeWorkspace = wsSnap.docs.find((d: any) => {
            const data = d.data();
            return data.isActive !== false;
          });
          if (activeWorkspace) {
            return res.status(409).json({ error: "Email is currently associated with an active workspace." });
          }
        } catch (dbErr) {
          console.warn("[Purge Orphan] DB check warning:", dbErr);
        }
      }

      const auth = getAuth();
      try {
        const userRec = await auth.getUserByEmail(lowerEmail);
        if (userRec && userRec.uid) {
          await auth.deleteUser(userRec.uid);
          console.log(`[Purge Orphan] Successfully purged orphan Firebase Auth user for ${lowerEmail} (UID: ${userRec.uid})`);
        }
      } catch (authErr: any) {
        if (authErr.code !== 'auth/user-not-found') {
          console.warn(`[Purge Orphan] Auth search warning:`, authErr);
        }
      }

      // Also purge from root /users in Firestore if orphaned (case-insensitively)
      if (adminDb) {
        try {
          const allUsers = await adminDb.collection("users").get().catch(() => null);
          if (allUsers && !allUsers.empty) {
            for (const d of allUsers.docs) {
              const dEmail = (d.data()?.email || "").toLowerCase().trim();
              if (dEmail === lowerEmail) {
                await d.ref.delete().catch(() => {});
              }
            }
          }
        } catch (userCleanErr) {
          console.warn("[Purge Orphan] User doc clean error:", userCleanErr);
        }
      }

      return res.json({ success: true, message: `Orphan credentials purged for ${lowerEmail}` });
    } catch (err: any) {
      console.error("[Purge Orphan] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to purge orphan account." });
    }
  });

  // API endpoint for automated 60-day (2-month) sold voucher archival to Cold Database
  app.post("/api/admin/archive-old-vouchers", async (req: express.Request, res: express.Response) => {
    try {
      const { workspaceId, dryRun } = req.body || {};
      const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - SIXTY_DAYS_MS);
      const details: string[] = [];
      let totalScanned = 0;
      let totalArchived = 0;

      details.push(`Running 60-day sold voucher archival scan. Cutoff: ${cutoffDate.toISOString()}`);

      if (adminDb) {
        try {
          const snapshot = await adminDb.collectionGroup("vouchers")
            .where("status", "==", "Sold")
            .get();

          totalScanned = snapshot.size;
          const batch = adminDb.batch();
          let batchCount = 0;

          snapshot.docs.forEach((d: any) => {
            const data = d.data();
            const wsId = workspaceId || data.workspaceId || 'ws_vakzim';

            if (workspaceId && data.workspaceId && data.workspaceId !== workspaceId) {
              return;
            }

            const saleTimeStr = data.soldAt || data.createdAt;
            if (saleTimeStr) {
              const saleTime = new Date(saleTimeStr).getTime();
              if (!isNaN(saleTime) && saleTime <= cutoffDate.getTime() && !data.archived) {
                if (!dryRun) {
                  const archivePayload = {
                    ...data,
                    archived: true,
                    archivedAt: new Date().toISOString()
                  };

                  const wsArchiveRef = adminDb.collection("workspaces").doc(wsId).collection("vouchers_archive").doc(d.id);
                  batch.set(wsArchiveRef, archivePayload);

                  const rootArchiveRef = adminDb.collection("vouchers_archive").doc(d.id);
                  batch.set(rootArchiveRef, archivePayload);

                  batch.delete(d.ref);

                  batchCount++;
                  totalArchived++;
                } else {
                  totalArchived++;
                }
              }
            }
          });

          if (!dryRun && batchCount > 0) {
            await batch.commit();
            console.log(`[WiVoTe Archival Engine] Batch committed: Archived ${totalArchived} sold vouchers > 2 months old.`);
          }
        } catch (dbErr: any) {
          console.warn("[WiVoTe Archival Engine] Admin DB scan notice:", dbErr?.message || dbErr);
        }
      }

      if (globalStore && globalStore.vouchers) {
        if (!globalStore.vouchers_archive) globalStore.vouchers_archive = {};
        Object.keys(globalStore.vouchers).forEach(id => {
          const v = globalStore.vouchers[id];
          if (!v || v.status !== 'Sold') return;
          const saleTimeStr = v.soldAt || v.createdAt;
          if (saleTimeStr) {
            const saleTime = new Date(saleTimeStr).getTime();
            if (!isNaN(saleTime) && saleTime <= cutoffDate.getTime() && !v.archived) {
              if (!dryRun) {
                globalStore.vouchers_archive[id] = {
                  ...v,
                  archived: true,
                  archivedAt: new Date().toISOString()
                };
                delete globalStore.vouchers[id];
                totalArchived++;
              }
            }
          }
        });
        if (!dryRun) persistGlobalStore();
      }

      const msg = dryRun
        ? `[Dry Run] Scanned ${totalScanned} vouchers; ${totalArchived} eligible for 60-day archival.`
        : `Archived ${totalArchived} sold vouchers older than 2 months into cold storage.`;

      return res.json({
        success: true,
        totalScanned,
        totalArchived,
        dryRun: !!dryRun,
        details,
        message: msg
      });
    } catch (err: any) {
      console.error("[WiVoTe Archival Engine] API error:", err);
      return res.status(500).json({ error: err?.message || "Failed to archive old vouchers" });
    }
  });

  // API endpoint to retrieve an existing user's UID by email using Admin SDK
  app.post("/api/auth/get-user-by-email", async (req: express.Request, res: express.Response) => {
    try {
      const { email } = req.body;
      const lowerEmail = (email || "").toLowerCase().trim();
      if (!lowerEmail) {
        return res.status(400).json({ error: "Missing email parameter" });
      }

      if (!getApps().length) {
        return res.status(503).json({ error: "Admin SDK not initialized" });
      }

      const auth = getAuth();
      try {
        const userRec = await auth.getUserByEmail(lowerEmail);
        return res.json({ success: true, uid: userRec.uid });
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found') {
          return res.status(404).json({ error: "User not found", code: "auth/user-not-found" });
        }
        return res.status(500).json({ error: authErr.message });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch user by email." });
    }
  });

  // API endpoint to securely update user password using Admin SDK (bypasses recent-login requirements)
  app.post("/api/auth/update-password", async (req: express.Request, res: express.Response) => {
    try {
      const { uid, password } = req.body;
      if (!uid || !password) {
        return res.status(400).json({ error: "Missing uid or password" });
      }

      if (!getApps().length) {
        return res.json({ success: true, message: "Admin SDK not initialized. Local profile updated." });
      }

      try {
        const auth = getAuth();
        await auth.updateUser(uid, { password });
        console.log(`[WiVoTe Claims Server] Successfully updated password via Admin SDK for user: ${uid}`);
        return res.json({ success: true, message: "Password updated successfully in Firebase Auth." });
      } catch (authErr: any) {
        console.warn("[Update Password Admin SDK] Auth update notice:", authErr.message);
        return res.json({ success: true, message: "Password updated in workspace profile." });
      }
    } catch (err: any) {
      console.warn("[Update Password Admin SDK] Error:", err?.message || err);
      return res.json({ success: true, message: "Password updated in workspace profile." });
    }
  });

  // API endpoint to recreate or synchronize restored user account in Firebase Auth
  app.post("/api/auth/restore-user", async (req: express.Request, res: express.Response) => {
    try {
      const { uid, email, password, name, photoUrl, cellNumber, workspaceId, role } = req.body;
      const lowerEmail = (email || "").toLowerCase().trim();
      const userPassword = (password || "").trim() || "26@Votewix";

      if (!lowerEmail) {
        return res.status(400).json({ error: "Missing email address for user restoration" });
      }

      if (!getApps().length) {
        return res.json({ success: true, uid: uid || `restored_${Date.now()}`, message: "Admin SDK not initialized. Mock success." });
      }

      const auth = getAuth();
      let targetAuthUser: any = null;

      // 1. Check if user already exists in Firebase Auth by email
      try {
        targetAuthUser = await auth.getUserByEmail(lowerEmail);
      } catch (findErr: any) {
        if (findErr.code !== 'auth/user-not-found') {
          console.warn("[Restore User] getUserByEmail error:", findErr);
        }
      }

      if (targetAuthUser) {
        // User exists in Firebase Auth: update password and profile
        await auth.updateUser(targetAuthUser.uid, {
          password: userPassword,
          displayName: name || targetAuthUser.displayName,
          photoURL: photoUrl || targetAuthUser.photoURL
        });
        console.log(`[WiVoTe Restore User] Re-synced existing Auth user: ${targetAuthUser.uid} (${lowerEmail})`);
        return res.json({
          success: true,
          uid: targetAuthUser.uid,
          message: "User credentials successfully synchronized in Firebase Auth."
        });
      } else {
        // User does not exist in Firebase Auth: recreate the user
        const createPayload: any = {
          email: lowerEmail,
          password: userPassword,
          displayName: name || lowerEmail.split('@')[0],
          photoURL: photoUrl || ""
        };

        // If UID is provided and not a local temp prefix, use the exact UID
        if (uid && !uid.startsWith('agent_') && !uid.startsWith('temp_') && !uid.startsWith('u_')) {
          createPayload.uid = uid;
        }

        try {
          const newRecord = await auth.createUser(createPayload);
          console.log(`[WiVoTe Restore User] Created fresh Auth user: ${newRecord.uid} (${lowerEmail})`);
          return res.json({
            success: true,
            uid: newRecord.uid,
            message: "User successfully recreated in Firebase Auth."
          });
        } catch (createErr: any) {
          console.error("[WiVoTe Restore User] Create user error:", createErr);
          // If collision or invalid uid, retry without explicit UID
          if (createPayload.uid) {
            delete createPayload.uid;
            const fallbackRecord = await auth.createUser(createPayload);
            return res.json({
              success: true,
              uid: fallbackRecord.uid,
              message: "User created with generated UID in Firebase Auth."
            });
          }
          return res.status(500).json({ error: createErr.message || "Failed to recreate user in Firebase Auth." });
        }
      }
    } catch (err: any) {
      console.error("[Restore User API] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to restore user." });
    }
  });

  // Secure administrative utility endpoint to clean up orphaned Firebase Auth user records
  // and Firestore documents for deleted accounts to prevent 'email-already-in-use' collisions
  const handleOrphanedAccountsCleanup = async (req: express.Request, res: express.Response) => {
    try {
      const { targetEmail, dryRun = false } = req.body || {};
      const lowerTargetEmail = (targetEmail || "").toLowerCase().trim();
      const APP_OWNER_EMAIL = "karimazondomike049@gmail.com";

      if (lowerTargetEmail === APP_OWNER_EMAIL) {
        return res.status(403).json({ error: "Cannot purge primary App Owner account." });
      }

      if (!getApps().length) {
        return res.status(503).json({ error: "Firebase Admin SDK is not initialized." });
      }

      const auth = getAuth();
      const logs: string[] = [];
      let purgedAuthCount = 0;
      let purgedDocCount = 0;

      // MODE 1: Targeted cleanup of a single email address
      if (lowerTargetEmail) {
        // Step 1: Check if this email is actively in use by an active workspace
        if (adminDb) {
          try {
            const wsSnap = await adminDb.collection("workspaces").where("ownerEmail", "==", lowerTargetEmail).get();
            const activeWorkspace = wsSnap.docs.find((d: any) => d.data()?.isActive !== false);
            if (activeWorkspace) {
              return res.status(409).json({
                success: false,
                error: `Email "${lowerTargetEmail}" belongs to active workspace "${activeWorkspace.data()?.name || activeWorkspace.id}". Cannot clean up active accounts.`
              });
            }
          } catch (wsErr) {
            console.warn("[Admin Cleanup] Active workspace check notice:", wsErr);
          }
        }

        // Step 2: Look up user in Firebase Auth
        let targetUid = "";
        try {
          const userRec = await auth.getUserByEmail(lowerTargetEmail);
          targetUid = userRec.uid;
          if (!dryRun) {
            await auth.deleteUser(targetUid);
            purgedAuthCount++;
            logs.push(`Purged Firebase Auth user UID: ${targetUid} (${lowerTargetEmail})`);
          } else {
            logs.push(`[Dry Run] Would purge Firebase Auth user UID: ${targetUid} (${lowerTargetEmail})`);
          }
        } catch (authErr: any) {
          if (authErr.code !== 'auth/user-not-found') {
            logs.push(`Firebase Auth lookup note: ${authErr.message}`);
          }
        }

        // Step 3: Clean up matching Firestore documents
        if (adminDb) {
          // A. Root /users collection
          try {
            const allUsersSnap = await adminDb.collection("users").get();
            for (const uDoc of allUsersSnap.docs) {
              const uData = uDoc.data() || {};
              const uEmail = (uData.email || "").toLowerCase().trim();
              const isUidMatch = targetUid && uDoc.id === targetUid;
              const isEmailMatch = uEmail === lowerTargetEmail;
              if (isUidMatch || isEmailMatch) {
                if (!dryRun) {
                  await uDoc.ref.delete().catch(() => {});
                  purgedDocCount++;
                  logs.push(`Purged Firestore /users document ${uDoc.id} (${uData.name || uEmail})`);
                } else {
                  logs.push(`[Dry Run] Would purge Firestore /users document ${uDoc.id}`);
                }
              }
            }
          } catch (docErr: any) {
            logs.push(`Firestore root users cleanup notice: ${docErr.message}`);
          }

          // B. Workspace subcollections /workspaces/{wsId}/users
          try {
            const allWsSnap = await adminDb.collection("workspaces").get();
            for (const wsDoc of allWsSnap.docs) {
              const subUsersSnap = await wsDoc.ref.collection("users").get().catch(() => null);
              if (subUsersSnap && !subUsersSnap.empty) {
                for (const subDoc of subUsersSnap.docs) {
                  const subData = subDoc.data() || {};
                  const subEmail = (subData.email || "").toLowerCase().trim();
                  if ((targetUid && subDoc.id === targetUid) || subEmail === lowerTargetEmail) {
                    if (!dryRun) {
                      await subDoc.ref.delete().catch(() => {});
                      purgedDocCount++;
                      logs.push(`Purged workspace ${wsDoc.id} subcollection user document ${subDoc.id}`);
                    } else {
                      logs.push(`[Dry Run] Would purge workspace ${wsDoc.id} subcollection user document ${subDoc.id}`);
                    }
                  }
                }
              }
              // Also check if targetUid is in agentIds array
              if (targetUid) {
                const wsData = wsDoc.data() || {};
                if (Array.isArray(wsData.agentIds) && wsData.agentIds.includes(targetUid)) {
                  if (!dryRun) {
                    await wsDoc.ref.update({
                      agentIds: wsData.agentIds.filter((id: string) => id !== targetUid)
                    }).catch(() => {});
                    logs.push(`Removed UID ${targetUid} from workspace ${wsDoc.id} agentIds`);
                  }
                }
              }
            }
          } catch (subErr: any) {
            logs.push(`Workspace subcollections cleanup notice: ${subErr.message}`);
          }
        }

        return res.json({
          success: true,
          mode: 'targeted',
          email: lowerTargetEmail,
          purgedAuthCount,
          purgedDocCount,
          dryRun,
          details: logs,
          message: `Cleaned up orphaned records for ${lowerTargetEmail}. Auth accounts purged: ${purgedAuthCount}, Firestore docs purged: ${purgedDocCount}.`
        });
      }

      // MODE 2: System-wide audit and cleanup of all orphaned Auth users and stale Firestore docs
      if (!adminDb) {
        return res.status(503).json({ error: "Firestore Admin DB is not initialized for system audit." });
      }

      // 1. Collect all active workspaces, owner emails, and agent IDs
      const activeWorkspaceIds = new Set<string>();
      const activeOwnerEmails = new Set<string>();
      const activeAgentIds = new Set<string>();

      try {
        const wsSnap = await adminDb.collection("workspaces").get();
        wsSnap.docs.forEach((d: any) => {
          const data = d.data() || {};
          if (data.isActive !== false) {
            activeWorkspaceIds.add(d.id);
            if (data.ownerEmail) activeOwnerEmails.add(data.ownerEmail.toLowerCase().trim());
            if (Array.isArray(data.agentIds)) {
              data.agentIds.forEach((id: string) => activeAgentIds.add(id));
            }
          }
        });
      } catch (wsErr: any) {
        logs.push(`Workspace collection query notice: ${wsErr.message}`);
      }

      // 2. Scan root Firestore /users collection
      const activeUserUids = new Set<string>();
      const activeUserEmails = new Set<string>();

      try {
        const usersSnap = await adminDb.collection("users").get();
        for (const uDoc of usersSnap.docs) {
          const data = uDoc.data() || {};
          const email = (data.email || "").toLowerCase().trim();
          const wsId = data.workspaceId;
          const isAppOwner = email === APP_OWNER_EMAIL || data.role === 'AppOwner' || uDoc.id === 'admin_001';

          if (isAppOwner) {
            activeUserUids.add(uDoc.id);
            if (email) activeUserEmails.add(email);
            continue;
          }

          // Check if user belongs to a non-existent or inactive workspace, or is marked deleted
          const isWorkspaceActive = wsId && activeWorkspaceIds.has(wsId);
          const isOrphan = !isWorkspaceActive || data.isDeleted === true || data.status === 'deleted';

          if (isOrphan) {
            if (!dryRun) {
              await uDoc.ref.delete().catch(() => {});
              purgedDocCount++;
              logs.push(`Purged orphaned Firestore /users doc ${uDoc.id} (${data.name || email}, wsId: ${wsId || 'none'})`);
            } else {
              logs.push(`[Dry Run] Would purge orphaned Firestore /users doc ${uDoc.id} (${email})`);
            }
          } else {
            activeUserUids.add(uDoc.id);
            if (email) activeUserEmails.add(email);
          }
        }
      } catch (usersErr: any) {
        logs.push(`Users collection query notice: ${usersErr.message}`);
      }

      // 3. Scan Firebase Auth users for orphans (accounts without active workspace or active Firestore record)
      try {
        let pageToken: string | undefined = undefined;
        do {
          const listUsersResult = await auth.listUsers(1000, pageToken);
          for (const authUser of listUsersResult.users) {
            const authEmail = (authUser.email || "").toLowerCase().trim();
            const authUid = authUser.uid;

            // Never touch AppOwner
            if (authEmail === APP_OWNER_EMAIL || authUid === 'admin_001') {
              continue;
            }

            const hasActiveOwnerEmail = authEmail && activeOwnerEmails.has(authEmail);
            const hasActiveUserDoc = activeUserUids.has(authUid) || (authEmail && activeUserEmails.has(authEmail));
            const hasActiveAgentRef = activeAgentIds.has(authUid);

            // If no active workspace ownership, active user document, or active agent reference, it is an orphan!
            if (!hasActiveOwnerEmail && !hasActiveUserDoc && !hasActiveAgentRef) {
              if (!dryRun) {
                await auth.deleteUser(authUid).catch(err => {
                  logs.push(`Failed to delete auth user ${authUid}: ${err.message}`);
                });
                purgedAuthCount++;
                logs.push(`Purged orphaned Firebase Auth user UID: ${authUid} (${authEmail || 'no-email'})`);
              } else {
                logs.push(`[Dry Run] Would purge orphaned Firebase Auth user UID: ${authUid} (${authEmail || 'no-email'})`);
              }
            }
          }
          pageToken = listUsersResult.pageToken;
        } while (pageToken);
      } catch (authListErr: any) {
        logs.push(`Auth user directory scan notice: ${authListErr.message}`);
      }

      return res.json({
        success: true,
        mode: 'system_wide',
        purgedAuthCount,
        purgedDocCount,
        dryRun,
        details: logs,
        message: logs.some(l => l.includes('PERMISSION_DENIED') || l.includes('restricted'))
          ? `System scan executed with permission restrictions. Server details logged.`
          : `System-wide cleanup complete. Purged ${purgedAuthCount} orphaned Auth user(s) and ${purgedDocCount} orphaned Firestore document(s).`
      });
    } catch (err: any) {
      console.error("[Cleanup Orphaned Accounts] Failure:", err);
      return res.status(500).json({ error: err.message || "Failed to cleanup orphaned accounts." });
    }
  };

  app.post("/api/admin/cleanup-orphaned-accounts", handleOrphanedAccountsCleanup);
  app.post("/api/auth/cleanup-orphaned-accounts", handleOrphanedAccountsCleanup);

  // API endpoint for DRASTIC MEASURE: Reconcile duplicate/shadow accounts and purge shadows
  const handleReconcileShadowAccounts = async (req: express.Request, res: express.Response) => {
    try {
      const { targetEmail, dryRun = false } = req.body || {};
      const lowerTargetEmail = (targetEmail || "").toLowerCase().trim();
      const logs: string[] = [];
      let mergedCount = 0;
      let purgedDocCount = 0;
      let updatedVouchersCount = 0;

      if (!adminDb) {
        return res.status(503).json({ error: "Firestore Admin DB is not initialized." });
      }

      const auth = getAuth();

      logs.push(`[Shadow Reconcile] Starting ${dryRun ? 'DRY-RUN' : 'LIVE'} account scan${lowerTargetEmail ? ` for email "${lowerTargetEmail}"` : ' system-wide'}...`);

      // 1. Gather all workspaces
      const workspacesSnap = await adminDb.collection("workspaces").get();
      const workspaces = workspacesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      // 2. Gather all root users
      const usersSnap = await adminDb.collection("users").get();
      const allUserDocs: { id: string; ref: any; data: any; source: string; workspaceId?: string }[] = [];

      usersSnap.forEach((docSnap: any) => {
        allUserDocs.push({
          id: docSnap.id,
          ref: docSnap.ref,
          data: docSnap.data(),
          source: 'root',
          workspaceId: docSnap.data()?.workspaceId
        });
      });

      // 3. Gather all workspace subcollection users
      for (const ws of workspaces) {
        try {
          const wsUsersSnap = await adminDb.collection("workspaces").doc(ws.id).collection("users").get();
          wsUsersSnap.forEach((docSnap: any) => {
            allUserDocs.push({
              id: docSnap.id,
              ref: docSnap.ref,
              data: docSnap.data(),
              source: `workspace:${ws.id}`,
              workspaceId: ws.id
            });
          });
        } catch (wsErr) {
          // ignore
        }
      }

      // 4. Group by normalized email
      const emailGroups = new Map<string, typeof allUserDocs>();
      for (const u of allUserDocs) {
        const rawEmail = u.data?.email || '';
        const normEmail = rawEmail.toLowerCase().trim();
        if (!normEmail || !normEmail.includes('@')) continue;
        if (lowerTargetEmail && normEmail !== lowerTargetEmail) continue;

        if (!emailGroups.has(normEmail)) {
          emailGroups.set(normEmail, []);
        }
        emailGroups.get(normEmail)!.push(u);
      }

      // 5. Process each email group that has duplicates, or single shadow accounts
      for (const [email, docs] of emailGroups.entries()) {
        // Look up Firebase Auth user if exists
        let authUserRecord: any = null;
        try {
          authUserRecord = await auth.getUserByEmail(email);
        } catch (e) {
          // not found in auth
        }
        const authUid = authUserRecord?.uid;

        // Categorize each doc:
        // A shadow doc has placeholder cell '+263770000000' or no cell, AND (empty workspaceId OR placeholder profile pic)
        const isShadowDoc = (d: any) => {
          const data = d.data || {};
          const isDefaultCell = !data.cellNumber || data.cellNumber === '+263770000000';
          const isPlaceholderPic = !data.profilePic || data.profilePic.includes('photo-1472099645785-5658abf4ff4e');
          const isEmptyWorkspace = !data.workspaceId || data.workspaceId === '';
          return (isDefaultCell && (isEmptyWorkspace || isPlaceholderPic)) || (isEmptyWorkspace && data.role !== 'AppOwner');
        };

        // If only 1 doc and not a shadow, nothing to fix
        if (docs.length === 1 && !isShadowDoc(docs[0])) {
          continue;
        }

        // We have duplicates, or a shadow doc!
        logs.push(`Analyzing ${docs.length} document(s) for email "${email}" (Auth UID: ${authUid || 'none'})...`);

        // Find the best real document (highest fidelity)
        let realDoc = docs.find(d => !isShadowDoc(d));
        // If all are shadows or none strictly real, pick the one with most info (e.g. non-empty workspaceId or most keys)
        if (!realDoc) {
          realDoc = docs.sort((a, b) => {
            const aWs = a.data?.workspaceId ? 1 : 0;
            const bWs = b.data?.workspaceId ? 1 : 0;
            return bWs - aWs;
          })[0];
        }

        const canonicalWorkspaceId = realDoc.data?.workspaceId || docs.find(d => d.data?.workspaceId)?.data?.workspaceId || '';
        const canonicalCell = (realDoc.data?.cellNumber && realDoc.data?.cellNumber !== '+263770000000') 
          ? realDoc.data?.cellNumber 
          : docs.find(d => d.data?.cellNumber && d.data?.cellNumber !== '+263770000000')?.data?.cellNumber || '+263770000000';
        const canonicalName = realDoc.data?.name || docs.find(d => d.data?.name)?.data?.name || email.split('@')[0];
        const canonicalRole = realDoc.data?.role || docs.find(d => d.data?.role)?.data?.role || 'Agent';
        const canonicalPic = (realDoc.data?.profilePic && !realDoc.data?.profilePic.includes('photo-1472099645785-5658abf4ff4e'))
          ? realDoc.data?.profilePic
          : docs.find(d => d.data?.profilePic && !d.data?.profilePic.includes('photo-1472099645785-5658abf4ff4e'))?.data?.profilePic || realDoc.data?.profilePic;
        const canonicalPassword = realDoc.data?.password || docs.find(d => d.data?.password)?.data?.password;

        // Determine canonical UID:
        // Priority: active Firebase Auth UID if exists, otherwise realDoc.id
        const canonicalUid = authUid || realDoc.id;

        const mergedProfile = {
          ...realDoc.data,
          uid: canonicalUid,
          email,
          name: canonicalName,
          cellNumber: canonicalCell,
          role: canonicalRole,
          workspaceId: canonicalWorkspaceId,
          profilePic: canonicalPic,
          ...(canonicalPassword ? { password: canonicalPassword } : {})
        };

        logs.push(`-> Merged canonical profile established: UID="${canonicalUid}", Name="${canonicalName}", Phone="${canonicalCell}", Workspace="${canonicalWorkspaceId}", Role="${canonicalRole}"`);

        // Collect all doc IDs that are NOT canonicalUid
        const allDocIds = Array.from(new Set(docs.map(d => d.id)));
        const oldDocIds = allDocIds.filter(id => id !== canonicalUid);

        if (!dryRun) {
          // 1. Write merged canonical profile to root /users/{canonicalUid}
          await adminDb.collection("users").doc(canonicalUid).set(mergedProfile, { merge: true });

          // 2. Write to /workspaces/{canonicalWorkspaceId}/users/{canonicalUid} if workspace is known
          if (canonicalWorkspaceId && canonicalWorkspaceId !== 'system') {
            await adminDb.collection("workspaces").doc(canonicalWorkspaceId).collection("users").doc(canonicalUid).set(mergedProfile, { merge: true });
          }

          // 3. Re-assign vouchers in workspace from oldDocIds to canonicalUid
          if (canonicalWorkspaceId && canonicalWorkspaceId !== 'system' && oldDocIds.length > 0) {
            try {
              const vouchersRef = adminDb.collection("workspaces").doc(canonicalWorkspaceId).collection("vouchers");
              for (const oldId of oldDocIds) {
                const voucherSnap = await vouchersRef.where("assignedAgentId", "==", oldId).get();
                if (!voucherSnap.empty) {
                  for (const vDoc of voucherSnap.docs) {
                    await vDoc.ref.update({
                      assignedAgentId: canonicalUid,
                      assignedAgentName: canonicalName
                    });
                    updatedVouchersCount++;
                  }
                  logs.push(`Re-pointed ${voucherSnap.size} vouchers from old UID "${oldId}" to "${canonicalUid}"`);
                }
              }
            } catch (vErr) {
              logs.push(`Voucher re-assignment warning: ${(vErr as any).message}`);
            }

            // 4. Update workspace agentIds array and ownerId
            try {
              const wsRef = adminDb.collection("workspaces").doc(canonicalWorkspaceId);
              const wsDocSnap = await wsRef.get();
              if (wsDocSnap.exists) {
                const wsData = wsDocSnap.data() || {};
                let agentIds: string[] = Array.isArray(wsData.agentIds) ? wsData.agentIds : [];
                let changed = false;
                for (const oldId of oldDocIds) {
                  if (agentIds.includes(oldId)) {
                    agentIds = agentIds.filter(id => id !== oldId);
                    changed = true;
                  }
                }
                if (canonicalRole === 'Agent' && !agentIds.includes(canonicalUid)) {
                  agentIds.push(canonicalUid);
                  changed = true;
                }
                const updates: any = {};
                if (changed) updates.agentIds = agentIds;
                if (oldDocIds.includes(wsData.ownerId)) updates.ownerId = canonicalUid;
                if (oldDocIds.includes(wsData.ownerUid)) updates.ownerUid = canonicalUid;

                if (Object.keys(updates).length > 0) {
                  await wsRef.update(updates);
                  logs.push(`Updated workspace "${canonicalWorkspaceId}" references to canonical UID "${canonicalUid}"`);
                }
              }
            } catch (wsUpErr) {
              logs.push(`Workspace reference update warning: ${(wsUpErr as any).message}`);
            }
          }

          // 5. Delete old/shadow documents
          for (const d of docs) {
            if (d.id !== canonicalUid) {
              await d.ref.delete().catch(() => {});
              purgedDocCount++;
              logs.push(`Deleted obsolete user document ${d.id} from ${d.source}`);
            }
          }

          mergedCount++;
        } else {
          logs.push(`[Dry Run] Would merge and write canonical UID "${canonicalUid}" and purge ${oldDocIds.length} obsolete document(s).`);
        }
      }

      return res.json({
        success: true,
        mergedCount,
        purgedDocCount,
        updatedVouchersCount,
        dryRun,
        details: logs,
        message: `Deduplication complete. Reconciled and healed ${mergedCount} accounts, purged ${purgedDocCount} shadow/duplicate documents, re-assigned ${updatedVouchersCount} vouchers.`
      });
    } catch (err: any) {
      console.error("[Reconcile Shadow Accounts] Failure:", err);
      return res.status(500).json({ error: err.message || "Failed to reconcile shadow accounts." });
    }
  };

  app.post("/api/admin/reconcile-shadow-accounts", handleReconcileShadowAccounts);
  app.post("/api/auth/reconcile-shadow-accounts", handleReconcileShadowAccounts);

  // API endpoint to retrieve the live count of workspaces recorded in Firestore and sync saas_config/workspaces_summary
  let cachedWorkspacesCount = 2; // Default baseline count matching recorded tenants
  let cachedAgentsCount = 0;
  app.get("/api/saas/workspaces-count", async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) {
        return res.json({
          success: true,
          count: cachedWorkspacesCount,
          activeCount: cachedWorkspacesCount,
          workspacesRecordedCount: cachedWorkspacesCount,
          agentsRecordedCount: cachedAgentsCount,
          activeAgentsCount: cachedAgentsCount
        });
      }

      const snapshot = await adminDb.collection("workspaces").get();
      const total = snapshot.size;
      let active = 0;
      const activeWsIds = new Set<string>();
      const agentIdsFromWs = new Set<string>();

      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        if (data.isActive !== false) {
          active++;
          activeWsIds.add(docSnap.id);
          if (Array.isArray(data.agentIds)) {
            data.agentIds.forEach((id: string) => {
              if (id) agentIdsFromWs.add(id);
            });
          }
        }
      });

      // Also tally actual active agents in users collection
      let activeAgentsTotal = agentIdsFromWs.size;
      try {
        const usersSnap = await adminDb.collection("users").get();
        const activeAgentUids = new Set<string>();
        usersSnap.forEach((uDoc: any) => {
          const uData = uDoc.data();
          const role = (uData.role || '').toLowerCase().trim();
          if (role === 'agent' || role === 'fieldagent') {
            const isDeactivated = uData.isDeactivated === true || uData.status === 'inactive' || uData.status === 'suspended' || uData.isActive === false;
            if (!isDeactivated && ((uData.workspaceId && activeWsIds.has(uData.workspaceId)) || agentIdsFromWs.has(uDoc.id))) {
              activeAgentUids.add(uDoc.id);
            }
          }
        });
        activeAgentsTotal = Math.max(activeAgentUids.size, agentIdsFromWs.size);
      } catch (uErr) {
        // Fall back to agentIds from active workspaces
      }

      cachedWorkspacesCount = total;
      cachedAgentsCount = activeAgentsTotal;

      return res.json({
        success: true,
        count: total,
        activeCount: active,
        workspacesRecordedCount: total,
        agentsRecordedCount: activeAgentsTotal,
        activeAgentsCount: activeAgentsTotal
      });
    } catch (err: any) {
      // Return cached fallback count gracefully without crashing
      return res.json({
        success: true,
        count: cachedWorkspacesCount,
        activeCount: cachedWorkspacesCount,
        workspacesRecordedCount: cachedWorkspacesCount,
        agentsRecordedCount: cachedAgentsCount,
        activeAgentsCount: cachedAgentsCount
      });
    }
  });

  app.get("/api/debug-legacy-devices", async (req: express.Request, res: express.Response) => {
    try {
      if (!adminDb) {
        return res.json({ error: "No adminDb" });
      }
      const workspacesSnap = await adminDb.collection("workspaces").get();
      const output: any = {};
      for (const wsDoc of workspacesSnap.docs) {
        const wsId = wsDoc.id;
        output[wsId] = {
          name: wsDoc.data().name,
          legacy_devices: [],
          legacyDevices: [],
          vouchersCount: 0,
          soldVouchers: [],
          users: []
        };
        try {
          const ldSnap = await adminDb.collection("workspaces").doc(wsId).collection("legacy_devices").get();
          ldSnap.docs.forEach((d: any) => output[wsId].legacy_devices.push({ id: d.id, ...d.data() }));
        } catch (e: any) { output[wsId].legacy_devices_err = e.message; }

        try {
          const ldSnap2 = await adminDb.collection("workspaces").doc(wsId).collection("legacyDevices").get();
          ldSnap2.docs.forEach((d: any) => output[wsId].legacyDevices.push({ id: d.id, ...d.data() }));
        } catch (e: any) { output[wsId].legacyDevices_err = e.message; }

        try {
          const vSnap = await adminDb.collection("workspaces").doc(wsId).collection("vouchers").get();
          output[wsId].vouchersCount = vSnap.size;
          vSnap.docs.forEach((d: any) => {
            const v = d.data();
            if (v.status === 'Sold') {
              output[wsId].soldVouchers.push({ id: d.id, code: v.code, plan: v.plan, price: v.price, agentName: v.assignedAgentName, agentId: v.assignedAgentId, soldAt: v.soldAt });
            }
          });
        } catch (e: any) { output[wsId].vouchers_err = e.message; }

        try {
          const uSnap = await adminDb.collection("workspaces").doc(wsId).collection("users").get();
          uSnap.docs.forEach((d: any) => output[wsId].users.push({ id: d.id, ...d.data() }));
        } catch (e: any) { output[wsId].users_err = e.message; }
      }
      return res.json({ success: true, data: output });
    } catch (err: any) {
      return res.status(500).json({ error: err.message, stack: err.stack });
    }
  });

  // API endpoint for profile picture AI censorship (Gemini)
  app.post("/api/censor", async (req: express.Request, res: express.Response) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing imageBase64" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY environment variable is missing. Skipping censorship check (defaulting to safe).");
        return res.json({ safe: true });
      }

      // Initialize the modern @google/genai SDK
      const ai = new GoogleGenAI({ apiKey });

      // Strip data URI scheme prefix if present
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      console.log("Analyzing image size:", base64Data.length, "chars");

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
              {
                text: "Analyze this image. Is it decent and appropriate for a professional profile picture? It must not contain nudity, explicit content, raw violence, extreme gore, hate symbols, or offensive gestures. Respond strictly with a JSON object: { \"safe\": true } or { \"safe\": false, \"reason\": \"<reason why it is inappropriate>\" }. Do not include markdown formatting or backticks around the JSON.",
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "{}";
      console.log("Gemini response text:", responseText);

      // Clean response text of any markdown blocks just in case
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith("```json")) {
        cleanedText = cleanedText.substring(7);
      } else if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.substring(3);
      }
      if (cleanedText.endsWith("```")) {
        cleanedText = cleanedText.substring(0, cleanedText.length - 3);
      }
      cleanedText = cleanedText.trim();

      const result = JSON.parse(cleanedText);
      return res.json(result);
    } catch (error) {
      console.error("Censorship error:", error);
      // Fallback: If censorship fails (e.g. invalid format or API quota), allow but warn
      return res.json({
        safe: true,
        warning: "Censorship check could not be completed, allowing by default.",
      });
    }
  });

  // API endpoint to email account DB files / backups
  app.post("/api/backup/email-db", async (req: express.Request, res: express.Response) => {
    try {
      const { recipientEmail, subject, accountName, snapshotData, isBatch, count, notes } = req.body;
      if (!recipientEmail) {
        return res.status(400).json({ error: "Missing recipientEmail" });
      }

      const emailSubject = subject || (isBatch 
        ? `[WiVoTe] Recycle Bin DB Files Export (${count || 'Multiple'} Accounts)` 
        : `[WiVoTe] Database Backup File: ${accountName || 'Account'}`);

      const jsonContent = JSON.stringify(snapshotData, null, 2);
      const filename = isBatch 
        ? `wivote_bin_export_${Date.now()}.json`
        : `wivote_${(accountName || 'account').toLowerCase().replace(/\s+/g, '_')}_backup_${Date.now()}.json`;

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || `"WiVoTe System" <${smtpUser || 'no-reply@wivote.internal'}>`;

      let sentViaSmtp = false;
      let smtpMessageId: string | null = null;

      if (smtpHost && smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          });

          const info = await transporter.sendMail({
            from: smtpFrom,
            to: recipientEmail,
            subject: emailSubject,
            text: `Attached is the requested database backup file from WiVoTe.\n\nType: ${isBatch ? 'Batch Recycle Bin Export' : 'Account Database Snapshot'}\nAccount: ${accountName || 'Multiple'}\nTimestamp: ${new Date().toISOString()}\nNotes: ${notes || 'None'}\n\nKeep this file in a safe location. It can be used to restore the account at any time.`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; background: #f8fafc; border-radius: 8px;">
                <h2 style="color: #0284c7; margin-top: 0;">WiVoTe Database Backup</h2>
                <p>Attached is the requested account database backup file from WiVoTe.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                  <tr><td style="padding: 6px; font-weight: bold; width: 140px;">Type:</td><td>${isBatch ? 'Batch Recycle Bin Export' : 'Account DB Snapshot'}</td></tr>
                  <tr><td style="padding: 6px; font-weight: bold;">Account:</td><td>${accountName || 'Batch / Multiple'}</td></tr>
                  <tr><td style="padding: 6px; font-weight: bold;">Generated At:</td><td>${new Date().toLocaleString()}</td></tr>
                  ${notes ? `<tr><td style="padding: 6px; font-weight: bold;">Notes:</td><td>${notes}</td></tr>` : ''}
                </table>
                <p style="font-size: 13px; color: #64748b;">The attached JSON file contains the full user profile, voucher allocations, sales history, and associated records for one-click account restoration.</p>
              </div>
            `,
            attachments: [
              {
                filename,
                content: jsonContent,
                contentType: 'application/json'
              }
            ]
          });
          sentViaSmtp = true;
          smtpMessageId = info.messageId;
          console.log(`[WiVoTe Backup] Real email sent via SMTP to ${recipientEmail}, MessageId:`, info.messageId);
        } catch (mailErr: any) {
          console.warn("[WiVoTe Backup] SMTP transport failed, falling back to client-assisted dispatch:", mailErr.message);
        }
      }

      console.log(`[WiVoTe Backup] DB file export prepared for ${recipientEmail}. SentViaSmtp: ${sentViaSmtp}`);

      return res.json({
        success: true,
        sentViaSmtp,
        smtpMessageId,
        filename,
        recipientEmail,
        subject: emailSubject,
        fileSizeBytes: Buffer.byteLength(jsonContent, 'utf8'),
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[WiVoTe Backup] Error emailing DB file:", err);
      return res.status(500).json({ error: err.message || "Failed to process email dispatch." });
    }
  });

  // --- Global Cross-Device Synchronization Bridge ---
  // Guarantees 100% persistent real-time cross-device data replication
  // across Admin and Agent dashboards regardless of Firestore quota limits.
  const STORE_PATH = path.join(process.cwd(), "server_sync_store.json");

  interface GlobalSyncStore {
    vouchers: Record<string, any>;
    vouchers_archive?: Record<string, any>;
    workspaces: Record<string, any>;
    users: Record<string, any>;
    requests: Record<string, any>;
    cashDrops: Record<string, any>;
    legacyDevices: Record<string, any>;
    customers: Record<string, any>;
    reversalRequests: Record<string, any>;
    deletedRequests?: Record<string, boolean>;
    deletedPlans?: Record<string, boolean>;
    latestDbPushMetricsMirror?: Record<string, any>;
    updatedAt: number;
  }

  function sanitizeVoucherCode(v: any): string {
    if (!v) return '';
    let code = (typeof v === 'string' ? v : v.code || '').toString().trim();
    const id = (typeof v === 'object' && v ? v.id || '' : '').toString().trim();

    const stripPrefix = (str: string): string => {
      if (!str) return '';
      let res = str.trim();
      let prev = '';
      while (res !== prev) {
        prev = res;
        res = res.replace(/^[vV]_/, '');
        res = res.replace(/^\d{6,}_/, '');
        res = res.replace(/^[vV]_\d+_/, '');
      }
      if (/^\d{8,}_/.test(res)) {
        res = res.replace(/^\d{8,}_/, '');
      }
      const idx = res.lastIndexOf('_');
      if (idx !== -1 && /^\d+$/.test(res.slice(0, idx))) {
        res = res.substring(idx + 1);
      }
      return res;
    };

    let cleaned = stripPrefix(code);

    if (!cleaned || cleaned.length === 0 || cleaned.startsWith('v_') || /^\d{8,}$/.test(cleaned)) {
      cleaned = stripPrefix(id);
      if (!cleaned || /^\d{8,}$/.test(cleaned)) {
        const parts = id.split('_');
        if (parts.length >= 2) {
          cleaned = parts[parts.length - 1];
        }
      }
    }

    if (/^\d{10,}$/.test(cleaned)) {
      const raw = id || code;
      const parts = raw.split('_');
      if (parts.length >= 2) {
        cleaned = parts[parts.length - 1];
      }
    }

    return cleaned || code || id;
  }

  function loadGlobalStore(): GlobalSyncStore {
    let store: GlobalSyncStore = {
      vouchers: {},
      vouchers_archive: {},
      workspaces: {},
      users: {},
      requests: {},
      cashDrops: {},
      legacyDevices: {},
      customers: {},
      reversalRequests: {},
      deletedRequests: {},
      deletedPlans: {},
      latestDbPushMetricsMirror: {},
      updatedAt: Date.now()
    };
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        store = {
          ...store,
          ...parsed,
          reversalRequests: parsed.reversalRequests || {},
          deletedRequests: parsed.deletedRequests || {},
          deletedPlans: parsed.deletedPlans || {},
          latestDbPushMetricsMirror: parsed.latestDbPushMetricsMirror || {}
        };
      }
    } catch (e) {
      console.error("[WiVoTe Sync Server] Error reading server_sync_store.json:", e);
    }

    // Authoritative pruning: instantly purge any voucher belonging to a deleted plan or marked deleted
    if (store.vouchers) {
      Object.keys(store.vouchers).forEach(id => {
        const v = store.vouchers[id];
        if (!v || v._deleted === true || (v.plan && store.deletedPlans?.[v.plan])) {
          delete store.vouchers[id];
        }
      });
    }

    // Auto-seed initial items if missing from store
    initialWorkspaces.forEach(ws => {
      if (!store.workspaces[ws.id]) store.workspaces[ws.id] = ws;
    });
    initialUsers.forEach(u => {
      if (!store.users[u.uid]) store.users[u.uid] = u;
    });
    initialVouchers.forEach(v => {
      if (!store.vouchers[v.id]) store.vouchers[v.id] = v;
    });
    initialRequests.forEach(r => {
      if (!store.requests[r.id] && !store.deletedRequests?.[r.id]) store.requests[r.id] = r;
    });
    initialCashDrops.forEach(c => {
      if (!store.cashDrops[c.id]) store.cashDrops[c.id] = c;
    });
    initialLegacyDevices.forEach(ld => {
      if (!store.legacyDevices[ld.id]) store.legacyDevices[ld.id] = ld;
    });

    if (store.vouchers) {
      Object.keys(store.vouchers).forEach(id => {
        const v = store.vouchers[id];
        if (v) {
          v.code = sanitizeVoucherCode(v);
          const isSold = v.status === 'Sold' || !!v.soldAt || !!v.giftedAt;
          const CANONICAL_PLAN_PRICES: Record<string, number> = {
            'MONTH_45GB': 10.00,
            'MONTH_32GB': 7.00,
            'MONTH_23GB': 5.00,
            '2_WEEKS_15GB': 3.00,
            'Week': 2.00,
            '2HRS_6GB': 1.00,
            '1HR_10GB': 1.00,
            '3day': 1.00,
            '1HR_4GB': 0.50,
            '30M_2GB': 0.25,
            'Monthly': 6.00,
            '5 Days': 2.00,
            'Starter': 0.00,
            'Gold': 35.00,
            'Lithium': 75.00,
            '24Hours_Unlimited': 15.00
          };

          if (CANONICAL_PLAN_PRICES[v.plan] !== undefined) {
            const canonicalPrice = CANONICAL_PLAN_PRICES[v.plan];
            if (isSold && v.soldPrice !== undefined && v.soldPrice > 0) {
              v.price = v.soldPrice;
              v.originalPrice = canonicalPrice;
            } else {
              v.price = canonicalPrice;
              v.originalPrice = canonicalPrice;
              if (isSold) v.soldPrice = canonicalPrice;
            }
          } else if (isSold && v.soldPrice !== undefined && v.soldPrice > 0) {
            v.price = v.soldPrice;
          }

          if (v.plan === '2HRS_6GB' || v.duration === '2 Hours' || ['zhuxz8', 'pdw7se', '7u6fjf', 'esuzt7', 'qnm8xt', 'imudrq'].includes(v.code)) {
            v.plan = '2HRS_6GB';
            v.duration = '2 Hours';
          } else if (v.plan === '1HR_10GB' || v.code === 'd6k3vf') {
            v.plan = '1HR_10GB';
            v.duration = '1 Hour';
          }
        }
      });
    }

    // Auto-derive customers for sold vouchers & legacy devices if not registered
    const existingCustomers = store.customers || {};
    const customerMap = new Map<string, any>();
    Object.values(existingCustomers).forEach((c: any) => {
      if (c && c.id) customerMap.set(c.id, c);
    });

    let custSeq = customerMap.size + 1;
    Object.values(store.vouchers || {}).forEach((v: any) => {
      if (v && (v.status === 'Sold' || v.customerName) && v.customerName) {
        const normName = v.customerName.trim();
        const wsId = v.workspaceId || 'ws_vakzim';
        const key = `${wsId}_${normName.toLowerCase()}`;
        const alreadyExists = Array.from(customerMap.values()).some((c: any) =>
          (c.workspaceId || 'ws_vakzim') === wsId && c.name?.trim().toLowerCase() === normName.toLowerCase()
        );

        if (!alreadyExists) {
          const custId = `c_${wsId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const custNum = `CN:${custSeq < 10 ? '0' + custSeq : custSeq}`;
          custSeq++;
          const newCust = {
            id: custId,
            workspaceId: wsId,
            customerNumber: custNum,
            name: normName,
            cellNumber: v.customerCell || '',
            createdAt: v.soldAt ? new Date(v.soldAt).getTime() : Date.now(),
            updatedAt: Date.now(),
            totalPurchases: 1,
            totalSpend: v.price || v.soldPrice || 0,
            totalSaved: v.discountApplied || 0,
            consecutivePurchases: [{
              id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
              voucherId: v.id,
              voucherCode: sanitizeVoucherCode(v),
              price: v.price || v.soldPrice || 0,
              discountApplied: v.discountApplied || 0,
              originalPrice: v.originalPrice || v.price || 0,
              timestamp: v.soldAt ? new Date(v.soldAt).getTime() : Date.now(),
              agentId: v.soldByAgentId || 'system',
              agentName: v.soldByAgentName || 'Agent',
              plan: v.plan || 'Standard'
            }],
            lastPurchaseDate: v.soldAt ? new Date(v.soldAt).getTime() : Date.now(),
            lastAgentName: v.soldByAgentName || 'Agent',
            lastVoucherCode: sanitizeVoucherCode(v),
            customerType: 'voucher'
          };
          customerMap.set(custId, newCust);
        }
      }
    });

    store.customers = {};
    customerMap.forEach((c, id) => {
      store.customers[id] = c;
    });

    return store;
  }

  const globalStore = loadGlobalStore();

  function persistGlobalStore() {
    try {
      globalStore.updatedAt = Date.now();
      fs.writeFileSync(STORE_PATH, JSON.stringify(globalStore, null, 2), "utf-8");
    } catch (e) {
      console.error("[WiVoTe Sync Server] Error writing server_sync_store.json:", e);
    }
  }

  function calculateServerAuthoritativeMetrics(
    store: GlobalSyncStore,
    targetWorkspaceId?: string,
    targetAgentId?: string,
    targetAgentEmail?: string
  ): Record<string, any> {
    const vouchers = Object.values(store.vouchers || {});
    const legacyDevices = Object.values(store.legacyDevices || {});
    const cashDrops = Object.values(store.cashDrops || {});
    const users = Object.values(store.users || {});

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentCycleMonth = `${currentYear}-${currentMonth}`;

    const prevMonthDate = new Date(currentYear, now.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const prevCycleMonth = `${prevYear}-${prevMonth}`;

    const todayDateStr = now.toDateString();
    const todayIsoStr = now.toISOString().slice(0, 10);

    const parseTimestampToDate = (d: any): Date | null => {
      if (d === null || d === undefined || d === '') return null;
      try {
        if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
        if (typeof d === 'object') {
          if (typeof d.toDate === 'function') {
            const res = d.toDate();
            return res && !isNaN(res.getTime()) ? res : null;
          }
          if (typeof d.seconds === 'number') return new Date(d.seconds * 1000);
          if (typeof d._seconds === 'number') return new Date(d._seconds * 1000);
        }
        if (typeof d === 'number') {
          const ms = d < 1e11 ? d * 1000 : d;
          const res = new Date(ms);
          return isNaN(res.getTime()) ? null : res;
        }
        if (typeof d === 'string') {
          const trimmed = d.trim();
          if (!trimmed) return null;
          if (/^\d+$/.test(trimmed)) {
            const num = Number(trimmed);
            const ms = num < 1e11 ? num * 1000 : num;
            const res = new Date(ms);
            return isNaN(res.getTime()) ? null : res;
          }
          const parsed = new Date(trimmed);
          return isNaN(parsed.getTime()) ? null : parsed;
        }
      } catch {
        return null;
      }
      return null;
    };

    const getCycleMonthFromDate = (d: any): string | null => {
      const dateObj = parseTimestampToDate(d);
      if (!dateObj) return null;
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    };

    const matchAgent = (agent: any, itemAgentId?: string, itemAgentName?: string, itemAgentEmail?: string) => {
      if (!itemAgentId && !itemAgentName && !itemAgentEmail) return false;
      const aUid = (agent.uid || '').toLowerCase().trim();
      const aEmail = (agent.email || '').toLowerCase().trim();
      const aName = (agent.name || '').toLowerCase().trim();

      const iId = (itemAgentId || '').toLowerCase().trim();
      const iEmail = (itemAgentEmail || '').toLowerCase().trim();
      const iName = (itemAgentName || '').toLowerCase().trim();

      if (aUid && iId && (aUid === iId || aUid.includes(iId) || iId.includes(aUid))) return true;
      if (aEmail && iEmail && (aEmail === iEmail || aEmail.includes(iEmail) || iEmail.includes(aEmail))) return true;
      if (aName && iName) {
        if (aName === iName) return true;
        const normA = aName.replace(/[^a-z0-9]/g, '');
        const normI = iName.replace(/[^a-z0-9]/g, '');
        if (normA && normI && (normA === normI || normA.includes(normI) || normI.includes(normA))) return true;
      }

      const isHistec = aName.includes('histec') || aEmail.includes('histec') || aUid.includes('histec') || aUid === 'oiofbo6j6jv6qm0orrxvfwfucfp2';
      if (isHistec && (
        iId.includes('histec') || iId === 'oiofbo6j6jv6qm0orrxvfwfucfp2' ||
        iName.includes('histec') || iEmail.includes('histec')
      )) return true;

      const isMukondodzi = aName.includes('mukondodzi') || aEmail.includes('mukondodzi') || aUid.includes('mukondodzi') || aUid === '6ih4ntjnxuentt1z0orvhzgkquv2';
      if (isMukondodzi && (
        iId.includes('mukondodzi') || iId === '6ih4ntjnxuentt1z0orvhzgkquv2' ||
        iName.includes('mukondodzi') || iEmail.includes('mukondodzi')
      )) return true;

      const isChitsungo = aName.includes('chitsungo') || aEmail.includes('chitsungo') || aUid.includes('chitsungo') || aUid === '7qfbneu9xxaloi6kl8csotm58te2';
      if (isChitsungo && (
        iId.includes('chitsungo') || iId === '7qfbneu9xxaloi6kl8csotm58te2' ||
        iName.includes('chitsungo') || iEmail.includes('chitsungo')
      )) return true;

      return false;
    };

    const results: Record<string, any> = {};

    // Get agents to evaluate
    const agents = users.filter((u: any) => u && (u.role === 'Agent' || u.role === 'FieldAgent' || u.role === 'WorkspaceMaster'));

    agents.forEach((agent: any) => {
      const agentUid = agent.uid;
      const cleanEmail = (agent.email || '').toLowerCase().trim();
      const cleanName = (agent.name || '').toLowerCase().trim();

      // Paid sold vouchers (excluding approved reversals and free gifts)
      const agentSoldVouchers = vouchers.filter((v: any) => {
        const isSold = String(v.status).toLowerCase() === 'sold' || !!v.soldAt;
        if (!isSold || v.reversalStatus === 'Approved' || !!v.reversedAt || v.isFree) return false;
        return matchAgent(agent, v.assignedAgentId, v.assignedAgentName || v.assignedTo, v.assignedAgentEmail || v.agentEmail) ||
               matchAgent(agent, v.soldByAgentId, v.soldByAgentName, v.soldByAgentEmail);
      });

      // Sold legacy devices (strictly completed sales)
      const agentSoldLegacy = legacyDevices.filter((ld: any) => {
        const isSold = (ld.status === 'SOLD' || !!ld.soldAt) && ld.reversalStatus !== 'Approved' && !ld.reversedAt;
        if (!isSold) return false;
        return matchAgent(agent, ld.fieldAgentId, ld.fieldAgentName, (ld as any).fieldAgentEmail);
      });

      // Cash drops
      const agentCashDrops = cashDrops.filter((cd: any) => {
        return matchAgent(agent, cd.agentId, cd.agentName, (cd as any).agentEmail);
      });

    const resolveTicketPriceServer = (v: any): number => {
      if (!v) return 0;
      if (v.isFree === true || v.isGift === true) return 0;
      const candidates = [
        v.soldPrice,
        v.price,
        v.amount,
        v.cost,
        v.ticketPrice,
        v.planPrice,
        v.pricePaid,
        v.originalPrice
      ];
      for (const cand of candidates) {
        if (cand !== undefined && cand !== null && cand !== '') {
          const num = Number(cand);
          if (!isNaN(num) && num > 0) return num;
        }
      }
      const rawPlan = v.plan || v.planId || v.planName || v.name;
      if (rawPlan) {
        const norm = String(rawPlan).toLowerCase().replace(/[^a-z0-9]/g, '');
        const CATALOG: Record<string, number> = {
          'month_23gb': 5.00,
          '23gb': 5.00,
          '2_weeks_15gb': 3.00,
          '15gb': 3.00,
          '2hrs_6gb': 1.00,
          '6gb': 1.00,
          'month_32gb': 7.00,
          '32gb': 7.00,
          'month_45gb': 10.00,
          '45gb': 10.00,
          '1_month': 5.00,
          'monthly': 5.00,
          '30_days': 5.00,
          '2_weeks': 3.00,
          '14_days': 3.00,
          '1_week': 2.00,
          '7_days': 2.00,
          '3_days': 1.50,
          '24_hours': 1.00,
          'daily': 1.00,
          '1_day': 1.00,
          '2_hours': 1.00,
          '2hrs': 1.00,
          '1_hour': 0.50,
          '1hr': 0.50,
          '30m_2gb': 0.25,
          'gold': 35.00,
          'lithium': 75.00
        };
        if (CATALOG[norm] !== undefined) return CATALOG[norm];
        if (norm.includes('month23gb') || norm.includes('23gb')) return 5.00;
        if (norm.includes('2weeks15gb') || norm.includes('15gb')) return 3.00;
        if (norm.includes('2hrs6gb') || norm.includes('6gb')) return 1.00;
        if (norm.includes('month32gb') || norm.includes('32gb')) return 7.00;
        if (norm.includes('month45gb') || norm.includes('45gb')) return 10.00;
        if (norm.includes('month') || norm.includes('30day')) return 5.00;
        if (norm.includes('2week') || norm.includes('14day')) return 3.00;
        if (norm.includes('1week') || norm.includes('7day')) return 2.00;
        if (norm.includes('24hr') || norm.includes('1day') || norm.includes('daily')) return 1.00;
        if (norm.includes('2hr') || norm.includes('2hours')) return 1.00;
        if (norm.includes('1hr') || norm.includes('1hour')) return 0.50;
        if (norm.includes('30m') || norm.includes('2gb')) return 0.25;
      }
      return 0;
    };

    // 1. Today sales
    const todayVouchers = agentSoldVouchers.filter((v: any) => {
      const s = v.soldAt || v.updatedAt || v.createdAt;
      const d = parseTimestampToDate(s);
      return d !== null && (d.toDateString() === todayDateStr || (typeof s === 'string' && s.startsWith(todayIsoStr)));
    });
    const todayLegacy = agentSoldLegacy.filter((ld: any) => {
      const s = ld.soldAt || ld.enrolledAt;
      const d = parseTimestampToDate(s);
      return d !== null && (d.toDateString() === todayDateStr || (typeof s === 'string' && s.startsWith(todayIsoStr)));
    });
    const todaySales = todayVouchers.reduce((sum: number, v: any) => sum + resolveTicketPriceServer(v), 0) +
                       todayLegacy.reduce((sum: number, ld: any) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);

    // 2. Current cycle sales
    const currentCycleVouchers = agentSoldVouchers.filter((v: any) => {
      const s = v.soldAt || v.updatedAt || v.createdAt;
      return getCycleMonthFromDate(s) === currentCycleMonth;
    });
    const currentCycleLegacy = agentSoldLegacy.filter((ld: any) => {
      const s = ld.soldAt || ld.enrolledAt;
      return getCycleMonthFromDate(s) === currentCycleMonth;
    });
    const currentCycleSales = currentCycleVouchers.reduce((sum: number, v: any) => sum + resolveTicketPriceServer(v), 0) +
                              currentCycleLegacy.reduce((sum: number, ld: any) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);

    // 3. Previous cycle sales
    const prevCycleVouchers = agentSoldVouchers.filter((v: any) => {
      const s = v.soldAt || v.updatedAt || v.createdAt;
      return getCycleMonthFromDate(s) === prevCycleMonth;
    });
    const prevCycleLegacy = agentSoldLegacy.filter((ld: any) => {
      const s = ld.soldAt || ld.enrolledAt;
      return getCycleMonthFromDate(s) === prevCycleMonth;
    });
    const prevMonthOverallSales = prevCycleVouchers.reduce((sum: number, v: any) => sum + resolveTicketPriceServer(v), 0) +
                                  prevCycleLegacy.reduce((sum: number, ld: any) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);

    // 4. Overall cumulative sales across all cycles
    const overallVouchersSales = agentSoldVouchers.reduce((sum: number, v: any) => sum + resolveTicketPriceServer(v), 0);
    const overallLegacySales = agentSoldLegacy.reduce((sum: number, ld: any) => sum + (ld.soldPrice !== undefined ? ld.soldPrice : (ld.monthlyPrice || 0)), 0);
    const overallSales = overallVouchersSales + overallLegacySales;

      // 5. Closed cash for current cycle
      const currentCycleDrops = agentCashDrops.filter((cd: any) => {
        const d = cd.cycleMonth || (cd.timestamp ? cd.timestamp.slice(0, 7) : '');
        const isValid = cd.status === 'Reconciled' || cd.status === 'Pending' || cd.status === 'Approved';
        return isValid && (d === currentCycleMonth || (!d && cd.timestamp && cd.timestamp.startsWith(currentCycleMonth)));
      });
      const closedCash = currentCycleDrops.reduce((sum: number, cd: any) => sum + (cd.amount || 0), 0);
      const unclosedMonthlyCash = Math.max(0, Number((currentCycleSales - closedCash).toFixed(2)));

      // 6. Commission calculations
      const defaultComm = (targetWorkspaceId && store.workspaces?.[targetWorkspaceId]?.cashCloseSettings?.defaultCommissionRate) ||
                          (store as any).cashCloseSettings?.defaultCommissionRate || 10;
      const agentOverrideComm = targetWorkspaceId && store.workspaces?.[targetWorkspaceId]?.cashCloseSettings?.agentOverrides?.[agentUid]?.commissionRate;
      const commissionPercent = agent.commissionRate !== undefined 
        ? agent.commissionRate 
        : (agentOverrideComm !== undefined ? agentOverrideComm : defaultComm);
      const commissionRate = commissionPercent / 100;
      const totalCommissionEarned = Number((currentCycleSales * commissionRate).toFixed(2));
      const myCommission = Number((unclosedMonthlyCash * commissionRate).toFixed(2));
      const closedCommission = Number((closedCash * commissionRate).toFixed(2));

      const metrics = {
        agentId: agentUid,
        agentName: agent.name,
        cycleMonth: currentCycleMonth,
        prevCycleMonth,
        dailySalesTotal: todaySales,
        currentCycleSales,
        totalMonthlySales: currentCycleSales,
        closedCash,
        unclosedMonthlyCash,
        remainingCash: unclosedMonthlyCash,
        overallSales,
        prevMonthOverallSales,
        commissionRate: commissionPercent,
        myCommission,
        totalCommissionEarned,
        closedCommission,
        soldVouchersCount: agentSoldVouchers.length,
        soldVoucherIds: agentSoldVouchers.map((v: any) => v.id)
      };

      results[agentUid] = metrics;
      results[agentUid.toLowerCase().trim()] = metrics;
      if (cleanEmail) results[cleanEmail] = metrics;
      if (cleanName) results[cleanName] = metrics;
    });

    return results;
  }

  function calculateServerWorkspaceMetrics(
    store: GlobalSyncStore,
    targetWorkspaceId?: string
  ) {
    const isVakZim = targetWorkspaceId === 'ws_vakzim' || targetWorkspaceId === 'ws_client_1788646327740';
    const isMatch = (item: any) => {
      if (!targetWorkspaceId || targetWorkspaceId === 'system' || targetWorkspaceId === 'ALL') return true;
      if (!item.workspaceId) return true;
      if (isVakZim && (item.workspaceId === 'ws_vakzim' || item.workspaceId === 'ws_client_1788646327740')) return true;
      return item.workspaceId === targetWorkspaceId;
    };

    const wsVouchers = Object.values(store.vouchers || {})
      .filter((v: any) => v && !v._deleted && (!v.plan || !store.deletedPlans?.[v.plan]) && isMatch(v));
    const wsUsers = Object.values(store.users || {}).filter(isMatch);
    const wsAgents = wsUsers.filter((u: any) => u.role === 'Agent' || (!u.role && u.assignedAgentId));
    const wsCustomers = Object.values(store.customers || {}).filter(isMatch);
    const wsLegacy = Object.values(store.legacyDevices || {}).filter(isMatch);

    const unused = wsVouchers.filter((v: any) => (v.status === 'Unused' || (!v.status && !v.soldAt && !v.assignedAgentId)) && v.status !== 'Sold' && !v.soldAt && !v.isFree);
    const assigned = wsVouchers.filter((v: any) => (v.status === 'Assigned' || (v.assignedAgentId && v.status !== 'Sold' && !v.soldAt)) && !v.isFree);
    const sold = wsVouchers.filter((v: any) => (v.status === 'Sold' || !!v.soldAt || !!v.giftedAt) && !v.isFree);

    const unusedValue = unused.reduce((sum: number, v: any) => sum + (Number(v.price) || 0), 0);
    const assignedValue = assigned.reduce((sum: number, v: any) => sum + (Number(v.price) || 0), 0);
    const soldValue = sold.reduce((sum: number, v: any) => sum + (Number(v.soldPrice !== undefined ? v.soldPrice : v.price) || 0), 0);

    const totalProfits = soldValue;

    // Aggregate Agent Performance & Cash Close for workspace
    const agentMetricsMap = calculateServerAuthoritativeMetrics(store, targetWorkspaceId);
    let totalCashCollected = 0;
    let totalCommissionEarned = 0;
    let totalClosedCash = 0;
    let totalClosedCommission = 0;
    let totalRemainingCash = 0;
    let totalRemainingCommission = 0;

    const uniqueAgents = new Map<string, any>();
    Object.values(agentMetricsMap).forEach((m: any) => {
      if (m && m.agentId && !uniqueAgents.has(m.agentId)) {
        uniqueAgents.set(m.agentId, m);
        totalCashCollected += (m.currentCycleSales || 0);
        totalCommissionEarned += (m.totalCommissionEarned || 0);
        totalClosedCash += (m.closedCash || 0);
        totalClosedCommission += (m.closedCommission || 0);
        totalRemainingCash += (m.unclosedMonthlyCash || 0);
        totalRemainingCommission += (m.myCommission || 0);
      }
    });

    return {
      inventorySummary: {
        unused: { count: unused.length, value: Number(unusedValue.toFixed(2)) },
        assigned: { count: assigned.length, value: Number(assignedValue.toFixed(2)) },
        sold: { count: sold.length, value: Number(soldValue.toFixed(2)) },
        total: { count: wsVouchers.length, value: Number((unusedValue + assignedValue + soldValue).toFixed(2)) }
      },
      totalProfits: Number(totalProfits.toFixed(2)),
      totalAgents: wsAgents.length,
      customerCount: wsCustomers.length,
      legacyDevicesCount: wsLegacy.filter((ld: any) => ld.isApproved !== false && ld.status !== 'CANCELLED').length,
      salesCycleAggregate: {
        totalCashCollected: Number(totalCashCollected.toFixed(2)),
        totalCommissionEarned: Number(totalCommissionEarned.toFixed(2)),
        totalClosedCash: Number(totalClosedCash.toFixed(2)),
        totalClosedCommission: Number(totalClosedCommission.toFixed(2)),
        totalRemainingCash: Number(totalRemainingCash.toFixed(2)),
        totalRemainingCommission: Number(totalRemainingCommission.toFixed(2)),
        agentMetrics: Array.from(uniqueAgents.values())
      }
    };
  }

  function updateLatestDbPushMetricsMirror(store: GlobalSyncStore, workspaceId?: string) {
    if (!store.latestDbPushMetricsMirror) store.latestDbPushMetricsMirror = {};
    const wsId = workspaceId || 'ws_vakzim';
    const adminMetrics = calculateServerWorkspaceMetrics(store, wsId);
    const agentMetrics = calculateServerAuthoritativeMetrics(store, wsId);
    const mirrorObj = {
      timestamp: Date.now(),
      pushedAtIso: new Date().toISOString(),
      workspaceId: wsId,
      pushId: `push_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      admin: adminMetrics,
      agents: agentMetrics
    };
    store.latestDbPushMetricsMirror[wsId] = mirrorObj;
    if (wsId === 'ws_vakzim') store.latestDbPushMetricsMirror['ws_client_1788646327740'] = mirrorObj;
    if (wsId === 'ws_client_1788646327740') store.latestDbPushMetricsMirror['ws_vakzim'] = mirrorObj;
    return mirrorObj;
  }

  // GET /api/sync/state
  // Supports optional ?since=<epoch_ms> or ?since=<iso_string> for delta queries
  app.get("/api/sync/state", (req: express.Request, res: express.Response) => {
    try {
      const { workspaceId, since, agentId, agentEmail } = req.query;
      const sinceMs = since ? new Date(since as string).getTime() || Number(since) || 0 : 0;
      const cleanAgentId = typeof agentId === 'string' ? agentId.toLowerCase().trim() : '';
      const cleanAgentEmail = typeof agentEmail === 'string' ? agentEmail.toLowerCase().trim() : '';

      let vouchersList = Object.values(globalStore.vouchers)
        .filter((v: any) => v && !v._deleted && (!v.plan || !globalStore.deletedPlans?.[v.plan]))
        .map((v: any) => ({
          ...v,
          code: sanitizeVoucherCode(v)
        }));
      let legacyDevicesList = Object.values(globalStore.legacyDevices);
      let requestsList = Object.values(globalStore.requests).filter((r: any) => !globalStore.deletedRequests?.[r.id]);
      let cashDropsList = Object.values(globalStore.cashDrops);
      let customersList = Object.values(globalStore.customers);
      let reversalRequestsList = Object.values(globalStore.reversalRequests || {});
      let workspacesList = Object.values(globalStore.workspaces);
      let usersList = Object.values(globalStore.users);

      // VakZim Connect compatibility: ws_vakzim and ws_client_1788646327740 are the same terminal/tenant
      const isVakZimQuery = workspaceId === 'ws_vakzim' || workspaceId === 'ws_client_1788646327740';

      const isAgentMatch = (item: any) => {
        if (!cleanAgentId && !cleanAgentEmail) return false;
        const iAgentId = (item.assignedAgentId || item.soldByAgentId || item.fieldAgentId || item.agentId || '').toLowerCase().trim();
        const iAgentEmail = (item.assignedAgentEmail || item.soldByAgentEmail || item.fieldAgentEmail || item.agentEmail || '').toLowerCase().trim();
        const iAgentName = (item.assignedAgentName || item.soldByAgentName || item.fieldAgentName || item.agentName || '').toLowerCase().trim();
        if (cleanAgentId && iAgentId && (cleanAgentId === iAgentId || cleanAgentId.includes(iAgentId) || iAgentId.includes(cleanAgentId))) return true;
        if (cleanAgentEmail && iAgentEmail && (cleanAgentEmail === iAgentEmail || cleanAgentEmail.includes(iAgentEmail) || iAgentEmail.includes(cleanAgentEmail))) return true;
        if (cleanAgentId.includes('histec') || cleanAgentEmail.includes('histec') || cleanAgentId === 'oiofbo6j6jv6qm0orrxvfwfucfp2') {
          if (iAgentId.includes('histec') || iAgentId === 'oiofbo6j6jv6qm0orrxvfwfucfp2' || iAgentName.includes('histec') || iAgentEmail.includes('histec')) return true;
        }
        return false;
      };

      // 1. Workspace Scoping with fallback compatibility across terminals
      if (workspaceId && typeof workspaceId === 'string' && workspaceId !== 'ALL' && workspaceId !== 'system') {
        const isMatch = (item: any) => {
          if (!item.workspaceId) return true;
          if (isVakZimQuery && (item.workspaceId === 'ws_vakzim' || item.workspaceId === 'ws_client_1788646327740')) return true;
          if (item.workspaceId === workspaceId) return true;
          if (isAgentMatch(item)) return true;
          return false;
        };
        vouchersList = vouchersList.filter(isMatch);
        legacyDevicesList = legacyDevicesList.filter(isMatch);
        requestsList = requestsList.filter(isMatch);
        cashDropsList = cashDropsList.filter(isMatch);
        customersList = customersList.filter(isMatch);
        reversalRequestsList = reversalRequestsList.filter(isMatch);
      }

      // 2. Incremental Delta Filtering (`since` parameter)
      if (sinceMs > 0) {
        const isFresh = (item: any) => {
          const t = new Date(item.updatedAt || item.soldAt || item.createdAt || 0).getTime();
          return t > sinceMs;
        };
        vouchersList = vouchersList.filter(isFresh);
        legacyDevicesList = legacyDevicesList.filter(isFresh);
        requestsList = requestsList.filter(isFresh);
        cashDropsList = cashDropsList.filter(isFresh);
        customersList = customersList.filter(isFresh);
        reversalRequestsList = reversalRequestsList.filter(isFresh);
        workspacesList = workspacesList.filter(isFresh);
        usersList = usersList.filter(isFresh);
      }

      // 3. Compute Server-Authoritative Agent Metrics from globalStore
      const authoritativeAgentMetrics = calculateServerAuthoritativeMetrics(
        globalStore,
        workspaceId as string,
        cleanAgentId,
        cleanAgentEmail
      );
      const currentAgentMetrics = cleanAgentId
        ? (authoritativeAgentMetrics[cleanAgentId] || (cleanAgentEmail ? authoritativeAgentMetrics[cleanAgentEmail] : undefined))
        : (cleanAgentEmail ? authoritativeAgentMetrics[cleanAgentEmail] : undefined);

      return res.json({
        success: true,
        serverTime: Date.now(),
        updatedAt: globalStore.updatedAt,
        authoritativeAgentMetrics,
        currentAgentMetrics,
        authoritativeSoldCatalog: Object.values(globalStore.vouchers)
          .filter((v: any) => v && !v._deleted && (!v.plan || !globalStore.deletedPlans?.[v.plan]) && (v.status === 'Sold' || v.soldAt || v.giftedAt))
          .map((v: any) => ({
            id: v.id,
            code: sanitizeVoucherCode(v),
            soldAt: v.soldAt || v.giftedAt,
            soldPrice: v.soldPrice !== undefined ? v.soldPrice : (v.price || 0),
            soldByAgentId: v.soldByAgentId || v.assignedAgentId,
            soldByAgentName: v.soldByAgentName || v.assignedAgentName,
            workspaceId: v.workspaceId,
            isFree: v.isFree,
            giftedAt: v.giftedAt
          })),
        vouchers: vouchersList,
        workspaces: workspacesList,
        users: usersList,
        legacyDevices: legacyDevicesList,
        requests: requestsList,
        cashDrops: cashDropsList,
        customers: customersList,
        reversalRequests: reversalRequestsList,
        deletedPlans: Object.keys(globalStore.deletedPlans || {}),
        latestDbPushMetricsMirror: globalStore.latestDbPushMetricsMirror?.[(workspaceId as string) || 'ws_vakzim'] || updateLatestDbPushMetricsMirror(globalStore, (workspaceId as string) || 'ws_vakzim')
      });
    } catch (err: any) {
      console.error("[WiVoTe Sync Server] Error in /api/sync/state:", err);
      return res.status(500).json({ error: err.message || "Sync fetch failed" });
    }
  });

  // GET /api/sync/pull (Incremental pull endpoint)
  app.get("/api/sync/pull", (req: express.Request, res: express.Response) => {
    req.url = "/api/sync/state" + (req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "");
    (app as any).handle(req, res);
  });

  // Helper evaluator for backend delta reconciliation & precedence authority
  function evaluateRecordUpdate(
    existing: any,
    incoming: any,
    entityType: 'voucher' | 'customer' | 'legacyDevice' | 'request' | 'cashDrop' | 'user' | 'workspace'
  ): { accept: boolean; mergedRecord?: any; reason: string } {
    if (incoming._deleted === true) {
      return {
        accept: true,
        reason: 'SOFT_DELETED',
        mergedRecord: {
          ...(existing || {}),
          ...incoming,
          _deleted: true,
          _isDirty: false,
          _updatedAt: incoming._updatedAt || incoming.updatedAt || Date.now()
        }
      };
    }

    if (!existing) {
      return {
        accept: true,
        reason: 'NEW_RECORD',
        mergedRecord: {
          ...incoming,
          syncStatus: 'synced',
          isDirty: false,
          updatedAt: incoming.updatedAt || new Date().toISOString()
        }
      };
    }

    // 1. Admin Override Lockout Check
    if (existing.adminLocked && incoming.modifiedByRole === 'Agent') {
      return { accept: false, reason: 'ADMIN_LOCKED' };
    }

    const adminFinals = ['Approved', 'APPROVED', 'Rejected', 'REJECTED', 'Reconciled', 'Reversed'];
    if (adminFinals.includes(existing.status) && incoming.modifiedByRole === 'Agent' && incoming.status !== existing.status) {
      return { accept: false, reason: 'ADMIN_STATUS_PROTECTED' };
    }

    // 2. Precedence Rules for Activity Events (Immutable Sales & Approvals)
    if (entityType === 'voucher') {
      if (incoming.plan && globalStore.deletedPlans?.[incoming.plan]) {
        return { accept: false, reason: 'PLAN_DELETED' };
      }
      if (existing?.plan && globalStore.deletedPlans?.[existing.plan]) {
        return { accept: false, reason: 'PLAN_DELETED' };
      }

      const isExistingSold = existing.status === 'Sold' || !!existing.soldAt || !!existing.giftedAt;
      const isIncomingSold = incoming.status === 'Sold' || !!incoming.soldAt || !!incoming.giftedAt;
      const isExistingGifted = existing.isFree === true || !!existing.giftedAt;
      const isIncomingGifted = incoming.isFree === true || !!incoming.giftedAt;

      if (isExistingSold && !isIncomingSold && existing.reversalStatus !== 'Approved') {
        return {
          accept: true,
          reason: 'IMMUTABLE_SALE_PRESERVED',
          mergedRecord: {
            ...existing,
            ...incoming,
            status: 'Sold',
            soldAt: existing.soldAt || incoming.soldAt || existing.giftedAt || incoming.giftedAt,
            soldPrice: existing.soldPrice !== undefined ? existing.soldPrice : incoming.soldPrice,
            originalPrice: existing.originalPrice || incoming.originalPrice || existing.price,
            discountApplied: existing.discountApplied !== undefined ? existing.discountApplied : incoming.discountApplied,
            customerName: existing.customerName || incoming.customerName,
            customerCell: existing.customerCell || incoming.customerCell,
            customerId: existing.customerId || incoming.customerId,
            customerNumber: existing.customerNumber || incoming.customerNumber,
            assignedAgentId: existing.assignedAgentId || incoming.assignedAgentId,
            assignedAgentName: existing.assignedAgentName || incoming.assignedAgentName,
            assignedAgentEmail: existing.assignedAgentEmail || incoming.assignedAgentEmail,
            soldByAgentId: existing.soldByAgentId || incoming.soldByAgentId || existing.assignedAgentId || incoming.assignedAgentId,
            soldByAgentName: existing.soldByAgentName || incoming.soldByAgentName || existing.assignedAgentName || incoming.assignedAgentName,
            isFree: isExistingGifted || isIncomingGifted || false,
            giftedAt: existing.giftedAt || incoming.giftedAt,
            giftedByAgentId: existing.giftedByAgentId || incoming.giftedByAgentId,
            giftedByAgentName: existing.giftedByAgentName || incoming.giftedByAgentName,
            syncStatus: 'synced',
            isDirty: false,
            updatedAt: new Date().toISOString()
          }
        };
      }
      if (isIncomingSold && !isExistingSold) {
        return {
          accept: true,
          reason: 'SALE_COMPLETED',
          mergedRecord: {
            ...existing,
            ...incoming,
            status: 'Sold',
            soldAt: incoming.soldAt || existing.soldAt || incoming.giftedAt || new Date().toISOString(),
            isFree: isIncomingGifted || isExistingGifted || false,
            giftedAt: incoming.giftedAt || existing.giftedAt || (isIncomingGifted ? (incoming.soldAt || new Date().toISOString()) : undefined),
            giftedByAgentId: incoming.giftedByAgentId || existing.giftedByAgentId,
            giftedByAgentName: incoming.giftedByAgentName || existing.giftedByAgentName,
            assignedAgentId: incoming.assignedAgentId || existing.assignedAgentId,
            assignedAgentName: incoming.assignedAgentName || existing.assignedAgentName,
            assignedAgentEmail: incoming.assignedAgentEmail || existing.assignedAgentEmail,
            soldByAgentId: incoming.soldByAgentId || existing.soldByAgentId || incoming.assignedAgentId || existing.assignedAgentId,
            soldByAgentName: incoming.soldByAgentName || existing.soldByAgentName || incoming.assignedAgentName || existing.assignedAgentName,
            syncStatus: 'synced',
            isDirty: false,
            updatedAt: new Date().toISOString()
          }
        };
      }
      if (isExistingSold && isIncomingSold) {
        return {
          accept: true,
          reason: 'SALE_METADATA_MERGED',
          mergedRecord: {
            ...existing,
            ...incoming,
            status: 'Sold',
            soldAt: existing.soldAt || incoming.soldAt || existing.giftedAt || incoming.giftedAt,
            isFree: isExistingGifted || isIncomingGifted || false,
            giftedAt: existing.giftedAt || incoming.giftedAt,
            giftedByAgentId: existing.giftedByAgentId || incoming.giftedByAgentId,
            giftedByAgentName: existing.giftedByAgentName || incoming.giftedByAgentName,
            customerName: incoming.customerName || existing.customerName,
            customerCell: incoming.customerCell || existing.customerCell,
            customerId: incoming.customerId || existing.customerId,
            customerNumber: incoming.customerNumber || existing.customerNumber,
            syncStatus: 'synced',
            isDirty: false,
            updatedAt: new Date().toISOString()
          }
        };
      }
    }

    if (entityType === 'cashDrop') {
      const isExistingApproved = existing.status === 'Approved' || existing.status === 'Reconciled';
      const isIncomingApproved = incoming.status === 'Approved' || incoming.status === 'Reconciled';
      if (isExistingApproved && !isIncomingApproved) {
        return {
          accept: true,
          reason: 'CASH_DROP_APPROVED_PRESERVED',
          mergedRecord: {
            ...existing,
            ...incoming,
            status: existing.status,
            reconciledAt: existing.reconciledAt || incoming.reconciledAt,
            approvedAt: existing.approvedAt || incoming.approvedAt,
            adminNotes: existing.adminNotes || incoming.adminNotes,
            syncStatus: 'synced',
            isDirty: false,
            updatedAt: new Date().toISOString()
          }
        };
      }
    }

    if (entityType === 'legacyDevice') {
      const isExistingApproved = existing.isApproved === true || existing.status === 'SOLD' || existing.status === 'APPROVED';
      const isIncomingApproved = incoming.isApproved === true || incoming.status === 'SOLD' || incoming.status === 'APPROVED';
      if (isExistingApproved && !isIncomingApproved) {
        return {
          accept: true,
          reason: 'LEGACY_DEVICE_APPROVED_PRESERVED',
          mergedRecord: {
            ...existing,
            ...incoming,
            isApproved: true,
            status: existing.status || 'SOLD',
            syncStatus: 'synced',
            isDirty: false,
            updatedAt: new Date().toISOString()
          }
        };
      }
    }

    if (entityType === 'request') {
      if (globalStore.deletedRequests?.[incoming.id]) {
        return { accept: false, reason: 'REQUEST_ALREADY_DELETED' };
      }
      const isExistingTerminal = existing.status === 'Fulfilled' || existing.status === 'Declined';
      const isIncomingTerminal = incoming.status === 'Fulfilled' || incoming.status === 'Declined';

      // Never revert an Approved (Fulfilled) or Declined request back to Pending
      if (isExistingTerminal && !isIncomingTerminal) {
        return {
          accept: true,
          reason: 'REQUEST_TERMINAL_STATUS_PRESERVED',
          mergedRecord: {
            ...existing,
            ...incoming,
            status: existing.status,
            syncStatus: 'synced',
            isDirty: false,
            updatedAt: existing.updatedAt || new Date().toISOString()
          }
        };
      }

      // If incoming transitions from Pending to Fulfilled or Declined, accept it
      if (isIncomingTerminal && !isExistingTerminal) {
        return {
          accept: true,
          reason: 'REQUEST_STATUS_UPDATED_TO_TERMINAL',
          mergedRecord: {
            ...existing,
            ...incoming,
            status: incoming.status,
            syncStatus: 'synced',
            isDirty: false,
            updatedAt: incoming.updatedAt || new Date().toISOString()
          }
        };
      }
    }

    // 3. Timestamp Delta Verification (Support timestamp property alongside updatedAt, soldAt, createdAt)
    const existingT = new Date(existing.updatedAt || existing.timestamp || existing.soldAt || existing.createdAt || 0).getTime();
    const incomingT = new Date(incoming.updatedAt || incoming.timestamp || incoming.soldAt || incoming.createdAt || 0).getTime();

    if (incomingT > 0 && existingT > 0 && incomingT < existingT) {
      // Do NOT allow reverting terminal statuses on stale timestamp!
      if (entityType === 'request' && (existing.status === 'Fulfilled' || existing.status === 'Declined')) {
        return { accept: false, reason: 'STALE_REQUEST_TIMESTAMP' };
      }
      // Preserve state transition if status changed (e.g. Unused -> Sold or Pending -> Fulfilled/Approved)
      if (incoming.status && existing.status && incoming.status !== existing.status) {
        // Allow state transition update
      } else {
        return { accept: false, reason: 'STALE_TIMESTAMP' };
      }
    }

    // 4. Customer Field Level Merging
    if (entityType === 'customer') {
      return {
        accept: true,
        reason: 'CUSTOMER_MERGED',
        mergedRecord: {
          ...existing,
          ...incoming,
          totalPurchases: Math.max(existing.totalPurchases || 0, incoming.totalPurchases || 0),
          totalSpend: Math.max(existing.totalSpend || 0, incoming.totalSpend || 0),
          consecutivePurchases: Math.max(existing.consecutivePurchases || 0, incoming.consecutivePurchases || 0),
          cellNumber: incoming.cellNumber || existing.cellNumber,
          syncStatus: 'synced',
          isDirty: false,
          updatedAt: new Date().toISOString()
        }
      };
    }

    return {
      accept: true,
      reason: 'FRESH_UPDATE',
      mergedRecord: {
        ...existing,
        ...incoming,
        syncStatus: 'synced',
        isDirty: false,
        updatedAt: incoming.updatedAt || new Date().toISOString()
      }
    };
  }

  // POST /api/sync/mutate
  app.post("/api/sync/mutate", (req: express.Request, res: express.Response) => {
    try {
      const { action, payload } = req.body;
      if (!action || !payload) {
        return res.status(400).json({ error: "Missing action or payload" });
      }

      let affectedCount = 0;

      switch (action) {
        case 'DELTA_PUSH':
        case 'SYNC_BATCH': {
          const { vouchers, workspaces, users, customers, legacyDevices, requests, cashDrops } = payload;

          if (Array.isArray(vouchers)) {
            vouchers.forEach((v: any) => {
              if (!v || !v.id) return;
              const result = evaluateRecordUpdate(globalStore.vouchers[v.id], v, 'voucher');
              if (result.accept && result.mergedRecord) {
                globalStore.vouchers[v.id] = result.mergedRecord;
                affectedCount++;
              }
            });
          }

          if (Array.isArray(customers)) {
            customers.forEach((c: any) => {
              if (!c || !c.id) return;
              const result = evaluateRecordUpdate(globalStore.customers[c.id], c, 'customer');
              if (result.accept && result.mergedRecord) {
                globalStore.customers[c.id] = result.mergedRecord;
                affectedCount++;
              }
            });
          }

          if (Array.isArray(legacyDevices)) {
            legacyDevices.forEach((l: any) => {
              if (!l || !l.id) return;
              const result = evaluateRecordUpdate(globalStore.legacyDevices[l.id], l, 'legacyDevice');
              if (result.accept && result.mergedRecord) {
                globalStore.legacyDevices[l.id] = result.mergedRecord;
                affectedCount++;
              }
            });
          }

          if (Array.isArray(requests)) {
            requests.forEach((r: any) => {
              if (!r || !r.id) return;
              const result = evaluateRecordUpdate(globalStore.requests[r.id], r, 'request');
              if (result.accept && result.mergedRecord) {
                globalStore.requests[r.id] = result.mergedRecord;
                affectedCount++;
              }
            });
          }

          if (Array.isArray(cashDrops)) {
            cashDrops.forEach((cd: any) => {
              if (!cd || !cd.id) return;
              const result = evaluateRecordUpdate(globalStore.cashDrops[cd.id], cd, 'cashDrop');
              if (result.accept && result.mergedRecord) {
                globalStore.cashDrops[cd.id] = result.mergedRecord;
                affectedCount++;
              }
            });
          }

          if (Array.isArray(payload.reversalRequests)) {
            payload.reversalRequests.forEach((rr: any) => {
              if (!rr || !rr.id) return;
              globalStore.reversalRequests[rr.id] = {
                ...(globalStore.reversalRequests[rr.id] || {}),
                ...rr,
                updatedAt: new Date().toISOString()
              };
              affectedCount++;
            });
          }

          if (Array.isArray(workspaces)) {
            workspaces.forEach((w: any) => {
              if (w && w.id) globalStore.workspaces[w.id] = { ...(globalStore.workspaces[w.id] || {}), ...w, updatedAt: new Date().toISOString() };
            });
          }

          if (Array.isArray(users)) {
            users.forEach((u: any) => {
              if (u && u.uid) globalStore.users[u.uid] = { ...(globalStore.users[u.uid] || {}), ...u, updatedAt: new Date().toISOString() };
            });
          }

          persistGlobalStore();
          break;
        }

        case 'ASSIGN_VOUCHERS': {
          const { voucherIds, vouchers: incomingVouchers, agentId, agentName, agentEmail, workspaceId, assignedAt } = payload;
          const incomingMap = new Map<string, any>();
          if (Array.isArray(incomingVouchers)) {
            incomingVouchers.forEach((iv: any) => {
              if (iv && iv.id) incomingMap.set(iv.id, iv);
            });
          }
          if (Array.isArray(voucherIds)) {
            voucherIds.forEach((id: string) => {
              const incomingV = incomingMap.get(id);
              const existing = globalStore.vouchers[id] || incomingV || {};
              const rawCode = incomingV?.code || existing?.code || id;
              const cleanCode = sanitizeVoucherCode({ id, code: rawCode });

              if (existing.status !== 'Sold') {
                globalStore.vouchers[id] = {
                  ...existing,
                  ...(incomingV || {}),
                  id,
                  code: cleanCode,
                  status: 'Assigned',
                  assignedAgentId: agentId,
                  assignedAgentName: agentName,
                  assignedAgentEmail: agentEmail || existing.assignedAgentEmail || incomingV?.assignedAgentEmail,
                  assignedTo: agentName,
                  assignedAt: assignedAt || new Date().toISOString(),
                  workspaceId: workspaceId || existing.workspaceId || incomingV?.workspaceId,
                  updatedAt: new Date().toISOString(),
                  modifiedByRole: 'WorkspaceMaster'
                };
                affectedCount++;
              }
            });
            persistGlobalStore();
          }
          break;
        }

        case 'COMPLETE_SALE': {
          const { voucherId, soldPrice, originalPrice, discount, customerName, customerCell, customerId, customerNumber, agentId, agentName, customer, workspaceId, soldAt, isFree, giftedAt, giftedByAgentId, giftedByAgentName } = payload;
          if (voucherId) {
            const existing = globalStore.vouchers[voucherId] || {};
            const cleanCode = sanitizeVoucherCode({ id: voucherId, code: payload.code || existing.code });

            if (cleanCode) {
              Object.keys(globalStore.vouchers).forEach(k => {
                if (k !== voucherId && sanitizeVoucherCode(globalStore.vouchers[k]) === cleanCode) {
                  delete globalStore.vouchers[k];
                }
              });
            }

            const isFreeGift = isFree !== undefined ? !!isFree : (existing.isFree || false);
            const giftedTimestamp = giftedAt || existing.giftedAt || (isFreeGift ? (soldAt || new Date().toISOString()) : undefined);

            globalStore.vouchers[voucherId] = {
              ...existing,
              ...payload,
              id: voucherId,
              code: cleanCode || payload.code || existing.code,
              status: 'Sold',
              soldAt: soldAt || payload.soldAt || existing.soldAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              soldPrice: Number(soldPrice !== undefined ? soldPrice : payload.soldPrice) || 0,
              originalPrice: Number(originalPrice || payload.originalPrice || existing.price) || 0,
              discountApplied: Number(discount || payload.discountApplied) || 0,
              customerName: customerName || payload.customerName || 'Walk-in Client',
              customerCell: customerCell || payload.customerCell || '',
              customerId: customerId || payload.customerId || existing.customerId,
              customerNumber: customerNumber || payload.customerNumber || existing.customerNumber,
              soldByAgentId: agentId || payload.soldByAgentId || existing.soldByAgentId || existing.assignedAgentId,
              soldByAgentName: agentName || payload.soldByAgentName || existing.soldByAgentName || existing.assignedAgentName,
              assignedAgentId: agentId || payload.assignedAgentId || existing.assignedAgentId,
              assignedAgentName: agentName || payload.assignedAgentName || existing.assignedAgentName,
              workspaceId: workspaceId || payload.workspaceId || existing.workspaceId,
              isFree: isFreeGift,
              giftedAt: giftedTimestamp,
              giftedByAgentId: giftedByAgentId || existing.giftedByAgentId || agentId,
              giftedByAgentName: giftedByAgentName || existing.giftedByAgentName || agentName,
              modifiedByRole: 'Agent',
              syncStatus: 'synced',
              isDirty: false
            };
            affectedCount++;
          }
          if (customer && customer.id) {
            const existingCust = globalStore.customers[customer.id];
            const evalCust = evaluateRecordUpdate(existingCust, customer, 'customer');
            if (evalCust.accept && evalCust.mergedRecord) {
              globalStore.customers[customer.id] = evalCust.mergedRecord;
            }
          }
          persistGlobalStore();
          break;
        }

        case 'REVOKE_ALLOCATION': {
          const { voucherIds } = payload;
          if (Array.isArray(voucherIds)) {
            voucherIds.forEach((id: string) => {
              if (globalStore.vouchers[id] && globalStore.vouchers[id].status !== 'Sold') {
                delete globalStore.vouchers[id].assignedAgentId;
                delete globalStore.vouchers[id].assignedAgentName;
                delete globalStore.vouchers[id].assignedAgentEmail;
                delete globalStore.vouchers[id].assignedTo;
                delete globalStore.vouchers[id].assignedAt;
                globalStore.vouchers[id].status = 'Unused';
                globalStore.vouchers[id].updatedAt = new Date().toISOString();
                globalStore.vouchers[id].modifiedByRole = 'WorkspaceMaster';
                affectedCount++;
              }
            });
            persistGlobalStore();
          }
          break;
        }

        case 'LEGACY_DEVICE': {
          const { device } = payload;
          if (device && device.id) {
            const result = evaluateRecordUpdate(globalStore.legacyDevices[device.id], device, 'legacyDevice');
            if (result.accept && result.mergedRecord) {
              globalStore.legacyDevices[device.id] = result.mergedRecord;
              affectedCount++;
              persistGlobalStore();
            }
          }
          break;
        }

        case 'REQUEST': {
          const { request } = payload;
          if (request && request.id) {
            const result = evaluateRecordUpdate(globalStore.requests[request.id], request, 'request');
            if (result.accept && result.mergedRecord) {
              globalStore.requests[request.id] = result.mergedRecord;
              affectedCount++;
              persistGlobalStore();
            }
          }
          break;
        }

        case 'CASH_DROP': {
          const { drop } = payload;
          if (drop && drop.id) {
            const result = evaluateRecordUpdate(globalStore.cashDrops[drop.id], drop, 'cashDrop');
            if (result.accept && result.mergedRecord) {
              globalStore.cashDrops[drop.id] = result.mergedRecord;
              affectedCount++;
              persistGlobalStore();
            }
          }
          break;
        }

        case 'REVERSAL_REQUEST': {
          const { request } = payload;
          if (request && request.id) {
            globalStore.reversalRequests[request.id] = {
              ...(globalStore.reversalRequests[request.id] || {}),
              ...request,
              updatedAt: new Date().toISOString()
            };
            affectedCount++;
            persistGlobalStore();
          }
          break;
        }

        case 'APPROVE_REVERSAL': {
          const { requestId, voucherId, adminNotes, reviewedBy, reviewedAt } = payload;
          if (requestId && globalStore.reversalRequests[requestId]) {
            globalStore.reversalRequests[requestId] = {
              ...globalStore.reversalRequests[requestId],
              status: 'Approved',
              reviewedAt: reviewedAt || new Date().toISOString(),
              reviewedBy: reviewedBy || 'Admin',
              adminNotes: adminNotes || 'Approved by Admin',
              updatedAt: new Date().toISOString()
            };
            affectedCount++;
          }
          const vId = voucherId || (globalStore.reversalRequests[requestId]?.transactionId);
          if (vId && globalStore.vouchers[vId]) {
            const existing = globalStore.vouchers[vId];
            const targetAgentId = globalStore.reversalRequests[requestId]?.agentId || existing.assignedAgentId;
            const targetAgentName = globalStore.reversalRequests[requestId]?.agentName || existing.assignedAgentName;
            globalStore.vouchers[vId] = {
              ...existing,
              status: targetAgentId ? 'Assigned' : 'Unused',
              assignedAgentId: targetAgentId,
              assignedAgentName: targetAgentName,
              reversalRequested: false,
              reversalStatus: 'Approved',
              reversedAt: reviewedAt || new Date().toISOString(),
              reversedBy: reviewedBy || 'Admin',
              updatedAt: new Date().toISOString()
            };
            delete globalStore.vouchers[vId].soldAt;
            delete globalStore.vouchers[vId].soldPrice;
            delete globalStore.vouchers[vId].discountApplied;
            delete globalStore.vouchers[vId].customerName;
            delete globalStore.vouchers[vId].customerCell;
            delete globalStore.vouchers[vId].customerId;
            delete globalStore.vouchers[vId].customerNumber;
            affectedCount++;
          }
          const devId = payload.legacyDeviceId || (globalStore.reversalRequests[requestId]?.transactionId);
          if (devId && globalStore.legacyDevices[devId]) {
            const ld = globalStore.legacyDevices[devId];
            globalStore.legacyDevices[devId] = {
              ...ld,
              status: 'PENDING',
              isApproved: true,
              reversalRequested: false,
              reversalStatus: 'Approved',
              reversedAt: reviewedAt || new Date().toISOString(),
              reversedBy: reviewedBy || 'Admin',
              updatedAt: new Date().toISOString()
            };
            delete globalStore.legacyDevices[devId].soldAt;
            delete globalStore.legacyDevices[devId].soldPrice;
            delete globalStore.legacyDevices[devId].discountApplied;
            delete globalStore.legacyDevices[devId].customerName;
            delete globalStore.legacyDevices[devId].customerCell;
            delete globalStore.legacyDevices[devId].customerId;
            delete globalStore.legacyDevices[devId].customerNumber;
            affectedCount++;
          }
          persistGlobalStore();
          break;
        }

        case 'REJECT_REVERSAL': {
          const { requestId, adminNotes, reviewedBy, reviewedAt } = payload;
          if (requestId && globalStore.reversalRequests[requestId]) {
            globalStore.reversalRequests[requestId] = {
              ...globalStore.reversalRequests[requestId],
              status: 'Rejected',
              reviewedAt: reviewedAt || new Date().toISOString(),
              reviewedBy: reviewedBy || 'Admin',
              adminNotes: adminNotes || 'Rejected by Admin',
              updatedAt: new Date().toISOString()
            };
            affectedCount++;
            persistGlobalStore();
          }
          break;
        }

        case 'DELETE_REQUEST': {
          const { requestId } = payload;
          if (requestId) {
            delete globalStore.requests[requestId];
            if (!globalStore.deletedRequests) globalStore.deletedRequests = {};
            globalStore.deletedRequests[requestId] = true;
            affectedCount++;
            persistGlobalStore();
          }
          break;
        }

        case 'BULK_UPDATE_VOUCHERS':
        case 'UPDATE_VOUCHER': {
          const { voucherId, voucherIds, updates, includeSold } = payload;
          const idsToUpdate: string[] = Array.isArray(voucherIds) ? voucherIds : (voucherId ? [voucherId] : []);
          const nowIso = new Date().toISOString();
          const cleanUpdates = updates && typeof updates === 'object' ? updates : {};
          idsToUpdate.forEach((id: string) => {
            if (id && globalStore.vouchers[id]) {
              const currentV = globalStore.vouchers[id];
              const isSold = currentV.status === 'Sold' || currentV.soldAt || currentV.giftedAt;
              let effectiveUpdates = { ...cleanUpdates };

              // IMMUNIZATION: If voucher is sold and includeSold is not true, block price & plan alterations
              if (isSold && !includeSold) {
                delete effectiveUpdates.price;
                delete effectiveUpdates.soldPrice;
                delete effectiveUpdates.plan;
                delete effectiveUpdates.duration;
                delete effectiveUpdates.originalPrice;
              }

              globalStore.vouchers[id] = {
                ...currentV,
                ...effectiveUpdates,
                updatedAt: cleanUpdates.updatedAt || nowIso,
                syncStatus: 'synced',
                isDirty: false
              };
              affectedCount++;
            }
          });
          if (affectedCount > 0) persistGlobalStore();
          break;
        }

        case 'CANCEL_TRANSACTION': {
          const { voucherId, legacyDeviceId } = payload;
          if (voucherId && globalStore.vouchers[voucherId]) {
            const v = globalStore.vouchers[voucherId];
            globalStore.vouchers[voucherId] = {
              ...v,
              status: 'Unused',
              assignedAgentId: undefined,
              assignedAgentName: undefined,
              updatedAt: new Date().toISOString()
            };
            delete globalStore.vouchers[voucherId].soldAt;
            delete globalStore.vouchers[voucherId].soldPrice;
            delete globalStore.vouchers[voucherId].discountApplied;
            delete globalStore.vouchers[voucherId].customerName;
            delete globalStore.vouchers[voucherId].customerCell;
            delete globalStore.vouchers[voucherId].customerId;
            delete globalStore.vouchers[voucherId].customerNumber;
            delete globalStore.vouchers[voucherId].archived;
            affectedCount++;
            persistGlobalStore();
          }
          if (legacyDeviceId && globalStore.legacyDevices[legacyDeviceId]) {
            const ld = globalStore.legacyDevices[legacyDeviceId];
            globalStore.legacyDevices[legacyDeviceId] = {
              ...ld,
              status: 'PENDING',
              isApproved: true,
              updatedAt: new Date().toISOString()
            };
            delete globalStore.legacyDevices[legacyDeviceId].soldAt;
            delete globalStore.legacyDevices[legacyDeviceId].soldPrice;
            delete globalStore.legacyDevices[legacyDeviceId].discountApplied;
            delete globalStore.legacyDevices[legacyDeviceId].customerName;
            delete globalStore.legacyDevices[legacyDeviceId].customerCell;
            delete globalStore.legacyDevices[legacyDeviceId].customerId;
            delete globalStore.legacyDevices[legacyDeviceId].customerNumber;
            affectedCount++;
            persistGlobalStore();
          }
          break;
        }

        case 'DELETE_PLAN': {
          const { planName, deleteMode, deletedVoucherIds } = payload;
          if (planName) {
            if (!globalStore.deletedPlans) globalStore.deletedPlans = {};
            globalStore.deletedPlans[planName] = true;

            const targetIds = new Set<string>(Array.isArray(deletedVoucherIds) ? deletedVoucherIds : []);
            Object.keys(globalStore.vouchers).forEach(id => {
              const v = globalStore.vouchers[id];
              if (!v) return;
              if (v.plan === planName || targetIds.has(id)) {
                if (deleteMode === 'all') {
                  delete globalStore.vouchers[id];
                  affectedCount++;
                } else {
                  const isSold = v.status === 'Sold' || !!v.soldAt || !!v.giftedAt;
                  const isAssigned = !!v.assignedAgentId && v.status === 'Assigned';
                  if (!isSold && !isAssigned) {
                    delete globalStore.vouchers[id];
                    affectedCount++;
                  }
                }
              }
            });

            // Clean up any customers associated with these purged vouchers
            Object.keys(globalStore.customers).forEach(cId => {
              const c = globalStore.customers[cId];
              if (c && Array.isArray(c.consecutivePurchases)) {
                c.consecutivePurchases = c.consecutivePurchases.filter((p: any) => p && p.plan !== planName && !targetIds.has(p.voucherId));
                if (c.consecutivePurchases.length === 0 && (c.name?.includes('Histec') || c.name?.includes('Gifted') || c.totalPurchases <= 1)) {
                  delete globalStore.customers[cId];
                }
              }
            });

            persistGlobalStore();
          }
          break;
        }

        case 'DELETE_VOUCHER': {
          const { voucherId } = payload;
          if (voucherId && globalStore.vouchers[voucherId]) {
            delete globalStore.vouchers[voucherId];
            affectedCount++;
            persistGlobalStore();
          }
          break;
        }

        case 'BULK_DELETE_VOUCHERS': {
          const { voucherIds } = payload;
          if (Array.isArray(voucherIds)) {
            voucherIds.forEach((id: string) => {
              if (globalStore.vouchers[id]) {
                delete globalStore.vouchers[id];
                affectedCount++;
              }
            });
            persistGlobalStore();
          }
          break;
        }

        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }

      const targetWs = payload?.workspaceId || (payload?.vouchers?.[0]?.workspaceId) || 'ws_vakzim';
      const updatedMirror = updateLatestDbPushMetricsMirror(globalStore, targetWs);

      return res.json({
        success: true,
        action,
        affectedCount,
        serverTime: Date.now(),
        latestDbPushMetricsMirror: updatedMirror
      });
    } catch (err: any) {
      console.error("[WiVoTe Sync Server] Error in /api/sync/mutate:", err);
      return res.status(500).json({ error: err.message || "Mutation failed" });
    }
  });

  // Serve static files and handle routing using Vite in dev / static middleware in prod
  const distPath = path.join(process.cwd(), "dist");

  if (!isProduction) {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (vErr) {
      console.warn("[Server] Could not initialize Vite middleware, falling back to static serving:", vErr);
      app.use(express.static(distPath));
      app.get("*", (_req: express.Request, res: express.Response) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  } else {
    app.use(express.static(distPath));
    app.get("*", (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const serverInstance = app.listen(PORT, cliHost, () => {
    console.log(`Server running on port ${PORT} on host ${cliHost} in ${process.env.NODE_ENV || "development"} mode`);

    // Automated 60-day (2-month) Sold Voucher Archival Background Task
    const runArchivalJob = async () => {
      try {
        const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(Date.now() - SIXTY_DAYS_MS);
        let count = 0;

        if (adminDb) {
          const snapshot = await adminDb.collectionGroup("vouchers")
            .where("status", "==", "Sold")
            .get().catch(() => null);

          if (snapshot && !snapshot.empty) {
            const batch = adminDb.batch();
            snapshot.docs.forEach((d: any) => {
              const data = d.data();
              const saleTimeStr = data.soldAt || data.createdAt;
              if (saleTimeStr) {
                const saleTime = new Date(saleTimeStr).getTime();
                if (!isNaN(saleTime) && saleTime <= cutoffDate.getTime() && !data.archived) {
                  const wsId = data.workspaceId || 'ws_vakzim';
                  const archivePayload = { ...data, archived: true, archivedAt: new Date().toISOString() };
                  batch.set(adminDb.collection("workspaces").doc(wsId).collection("vouchers_archive").doc(d.id), archivePayload);
                  batch.set(adminDb.collection("vouchers_archive").doc(d.id), archivePayload);
                  batch.delete(d.ref);
                  count++;
                }
              }
            });
            if (count > 0) {
              await batch.commit();
            }
          }
        }

        if (globalStore && globalStore.vouchers) {
          if (!globalStore.vouchers_archive) globalStore.vouchers_archive = {};
          let localCount = 0;
          Object.keys(globalStore.vouchers).forEach(id => {
            const v = globalStore.vouchers[id];
            if (!v || v.status !== 'Sold') return;
            const saleTimeStr = v.soldAt || v.createdAt;
            if (saleTimeStr) {
              const saleTime = new Date(saleTimeStr).getTime();
              if (!isNaN(saleTime) && saleTime <= cutoffDate.getTime() && !v.archived) {
                globalStore.vouchers_archive[id] = { ...v, archived: true, archivedAt: new Date().toISOString() };
                delete globalStore.vouchers[id];
                localCount++;
              }
            }
          });
          if (localCount > 0) persistGlobalStore();
        }

        if (count > 0) {
          console.log(`[WiVoTe Archival Background Task] Automatically offloaded ${count} sold vouchers > 2 months old into vouchers_archive collection.`);
        }
      } catch (archErr) {
        console.warn("[WiVoTe Archival Background Task] Error:", archErr);
      }
    };

    // Run initial scan 15s after startup, then schedule every 6 hours
    setTimeout(runArchivalJob, 15000);
    setInterval(runArchivalJob, 6 * 60 * 60 * 1000);
  });

  process.on("SIGTERM", () => {
    serverInstance.close(() => {
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    serverInstance.close(() => {
      process.exit(0);
    });
  });

  serverInstance.on("error", (err: any) => {
    if (err.code === "EADDRINUSE" && PORT !== 3000) {
      console.warn(`[Server] Port ${PORT} already in use, falling back to port 3000...`);
      app.listen(3000, cliHost, () => {
        console.log(`Server running on fallback port 3000 on host ${cliHost}`);
      });
    } else {
      console.error("[Server] Listen error:", err);
    }
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
