const fs = require('fs');
const https = require('https');
const path = require('path');

const diagrams = {
    'system_architecture.png': `graph TD
    A["Frontend Client (React/Vanilla CSS)"] -->|Fetch Stories| B["Next.js API: /api/jira"]
    A -->|Generate Plan| C["Next.js API: /api/generate/plan"]
    A -->|Immediate Tab Switch| D["Next.js API: /api/generate/cases"]
    A -->|Immediate Tab Switch| E["Next.js API: /api/generate/code"]
    
    B -->|REST API Request| F[("(Jira Cloud / Mock Fallback)")]
    
    C -->|API Request| G{AI Provider Router}
    D -->|Background API Request| G
    E -->|Background API Request| G
    
    G -->|apiKey| H["OpenAI / Claude / Gemini / Nvidia"]
    G -->|local| I["Ollama Server"]
    G -->|fallback| J["Hardcoded Mock Responses"]`,
    
    'application_data_flow.png': `sequenceDiagram
    participant U as QA Engineer
    participant UI as Application UI
    participant Backend as Next.js API Routes
    participant AI as AI Providers (LLMs)
    
    U->>UI: Select AI Provider & Options
    U->>UI: Clicks "Fetch Stories"
    UI->>Backend: GET /api/jira (or uses mock)
    Backend-->>UI: Display Stories Grid
    
    U->>UI: Selects a User Story & Clicks "Generate Plan"
    UI->>Backend: POST /api/generate/plan
    Backend->>AI: Prompt Engineering Context
    AI-->>Backend: Markdown Test Plan
    Backend-->>UI: Renders Plan Dashboard
    
    U->>UI: Clicks "Create Test Cases"
    UI->>UI: Immediate Tab Switch (Test Cases)
    UI->>Backend: POST /api/generate/cases (Background)
    Backend->>AI: Plan + Story Context
    AI-->>Backend: JSON Array of Granular Cases
    Backend-->>UI: Update UI with Case Cards
    
    U->>UI: Clicks "Generate Code" (Playwright)
    UI->>UI: Immediate Tab Switch (Code Generator)
    UI->>Backend: POST /api/generate/code (Background)
    Backend->>AI: Single Test Case Context
    AI-->>Backend: Raw Automation Script
    Backend-->>UI: Display Syntax-Highlighted Code`
};

for (const [filename, code] of Object.entries(diagrams)) {
    const state = { code: code, mermaid: { theme: 'default' } };
    const base64Str = Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
    const url = 'https://mermaid.ink/img/' + base64Str;
    const dest = path.join(__dirname, 'Files', filename);
    
    console.log("Downloading", filename, "from", url.slice(0, 50) + "...");
    
    const req = https.get(url, (res) => {
        if (res.statusCode !== 200) {
            console.error('Failed to download', filename, res.statusCode);
            res.resume();
            return;
        }
        res.pipe(fs.createWriteStream(dest));
        res.on('end', () => console.log('Saved', filename));
    });
    req.on('error', (err) => console.error('Error:', err));
}
