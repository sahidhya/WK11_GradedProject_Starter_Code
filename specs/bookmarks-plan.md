# Plan: Bookmark Questions for Later

Source spec: `specs/bookmarks-spec.md` (acceptance criteria are referenced as AC1-AC20). Paths are relative to `devanswers-backend/` (BE) or `devanswers-frontend/` (FE). Tasks are ordered bottom-up; each ends with a checkpoint so a broken step is caught before the next layer is built.

Conventions to follow (from CLAUDE.md): routes -> controllers -> services -> models; `{ success, message, data }` envelope; errors via `createAppError`; Express 5 forwards async throws, so no try/catch in controllers; frontend endpoint config -> service -> Redux slice -> component; thunks use `rejectWithValue(error.response?.data?.message ...)`.

Naming choices made by this plan: controller is `bookmarkController.js`, service is `bookmarkService.js`, router is `users.js`, slice is `bookmarkSlice.js` registered as `bookmark`.

---

## Phase 1: Backend tests (write first; they must fail for the right reason)

### T1. Service unit tests: `BE/tests/unit/services/bookmarkService.test.js` (create)
- What: mock `User` and `Question` models with `vi.fn()` (pattern: `voteService.test.js`). Cases: add new, add duplicate (uses `$addToSet`, returns `isBookmarked: true`), remove present, remove absent (still succeeds), unknown question on add -> 404, malformed id -> 400 for both add and remove, ids returned as strings, list returns `[]` when no saves, list omits deleted questions, list attaches `answerCount` and populates author/tags.
- Criteria: AC1-AC5, AC7, AC9.
- Verify: `npx vitest run tests/unit/services/bookmarkService.test.js` fails with "cannot find module bookmarkService".

### T2. Controller unit tests: `BE/tests/unit/controllers/bookmarkController.test.js` (create)
- What: `vi.mock` the service; `req.user = { id }`, `req.params.questionId`; assert status 200, envelope, messages ("Question bookmarked", "Bookmark removed", ids and list messages), and that `req.user.id` is passed to the service.
- Criteria: AC1, AC3-AC5.
- Verify: fails with missing module.

### T3. Integration tests: `BE/tests/integration/bookmarks.test.js` (create)
- What: import `../setup.js` and `app`; register + login two users through `/api/auth/*` using unique emails (setup only clears Question and Answer, not User); create questions directly with the models. Cases: PUT/DELETE/GET ids/GET list happy paths; idempotent PUT; 401 on all four routes without a token; 404 for unknown question; 400 for malformed id; two-user isolation; list shape (author name, tags, `answerCount`, newest first); `[]` with 200 for a user with no saves; list omits a question deleted after being saved; login response still `{ token, userId, name }`.
- Criteria: AC1-AC10.
- Verify: `npx vitest run tests/integration/bookmarks.test.js` fails (routes return 404). Run the existing integration suite once to record the baseline.

Checkpoint 1: three new test files fail; all existing backend tests still pass (`npm test`).

---

## Phase 2: Backend implementation

### T4. Model: `BE/src/models/User.js` (modify)
- What: add `bookmarks` as an array of ObjectId refs to `Question` with `default: []`, following the `upvotes` array style in `Question.js`.
- Criteria: AC1, AC8 (storage per user).
- Verify: model loads; a user created without the field has `bookmarks === []`; existing user tests still pass.

### T5. Service: `BE/src/services/bookmarkService.js` (create)
- What, four exported service functions:
  - add: validate id with `mongoose.isValidObjectId` (400 `Invalid question id`), confirm the question exists (404 `Question not found`), `$addToSet` on the caller's `bookmarks`, return `{ questionId, isBookmarked: true }`.
  - remove: validate id (400), `$pull`, return `{ questionId, isBookmarked: false }`; no 404 for absent bookmark or deleted question.
  - ids: return the caller's `bookmarks` as an array of strings (`[]` if none).
  - list: `Question.find({ _id: { $in: bookmarks } })`, populate `author` (name) and `tags`, sort `createdAt` desc, attach `answerCount` with `Answer.countDocuments`, mirroring `getQuestionsByTagService`. Return `[]` for none (never throw 404, unlike `getAllQuestionsService`). Deleted questions drop out naturally.
- Criteria: AC1-AC5, AC7-AC9.
- Verify: T1 passes.

### T6. Controller: `BE/src/controllers/bookmarkController.js` (create)
- What: four thin handlers (add, remove, getIds, getList) reading `req.user.id` and `req.params.questionId`, calling the service, returning the 200 envelopes from spec section 7. No try/catch.
- Criteria: AC1-AC5, AC10.
- Verify: T2 passes.

