---
marp: true
theme: default
class: lead
backgroundColor: #fff
---

# Test Orchestrator
## Accelerating the QA Lifecycle with AI
**Speaker:** AI Assistant

---

# What is Test Orchestrator?
- **Core Concept:** An advanced, AI-powered web application automating the Software Testing Lifecycle.
- **Key Capabilities:**
  - Fetches User Stories dynamically from Jira.
  - Generates professional, structured Test Plans.
  - Creates granular, actionable Test Cases.
  - Generates immediately executable Automation Code.
- **Supported Frameworks:** Selenium (Java/Python), Playwright, Cypress.

---

# Technology Stack
### Built with Modern Web Tech
- **Frontend:** Next.js (App Router) for an optimized and secure React application.
- **Styling:** Vanilla CSS highlighting modern, dynamic glassmorphism aesthetics.
- **Integration:** REST API migration for compatibility with modern Jira cloud configurations.

---

# Core Features (1/2)
### Features Designed for Speed
- **Jira Integration:** Seamless fetching of stories using custom recursive parsers to convert Jira Rich-Text to clean formats.
- **Test Plan Generation:** Multi-LLM pipeline analyzes stories to build comprehensive test strategies.
- **Smart Test Cases:** Granular test creation complete with Priority Badges (`High`, `Medium`, `Low`) and CSV downloads.

---

# Core Features (2/2)
### AI-Driven Code & Customization
- **Automation Code Generation:** One-click script creation with a Code History Map.
- **Multi-LLM Support:** Dynamic real-time connectivity to:
  - OpenAI, Anthropic, Google Gemini, Nvidia NIM.
  - Offline private execution with local Ollama.
- **Custom Prompt Mode:** Empowers QA leads to dictate exact AI behavior.

---

# System Architecture
### High-Level Architecture
- **Client-Side:** Next.js frontend interacting securely with AI APIs.
- **Next.js Backend API:** Orchestrates endpoints (`/api/jira`, `/api/generate/plan`).
- **AI Router Engine:** Decouples specific integrations allowing fallback logic gracefully.

---

# Roadmap & Next Steps
### Future Enhancements
- Real-Time AI Streaming ("Typing Out" Effect)
- Multi-User Session Management & Authentication
- Test Coverage Heatmaps
- Bi-directional Jira Write-backs (Issue Creation)

---

# Thank You!
### Questions?
