import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // ensure .env.local is loaded

import { google } from "googleapis";

async function main() {
  // Load and validate env vars
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing or invalid.");

  const creds = JSON.parse(raw);

  // 🔧 Convert escaped newlines (\\n) back to real ones for crypto
  if (creds.private_key && typeof creds.private_key === "string") {
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID env var is missing.");

  // Authenticate with service account
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });

  // Fetch files in the given folder
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,modifiedTime)",
    orderBy: "name",
  });

  // Output results
  console.log("\nFiles I can see in the folder:");
  const files = res.data.files || [];
  if (files.length === 0) {
    console.log(
      "(No files found — check the folder ID and make sure the folder is shared with your service account email.)"
    );
  } else {
    for (const f of files) {
      console.log(`- ${f.name} (${f.id}) ${f.mimeType} modified:${f.modifiedTime}`);
    }
  }
}

main().catch((e) => {
  console.error("Drive list error:", e?.response?.data || e);
  process.exit(1);
});