### T7. Routes: `BE/src/routes/users.js` (create) and `BE/src/routes/index.js` (modify)
- What: new router applying `authenticate` to every route: `GET /me/bookmarks/ids`, `GET /me/bookmarks`, `PUT /me/bookmarks/:questionId`, `DELETE /me/bookmarks/:questionId`. Declare `/ids` before any parameterised GET on the same prefix. Mount at `/users` in `routes/index.js`.
- Criteria: AC1-AC6, AC10.
- Verify: T3 passes; `npm test` passes in full; manual curl: PUT then GET ids shows the id, DELETE then GET ids shows `[]`.

Checkpoint 2: whole backend suite green, including the three new files.

---

## Phase 3: Frontend data layer

### T8. Endpoint config: `FE/src/config/config.js` (modify)
- What: add `BOOKMARK_API` with `IDS: "/users/me/bookmarks/ids"`, `LIST: "/users/me/bookmarks"`, `ITEM: (questionId) => \`/users/me/bookmarks/${questionId}\``. Relative paths only (base URL lives in `axiosInstance.js`).
- Criteria: AC11, AC17.
- Verify: import resolves; lint passes.

### T9. Service: `FE/src/services/bookmarkService.js` (create)
- What: `getBookmarkIds(token)`, `getBookmarkedQuestions(token)`, `addBookmark(questionId, token)`, `removeBookmark(questionId, token)` using `axiosInstance` and the same `Authorization: Bearer` header style as `questionService.js`; return `res.data.data`.
- Criteria: AC11, AC14, AC17.
- Verify: covered by slice tests (T17) and msw handlers (T16).

### T10. Slice: `FE/src/reducers/bookmarkSlice.js` (create) and `FE/src/store.js` (modify)
- What: state `{ ids: [], savedQuestions: [], pendingIds: [], listStatus: 'idle', error: null }`.
  - Thunks: `fetchBookmarkIds`, `fetchBookmarkedQuestions`, `toggleBookmark({ questionId, currentlySaved })`; token from `getState().user.userInfo`; `rejectWithValue` messages.
  - `toggleBookmark.pending`: optimistically add/remove id, remove from `savedQuestions` on unsave, add to `pendingIds`. `rejected`: roll back and set `error`. `fulfilled`/`rejected`: clear pending.
  - `extraReducers` also handle `user/logout` (reset to initial state).
  - Export safe selectors `selectBookmarkIds = (state) => state.bookmark?.ids ?? []` and `selectIsPending`.
  - Must not touch `state.question.loading` (it is a different slice).
  - Register as `bookmark` in `store.js`.
- Criteria: AC11, AC12, AC14, AC15, AC17, AC20.
- Verify: slice unit tests (T17) pass; Redux devtools/console shows `bookmark` key in the store.

---

## Phase 4: Frontend UI

### T11. App-level load: `FE/src/App.jsx` (modify)
- What: small effect (or tiny inner component rendered inside the Provider) that dispatches `fetchBookmarkIds` whenever `userInfo?.token` is set or changes; nothing when logged out. Covers login, page reload with a stored session, and re-login as another user (logout reset runs first).
- Criteria: AC11, AC12, AC19.
- Verify: reload while logged in; network tab shows `GET /users/me/bookmarks/ids`; saved icons render filled right after.

### T12. Shared control: `FE/src/components/Shared/BookmarkButton.jsx` (create, plus css if needed)
- What: props `questionId`; reads `selectBookmarkIds` and pending state; renders `FaBookmark` / `FaRegBookmark`, `aria-label` "Save question" / "Remove bookmark", disabled while pending; `preventDefault`/`stopPropagation` on click. Anonymous click: `navigate('/login')` with no dispatch. Logged-in click dispatches `toggleBookmark`; on rejection show an error (inline text or `alert`, matching existing style).
- Criteria: AC13-AC16.
- Verify: component tests (T18); visual check on the feed.

### T13. Place the control: `FE/src/components/Question/QuestionCard.jsx` and `FE/src/components/Question/QuestionContent.jsx` (modify)
- What: render `BookmarkButton` in the card's stats column (under the answer count) and in the detail title card (right side of the title row). No other behaviour change.
- Criteria: AC13, AC20.
- Verify: icon visible on home feed, tag feed, and a question page; existing `QuestionCard`/`QuestionContent` tests still pass with stores lacking a `bookmark` reducer.

