# AI-Based Complaint Priority Assistant — Demo
## Run
1. Install Node.js 18+ (https://nodejs.org)
2. Set a strong `JWT_SECRET` environment variable.
   - PowerShell: `$env:JWT_SECRET = (node -p "require('crypto').randomBytes(32).toString('hex')")`
3. In this folder:  `npm install`  then  `npm start`
4. Open http://localhost:3000  (internet needed once for the React/Tailwind CDN scripts)

## Demo accounts
- Admin: admin@demo.com / admin123
- Complainant: user@demo.com / user123

## Demo script (5 min)
1. Login as user → "+ New Complaint" → Title: "Gas leakage smell in apartment", Description: "Strong gas smell in the corridor since morning. Children are feeling dizzy." → Analyze with AI (CRITICAL) → Submit.
2. Submit a routine one: "Update address in water bill" → LOW.
3. Logout, login as admin → Priority Queue sorted Critical first with deadline timers → open a complaint → assign officer, set "In Progress", Save.
4. Back as user → Track tab (timeline), Help tab (notifications + ComplaintBot), Analytics.

## Structure
- server.js – Express REST API, JWT auth, bcrypt, NLP/ML-style priority engine (keyword weights + sentiment → score → Critical/High/Medium/Low + confidence + explanation)
- public/index.html – React UI (Tailwind)
- data.json – auto-created storage (replace with MongoDB/Mongoose for production, as described in the report)
