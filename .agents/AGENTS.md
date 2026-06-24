# PM-HCNS-TNEC Workspace Rules

## 🏗️ Project Architecture & Context Loading
- Before performing any code modifications or research tasks, you MUST read the [project_structure.md](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/project_structure.md) file in the root directory.
- This project contains two main modules:
  1. A **Desktop Application** written in Python using CustomTkinter, core logic processors (file reader with AI Vision, AI client, department classifier), and email/sheet integrations.
  2. A **Web Dashboard** written in Next.js (App Router), TypeScript, and TailwindCSS connected to a Supabase database.
- Always refer to [project_structure.md](file:///d:/Antigravity/PM%20-%20HCNS%20-%20TNEC/project_structure.md) to understand which files handle which business logic, data flows, and Google Apps Script triggers.

## 🛠️ Development Principles
- **No Hardcoded Keys**: API Keys or emails must be loaded from `config.json` (for Python desktop apps) or `.env.local` (for the Next.js web application).
- **Vibe Coding**: Ensure beautiful modern layouts, rich UI aesthetics (dark mode default for CustomTkinter, cohesive HSL/Tailwind values for Web Dashboard), and smooth interactive states.
- **Maintain Structure**: Keep the logic modular and separate between business logic (`core/`), visual presentation (`ui/`), helper scripts, and dashboard routes.
