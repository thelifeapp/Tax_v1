<p align="center">
  <img src="https://img.shields.io/badge/Framework-Next.js_16-black?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Styling-TailwindCSS_4-blue?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/UI-shadcn%2Fui-purple" />
  <img src="https://img.shields.io/badge/Backend-Supabase-green?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/Language-TypeScript-blue?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/License-Private-red" />
</p>

---

# 🧾 Tax_v1 — Legal Tax Form Automation Platform

**Tax_v1** is a modern legal software platform built to automate the preparation and filing of key U.S. **estate and fiduciary tax forms (709, 706, 1041, and PA-41)** for law firms and fiduciary professionals.

It provides attorneys with a centralized dashboard to manage client filings, reduce duplicate data entry, and track form completion progress — combining **Next.js**, **Supabase**, and **Tailwind + shadcn/ui** for a secure, beautiful experience.

---

## ⚙️ Tech Stack

| Layer | Tool / Library | Purpose |
|-------|----------------|----------|
| **Frontend Framework** | [Next.js 16 (App Router)](https://nextjs.org/) | Core React framework for building the UI and routing |
| **UI Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first CSS for fast, responsive design |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com/) | Accessible React components styled with Tailwind |
| **Backend & Auth** | [Supabase](https://supabase.com/) | Postgres database, authentication, and file storage |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Static typing and compile-time safety |
| **Version Control** | [Git + GitHub](https://github.com/) | Source control and release tracking |

---

## 💡 Key Features (MVP)

- 🧠 **Smart Form Mapping** – Shared fields auto-populate across forms (709, 706, 1041, PA-41)
- 👩‍💼 **Lawyer Dashboard** – View clients, filings, and status progress in one clean view
- 📤 **Export to Email** – Generate PDFs and attach them directly to outgoing emails
- ✉️ **Magic-Link Authentication** – Password-free Supabase email login
- 💾 **Secure Data Storage** – Row-level security (RLS) for firm-scoped data isolation
- 🪙 **Seat-Based Billing** – Per-lawyer licensing model for firm accounts
- 🧱 **Client Portal (future)** – Optional client-facing input with lawyer review access

---

## 🚀 Setup Instructions

### 1️⃣ Clone the Repo
```bash
git clone https://github.com/thelifeapp/Tax_v1.git
cd Tax_v1



## 2️⃣ Install Dependencies
```bash
npm install


##Installs all required packages (Next.js, Tailwind, shadcn/ui, Supabase SDK, etc.).

##3️⃣ Create Environment File

##Create a .env.local file at the root of your project with your Supabase credentials:

##NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
##NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
##BASE_APP_URL=http://localhost:3000


##⚠️ Important: Do not commit .env.local — it contains your private API keys.

##4️⃣ Run the Development Server
```bash
npm run dev


##Then visit http://localhost:3000

##You should see:

##Supabase client loaded: ✅ yes

##🧭 Version History
##Version Tag	Description	Commit Link	Date	Status
##v0.1-base-ui	Base UI complete – Tailwind CSS v4 installed and configured	91e705b
##	Oct 28 2025	✅ Done
##v0.15-shadcn-verification	Verified shadcn/ui components render correctly (Button, Badge, Input)	6f424ed
##	Oct 29 2025	✅ Done
##v0.2-supabase-connection	Supabase client installed, .env.local configured, and connection verified	1e13036
##	Oct 31 2025	✅ Done
##v0.3-auth-login-dashboard	Implement magic-link login and protected /dashboard route	(upcoming)	Nov 1 2025	🟡 In ##progress
##v0.35-user-bootstrap	Auto-create firm + user record on first login	(upcoming)	Nov 2 2025	🔜 Planned
##v0.4-clients-filings	Nested Clients → Filings dashboard view	(upcoming)	Nov 4 2025	🔜 Planned
##v0.45-client-input	Add/Edit Client modal with shared field mapping	(upcoming)	Nov 5 2025	🔜 Planned
##v0.5-export-email	Export-to-email and PDF attach flow	(upcoming)	Nov 6 2025	🔜 Planned
##v0.6-polish	UI cleanup, hover states, consistent spacing/colors	(upcoming)	Nov 8 2025	🔜 Planned
##v1.0-MVP-launch	MVP feature-complete and ready for demo users	(upcoming)	Nov 9 2025	🎯 Target
##🪙 License

##© 2025 The Life App. All rights reserved.
##Private proprietary MVP codebase – not for public redistribution.

##🌐 Future Demo (Placeholder)

##When your MVP is live, include your hosted link here:

https://tax-thelifeapp-demo.vercel.app

##👩‍💻 Maintainer

##Emily Evanko – Founder & CTO
