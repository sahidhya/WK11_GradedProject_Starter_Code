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
- `npm run dev`, `npm run build`, `npm run lint`, `npm test` (vitest + jsdom + @testing-library; network is mocked with msw in `tests/mocks/`, handlers use base URL `http://localhost:3000/api`).

## Backend architecture

Layering: `routes/` → `controllers/` → `services/` → `models/`, with `middleware/authHandler.js` (JWT `authenticate`) and `middleware/errorHandler.js`. Errors are raised with `utils/createAppError.js` (message + status code) and handled centrally.

- `src/app.js` builds the Express app (helmet, rate limit 100/15min, cors, json) and mounts everything under `/api`; it is exported separately so tests can use it via supertest without listening.
- `main.js` → `db.js` (connect) + `server.js` (listen). `app.js` knows nothing about DB connection.
- `services/voteService.js` `handleVote(Model, id, userId, voteType)` is shared by questions and answers (upvotes/downvotes arrays on the documents).
- AI: `utils/geminiClient.js` lazily creates the Gemini client; `POST /api/questions/improve` and `POST /api/answers/summarize` use it (`extractJSON` parses JSON out of model text). Declare such static routes before `/:id` routes in the routers. All model calls go through `generateText()` in `geminiClient.js` (20s timeout, one retry on 503/504/network errors, friendly 503 message). The model name comes from `getModelName()` (default `gemini-3.5-flash-lite`, override with `GEMINI_MODEL` in `.env`); Google retires models, so never hardcode one in a service.
- Route notes: answers are created/listed under `/questions/:questionId/answers`; update/delete/vote under `/answers/:answerId`. Reads are public, writes require auth.
- Bookmarks: `User.bookmarks` is an array of Question ids. All routes are under `/api/users/me/bookmarks` (`routes/users.js`, all protected): `GET /ids`, `GET /` (populated questions, `[]` when empty, never 404), `PUT /:questionId`, `DELETE /:questionId` (idempotent via `$addToSet`/`$pull`). Logic lives in `services/bookmarkService.js`.
- Editing: `PUT /questions/:id` and `PUT /answers/:answerId` are author-only (admins are rejected with 403; admins may still delete). They validate input (400 for blank/invalid, malformed id) and set `editedAt` (Question and Answer models). Never use `updatedAt` as the "edited" signal: views and votes also bump it.

Tests (`tests/`): `unit/` mocks dependencies; `integration/` uses supertest against `app` with `mongodb-memory-server` via `tests/setup.js` (must be imported by each integration test). The app rate-limits to 100 requests per window and every test file gets its own app instance, so keep each file under that: register/login test users once in `beforeAll` (users are not cleared by `tests/setup.js`; use unique emails) and reset other state directly through the models. Unit tests that call services with ids must use valid ObjectId strings (services validate ids first). Files run serially (`fileParallelism: false`) with 60s timeouts; first run downloads a MongoDB binary.

## Frontend architecture

- `src/api/axiosInstance.js` hardcodes `baseURL: http://localhost:3000/api`; `src/config/config.js` holds all endpoint path constants (including AI endpoints) — add new endpoints there.
- Flow: pages/components → Redux slices in `src/reducers/` (`questionSlice`, `userSlice`, `themeSlice`; store in `src/store.js`) → `src/services/*Service.js` (axios calls). Thunks use `rejectWithValue` with `error.response?.data?.message`.
- Bookmarks: `reducers/bookmarkSlice.js` (registered as `bookmark`) holds saved ids, the Profile list and per-question pending state; toggles are optimistic with rollback, state resets on `user/logout`, and `App.jsx` loads the ids when a token exists. Always read it through the safe selectors (`state.bookmark?.ids ?? []`) because many tests build stores without it. `components/Shared/BookmarkButton.jsx` is the only control; the Profile "Saved Questions" section reuses `QuestionList` (`emptyTitle`/`emptyMessage` props).
- Editing exists only on the question page: pencil + inline form in `components/Question/QuestionContent.jsx` (question) and `components/Answer/AnswerItem.jsx` (one answer, owns its edit state). Author check is `String(author._id) === String(userInfo.userId)`. The `updateQuestion`/`updateAnswer` thunks must never set `state.loading` or `state.error`: `QuestionDetail` replaces the whole page with a spinner/error on those and would unmount the open form. The question PUT response has no `answers`, so the reducer merges only the edited fields.
- `src/layouts/` provide page shells (Base, SideBar, RightSidebar); `src/pages/` are route targets wired in `App.jsx`.

## Conventions
- Every API response uses the envelope `{ success, message, data }`.
- Before building, check what already exists (some backend capability, such as answer update, may already be there). Do not duplicate it.
- Specs and plans live in `specs/` (`/spec`, `/plan-feature` commands in `.claude/commands/`).
- Do not run `git push` or create PRs unless asked.
- Keep changes scoped to the task. Do not reformat or "clean up" unrelated files; some starter files use CRLF or mixed line endings, so edit them in place and check `git diff --stat` stays small.
- `devanswers-frontend/dist/` is build output and is git-ignored: never commit it. `.env` is git-ignored too: never print or commit secrets.
- Before finishing a change run `npm test` in both packages and `npm run lint` in the frontend (lint is clean; keep it clean).
