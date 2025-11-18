import { NextResponse } from "next/server";
import { Pool } from "pg";

// Use the same DB connection as /api/forms/sync
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing (check .env.local)");
}

// ✅ DB POOL: force SSL to accept Supabase's self-signed cert
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // <-- THIS is what tells Node to accept the self-signed certificate
  },
});

export async function GET() {
  try {
    const client = await pool.connect();

    try {
      // Count total form_fields
      const countResult = await client.query(
        "SELECT COUNT(*) as count FROM public.form_fields"
      );
      const count = parseInt(countResult.rows[0].count, 10);

      // Get sample form_fields
      const sampleResult = await client.query(
        `
        SELECT id, template_id, field_key, form_code
        FROM public.form_fields
        LIMIT 5
        `
      );

      return NextResponse.json({
        ok: true,
        count,
        sample: sampleResult.rows,
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Debug endpoint error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "unknown error",
      },
      { status: 500 }
    );
  }
}