### T14. List reuse: `FE/src/components/Question/QuestionList.jsx` (modify)
- What: add optional props `emptyTitle` and `emptyMessage` (defaults keep today's "No questions found" text); clamp `currentPage` to the last valid page when the list shrinks (e.g. unsaving the last item on page 2).
- Criteria: AC17, AC18.
- Verify: Home empty state unchanged; list tests for custom text and page clamp (T18).

### T15. Profile section: `FE/src/pages/Profile/Profile.jsx` (modify)
- What: new "Saved Questions" card below the existing content; dispatches `fetchBookmarkedQuestions` on mount (when authenticated); spinner while `listStatus` is pending; `QuestionList` with the saved questions; empty state passes `emptyTitle="No saved questions yet"` and a hint about the bookmark icon. Do not touch the existing broken stats call.
- Criteria: AC17, AC18.
- Verify: profile with saves shows them; unsave removes the item immediately; profile with none shows "No saved questions yet".

Checkpoint 3: `npm run lint` and `npm run build` pass in FE.

---

## Phase 5: Frontend tests

### T16. Mocks: `FE/tests/mocks/handlers.js` and `FE/tests/mocks/mockData.js` (modify)
- What: msw handlers for the four bookmark endpoints (base `http://localhost:3000/api`); mock data for saved ids and a saved question list.
- Criteria: supports AC11-AC19 tests.

### T17. Slice tests: `FE/tests/unit/reducers/bookmarkSlice.test.jsx` (create)
- What: ids loaded; optimistic add/remove; rollback on failure; pending ids cleared; reset on `user/logout`; unsave removes from `savedQuestions`; assert `question.loading` never changes.
- Criteria: AC11, AC12, AC14, AC15, AC17, AC20.

### T18. Component/page tests (create/modify)
- `FE/tests/unit/components/BookmarkButton.test.jsx` (create): outline vs filled, dispatch on click, anonymous redirect without request, disabled while pending.
- `FE/tests/unit/components/QuestionCard.test.jsx` and `QuestionContent` tests (modify only if needed): control renders; stores without `bookmark` still work.
- `FE/tests/unit/pages/profile.test.jsx` (modify): the mock store gains the `bookmark` reducer for the new cases (list, empty state, unsave).
- QuestionList test: custom empty text and page clamp.
- Criteria: AC13-AC18.

Checkpoint 4: `npm test` green in FE, including all pre-existing tests.

---

## Phase 6: Full verification

### T19. Full test run
- BE: `npm test`. FE: `npm test`, `npm run lint`, `npm run build`. All previously existing tests must still pass (AC10); the only existing-test edits allowed are the safe-selector adjustments in T18.

### T20. Manual verification checklist (running app, both servers up, seeded data)
1. Anonymous: open the home feed, click a bookmark icon -> redirected to `/login`, no request in the network tab. (AC16)
2. Log in as user A: icons are outline for unsaved. Click one -> fills instantly, no reload; `PUT` returns 200. (AC13, AC14)
3. Open that question's page: icon is filled there too; click -> outline. Toggle back. (AC13)
4. Hard reload: saved icons are filled right after load. (AC11, AC19)
5. Rapid double-click an icon: only one request in flight, final state consistent. (AC15)
6. Profile: "Saved Questions" lists A's saves; open one; unsave one from the list -> it disappears immediately. (AC17)
7. Unsave everything: profile shows "No saved questions yet". (AC18)
8. Log out, log in as user B: no saves of A's visible; B's icons are outline. (AC8, AC12)
9. Stop the backend and click a bookmark: icon reverts and an error appears. (AC14)
10. Open a question: no loading spinner flash when toggling the bookmark. (AC20)
11. Smoke-test existing flows: register, login, vote, post answer, Improve Question / Summarize Answers (if a Gemini key is set). (AC10)
12. API sanity (curl or REST client): the four endpoints with and without a token; 400 for a malformed id; 404 for an unknown question id.

---

## Risks to watch while implementing
- Mock stores in existing tests have no `bookmark` reducer; every selector must default safely or those tests break.
- `req.user.id` is an ObjectId and JSON ids are strings: always compare with `String(...)`.
- Do not use `authenticate` on any existing public route; all new routes are protected and live in the new router.
- Keep bookmark loading in `bookmarkSlice`; never touch `question.loading` (it triggers the full-page spinner on the question page).
- `tests/setup.js` does not clear Users: use unique emails per integration test.
