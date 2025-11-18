import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("GOOGLE_SERVICE_ACCOUNT_JSON is undefined. Is .env.local in the project root and spelled exactly?");
  process.exit(1);
}
try {
  const obj = JSON.parse(raw);
  console.log("OK:", {
    client_email: obj.client_email,
    project_id: obj.project_id,
    has_private_key: !!obj.private_key,
  });
} catch (e) {
  console.error("JSON parse error:", e);
  process.exit(1);
}
