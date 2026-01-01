# SafePlate

Minimal full-stack starter for **SafePlate** (React + Express). MongoDB is optional and only needed if/when you add persistence.

## Stack
- Client: React (Vite)
- Server: Node.js + Express
- Optional DB: MongoDB (via Mongoose)

## Run (dev)
From the repo root:

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:5050
- Health check: http://localhost:5050/api/health

## Notes
- The server exposes `POST /api/decision` and returns a **Decision Card** payload.
- The client proxies `/api/*` to the server during development.

## Optional: AI decisions (instead of pre-designed heuristics)
If you want the decision to be produced by an LLM:
1. Copy `server/.env.example` to `server/.env`
2. Set `USE_AI=true`
3. Set `AI_PROVIDER=gemini` (recommended) or `AI_PROVIDER=openai`
4. Set `AI_ONLY=true` to disable fallback

Then configure one provider:
- **Gemini**: set `GEMINI_API_KEY` and (optional) `GEMINI_MODEL`
- **OpenAI-compatible**: set `OPENAI_API_KEY` and (optional) `OPENAI_MODEL`/`OPENAI_BASE_URL`

The server validates the AI output (strict format + no ingredient lists/codes/percentages). With `AI_ONLY=true`, the API returns an error if AI is unavailable/invalid.

## Optional: MongoDB
If you later need persistence:
1. Copy `server/.env.example` to `server/.env`
2. Set `MONGO_URI`.

The server will connect if `MONGO_URI` is present; otherwise it runs without Mongo.
