# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

DevAnswers is a Stack Overflow-style Q&A app split into two independent npm projects (no root package.json; run commands inside each directory):

- `devanswers-backend/` — Express 5 + Mongoose (ESM, `"type": "module"`), JWT auth, Gemini-powered AI features.
- `devanswers-frontend/` — React 19 + Vite + Redux Toolkit + react-bootstrap.

## Commands

Backend (`cd devanswers-backend`):
- `npm run dev` — nodemon; `npm start` — plain node (`main.js`)
- `npm run populate` — wipe and seed DB from `src/scripts/seed-data.js`
- `npm test` — vitest (all tests); single file: `npx vitest run tests/unit/services/voteService.test.js`; single test: `npx vitest run -t "test name"`
- Copy `.env.example` to `.env` (PORT, MONGODB_URI, JWT_SECRET, JWT_EXPIRATION, GEMINI_API_KEY).

Frontend (`cd devanswers-frontend`):
- `npm run dev`, `npm run build`, `npm run lint`, `npm test` (vitest; jsdom, @testing-library, msw are installed but no frontend tests or vitest config exist yet).

## Backend architecture

Layering: `routes/` → `controllers/` → `services/` → `models/`, with `middleware/authHandler.js` (JWT `authenticate`) and `middleware/errorHandler.js`. Errors are raised with `utils/createAppError.js` (message + status code) and handled centrally.

- `src/app.js` builds the Express app (helmet, rate limit 100/15min, cors, json) and mounts everything under `/api`; it is exported separately so tests can use it via supertest without listening.
- `main.js` → `db.js` (connect) + `server.js` (listen). `app.js` knows nothing about DB connection.
- `services/voteService.js` `handleVote(Model, id, userId, voteType)` is shared by questions and answers (upvotes/downvotes arrays on the documents).
- AI: `utils/geminiClient.js` lazily creates the Gemini client; `POST /api/questions/improve` and `POST /api/answers/summarize` use it (`extractJSON` parses JSON out of model text). Declare such static routes before `/:id` routes in the routers.
- Route notes: answers are created/listed under `/questions/:questionId/answers`; update/delete/vote under `/answers/:answerId`. Reads are public, writes require auth.

Tests (`tests/`): `unit/` mocks dependencies; `integration/` uses supertest against `app` with `mongodb-memory-server` via `tests/setup.js` (must be imported by each integration test). Files run serially (`fileParallelism: false`) with 60s timeouts; first run downloads a MongoDB binary.

## Frontend architecture

- `src/api/axiosInstance.js` hardcodes `baseURL: http://localhost:3000/api`; `src/config/config.js` holds all endpoint path constants (including AI endpoints) — add new endpoints there.
- Flow: pages/components → Redux slices in `src/reducers/` (`questionSlice`, `userSlice`, `themeSlice`; store in `src/store.js`) → `src/services/*Service.js` (axios calls). Thunks use `rejectWithValue` with `error.response?.data?.message`.
- `src/layouts/` provide page shells (Base, SideBar, RightSidebar); `src/pages/` are route targets wired in `App.jsx`.

## Conventions
- Every API response uses the envelope `{ success, message, data }`.
- Before building, check what already exists (some backend capability, such as answer update, may already be there). Do not duplicate it.
- Specs and plans live in `specs/` (`/spec`, `/plan-feature` commands in `.claude/commands/`).
- Do not run `git push` or create PRs unless asked.
