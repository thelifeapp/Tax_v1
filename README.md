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
