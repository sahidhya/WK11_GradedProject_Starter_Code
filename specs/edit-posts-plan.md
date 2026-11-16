# Plan: Edit Your Own Questions and Answers

Source spec: `specs/edit-posts-spec.md` (acceptance criteria are referenced as AC1-AC23). Paths are relative to `devanswers-backend/` (BE) or `devanswers-frontend/` (FE). Tasks are ordered bottom-up with a checkpoint after each phase.

Key point: the PUT routes, controllers, and frontend endpoint constants already exist. This plan hardens the existing services and adds the missing frontend. No new routes are created.

Conventions to follow (CLAUDE.md): routes -> controllers -> services -> models; `{ success, message, data }` envelope; errors via `createAppError` (validation errors must be `createAppError(msg, 400)`, not Mongoose `ValidationError`, which the error handler turns into a 500); frontend endpoint config -> service -> Redux slice -> component; thunks use `rejectWithValue(error.response?.data?.message ...)`.

---

## Phase 1: Backend tests (write first; they must fail for the right reason)

### T1. Question service unit tests: `BE/tests/unit/services/questionService.test.js` (modify)
- What: in the `updateQuestionService` block (existing cases near "should update and return question" and the 404 case) add: author success sets `editedAt` and returns a populated document; non-author 403; non-author with `isAdmin: true` 403; blank/whitespace title 400; blank description 400; `tags` missing, non-string, `[]`, `""`, `" , ,"` all 400; `"a, a, b"` yields two tag ids; values saved trimmed; nothing saved when validation fails; `editedAt` not set on failure; malformed id 400. Adjust the existing happy-path test, because the mocked update chain will now also be populated and carries `editedAt`.
- Criteria: AC1, AC3, AC4, AC5, AC6, AC7, AC8.
- Verify: `npx vitest run tests/unit/services/questionService.test.js` -> new cases fail, old ones pass or fail only where the mocks need adjusting.

### T2. Answer service unit tests: `BE/tests/unit/services/answerService.test.js` (modify)
- What: in the `updateAnswerService` block add: author success sets `editedAt`; non-author 403; admin non-author 403; blank/whitespace/non-string/missing `answerText` 400; text saved trimmed; malformed id 400; `editedAt` untouched on failure.
- Criteria: AC2, AC3, AC4, AC5, AC7.
- Verify: new cases fail.

### T3. Controller unit tests: `BE/tests/unit/controllers/questionController.test.js` and `answerController.test.js` (modify only if needed)
- What: confirm the update tests still describe the envelope and statuses; the controllers do not change. Check the admin user at `questionController.test.js` around line 227 belongs to a delete test (it should stay) and not an update test (it must be changed).
- Criteria: AC11, AC12.
- Verify: controller tests pass before and after.

### T4. Integration tests: `BE/tests/integration/questions.test.js` and `BE/tests/integration/answers.test.js` (modify)
- What:
  - Invert "should allow an admin to update any question" (`questions.test.js` ~line 332) and "should allow an admin to update any answer" (`answers.test.js` ~line 276) to expect 403 and an unchanged post; rename them accordingly. Keep the delete-by-admin tests untouched.
  - Add: author update returns 200 with populated `author`/`tags` and non-null `editedAt`; 400 for blank fields, bad tags, malformed id; 401; 404; GET after update shows new content and `editedAt` on the question (and on the edited answer only); GET twice and an upvote on a never-edited question leave `editedAt` null; second edit moves `editedAt` forward; `"a, a, b"` produces two tags.
- Criteria: AC1-AC12.
- Verify: new/inverted cases fail; run the full integration suite first to record a baseline.

Checkpoint 1: new tests fail for the expected reasons; unrelated backend tests still pass (`npm test`).

---

## Phase 2: Backend implementation

### T5. Models: `BE/src/models/Question.js` and `BE/src/models/Answer.js` (modify)
- What: add `editedAt: { type: Date, default: null }` to both schemas. Nothing else changes (no `pre` hooks; only the update services will set it).
- Criteria: AC8, AC10.
- Verify: documents created without it have `editedAt === null`; `GET /api/questions/:id` JSON includes `editedAt` for the question and each answer.

### T6. Question service: `BE/src/services/questionService.js` (modify `updateQuestionService` only)
- What, in this order inside the function:
  1. Validate the id with `mongoose.isValidObjectId` -> 400.
  2. Validate `title` and `description` are non-blank strings after trim, and `tags` is a string with at least one non-empty entry after splitting on commas -> 400 with a message naming the field.
  3. Load the question -> 404 if missing.
  4. Ownership: only `question.author.toString() === loggedInUser.id.toString()`; remove `|| loggedInUser.isAdmin` -> 403.
  5. Parse tags: trim, drop empties, de-duplicate, then find-or-create `Tag` documents. Handle a duplicate-key error on concurrent creation by re-querying the tag instead of failing. An optional shared helper (used by the update path only unless create's behaviour stays identical) may hold this logic.
  6. Save trimmed `title`/`description`, the tag ids, and `editedAt: new Date()`.
  7. Return the question populated with `author` (`name`) and `tags`, matching the GET shape (without `answers`).
- Do not change `createQuestionService`, `deleteQuestionService` (keeps its admin bypass), or `getQuestionByIdService`.
- Criteria: AC1, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC11.
- Verify: T1 passes; `deleteQuestionService` tests unchanged and green.

### T7. Answer service: `BE/src/services/answerService.js` (modify `updateAnswerService` only)
- What: validate id (400); validate `answerText` is a non-blank string after trim (400); load answer (404); author-only check with no admin bypass (403); set trimmed `answerText` and `editedAt = new Date()`; `save()`; return the answer with `author` populated (name), as today. `deleteAnswerService` keeps its admin bypass.
- Criteria: AC2, AC3, AC4, AC5, AC7, AC8, AC9, AC11.
- Verify: T2 passes.

### T8. Controllers and routes: `BE/src/controllers/questionController.js`, `answerController.js`, `routes/questions.js`, `routes/answers.js` (no change expected)
- What: confirm they already pass the body through and return the 200 envelope; make no edit unless T3/T4 reveal a gap. Note in the commit message that no route changes were needed.
- Criteria: AC1, AC2, AC10, AC11.
- Verify: T3 and T4 pass; `npm test` green in full.

Checkpoint 2: whole backend suite green, including the inverted admin tests.

---

## Phase 3: Frontend data layer

### T9. Endpoint config: `FE/src/config/config.js` (no change expected)
- What: confirm `QUESTION_API.UPDATE(id)` and `ANSWER_API.UPDATE(answerId)` exist (they do). Add nothing.

### T10. Services: `FE/src/services/questionService.js` and `FE/src/services/answerService.js` (modify)
- What: add `updateQuestion(id, { title, description, tags }, token)` and `updateAnswer(answerId, answerText, token)` using `axiosInstance.put` with the same `Authorization: Bearer` header style as the existing calls; return `res.data.data`.
- Criteria: AC15, AC18, AC19.
- Verify: used by slice tests (T18) and msw handlers (T17).

### T11. Slice: `FE/src/reducers/questionSlice.js` (modify)
- What:
  - Add thunks `updateQuestion` and `updateAnswer` (token from `getState().user.userInfo`; `rejectWithValue(error.response?.data?.message ...)` so the form can show the server message).
  - Reducers: `updateQuestion.fulfilled` merges only `title`, `description`, `tags`, `editedAt` into `currentQuestion` (and the matching entry in `questions[]` if present), preserving `answers` and `author`. `updateAnswer.fulfilled` replaces the matching answer in `currentQuestion.answers` by `_id`, merging the response over the existing object. No `pending` handler sets `state.loading`, and `rejected` does not set `state.error` (page-level) because that would replace the whole page with the error view; the component shows the rejected message locally.
  - Per-item pending is tracked in the component via the thunk promise (`unwrap()`), so no new global flag.
- Criteria: AC18, AC19, AC20, AC22, AC23.
- Verify: slice tests (T18).

---

## Phase 4: Frontend UI

### T12. Question edit: `FE/src/components/Question/QuestionContent.jsx` (modify) and `FE/src/components/Question/QuestionEditForm.jsx` (create, optional extraction)
- What: read `userInfo` from the store; show a pencil (`FaPencilAlt`, `aria-label="Edit question"`) beside the title only when `userInfo` exists and `String(question.author?._id) === userInfo.userId`. Clicking switches the title/description/tags area to an inline form pre-filled from the question (tags as `"a, b, c"` from `question.tags.map(t => t.name)`). Save is disabled while pending or while title/description/tags are blank after trim; Cancel restores the read view with no request; on success leave edit mode; on failure keep the form and show the server message in an inline `Alert`. Show a muted "edited" label (tooltip with `formatDate(editedAt)`) next to the "Asked" date only when `question.editedAt` is set. Keep the existing `VoteButtons` and layout.
- Criteria: AC13-AC22.
- Verify: log in as an author, edit a question; non-author and anonymous see no pencil; component tests (T19).

### T13. Answer edit: `FE/src/components/Answer/AnswerList.jsx` (modify) and `FE/src/components/Answer/AnswerItem.jsx` (create)
- What: extract the per-answer markup from the `.map` into `AnswerItem` so each answer owns its edit state (several can be open at once). Pencil (`aria-label="Edit answer"`) only when `String(answer.author?._id) === userInfo.userId`; inline textarea pre-filled with `answerText`; Save disabled while pending or blank; Cancel discards; error shown inline and text kept; "edited" label with tooltip when `answer.editedAt` is set. `AnswerList` keeps the summarize logic, the heading, and the empty state unchanged.
- Criteria: AC13, AC15-AC19, AC21, AC22.
- Verify: edit own answer, another answer's open form is unaffected; other users' answers show no pencil; component tests (T19).

### T14. Confirm list views are untouched: `FE/src/components/Question/QuestionCard.jsx`, `QuestionList.jsx`, `FE/src/pages/Question/Home.jsx` (no change)
- What: no pencil, form, or edited label is added anywhere in list views.
- Criteria: AC14.
- Verify: home feed, tag feed and profile show no edit controls (manual check and a small test, T19).

### T15. `FE/src/pages/Question/QuestionDetail.jsx` (no change expected)
- What: it keeps its `if (loading)` spinner. Verify that the new thunks never set `loading`, so an edit does not trigger it (AC23). Only touch this file if the verification reveals a regression.

Checkpoint 3: `npm run lint` and `npm run build` pass in FE.

---

## Phase 5: Frontend tests

### T16. Mock data: `FE/tests/mocks/mockData.js` (modify)
- What: add `editedAt` (null and a date) and an authored question/answer for the logged-in mock user.

### T17. Mock handlers: `FE/tests/mocks/handlers.js` (modify)
- What: msw handlers for `PUT /questions/:id` and `PUT /answers/:answerId`: success (populated response, `editedAt` set), 400, 403.
- Criteria: supports AC15-AC22.

### T18. Slice tests: `FE/tests/unit/reducers/questionSlice.test.jsx` (modify)
- What: `updateQuestion.fulfilled` merges fields and keeps `answers`/`author`; `updateAnswer.fulfilled` replaces one answer; rejected leaves state intact and does not set page `error`; neither thunk sets `loading` at any stage.
- Criteria: AC18, AC20, AC23.

### T19. Component and flow tests (modify/create)
- `FE/tests/unit/components/QuestionContent.test.jsx` (modify): pencil only for the author; click shows pre-filled form; cancel discards without a request; blank disables Save; save shows new content; server error shown with text kept; "edited" label only with `editedAt`. Existing tests keep passing with their mock stores (`question` and `user` reducers only).
- `FE/tests/unit/components/AnswerList.test.jsx` (modify) and `FE/tests/unit/components/AnswerItem.test.jsx` (create): the same matrix per answer; two answers have independent edit state; other users' answers have no pencil.
- `FE/tests/unit/components/QuestionCard.test.jsx` or a Home test (modify): no pencil on list views.
- `FE/tests/integration/questionFlow.test.jsx` (modify): login, open an own question, edit, see the update without the spinner; a non-author sees no pencil.
- Criteria: AC13-AC22.

Checkpoint 4: `npm test` green in FE, including all pre-existing tests.

---

## Phase 6: Full verification

### T20. Full test run
- BE: `npm test`. FE: `npm test`, `npm run lint`, `npm run build`. Allowed edits to existing tests: the two inverted admin-update integration tests, adjusted update unit tests in T1/T2, and msw/mock additions. Nothing else (AC12).

### T21. Manual verification checklist (both servers up, seeded data; use two normal users and one admin)
1. Log in as user A, open a question A wrote: pencil visible on the question; log in as user B: no pencil on A's question. Anonymous: no pencil. (AC13)
2. Home feed and tag feed: no pencil or edit controls anywhere. (AC14)
3. As A, click the pencil: form pre-filled with title, description, and tags as "a, b". Cancel: original content back, no request in the network tab. (AC15, AC16)
4. Clear the title: Save is disabled. Change title, description and tags, Save: content updates immediately, no reload, no page spinner, answers still listed, author name and tag badges intact. (AC17, AC18, AC20, AC23)
5. The question now shows "edited"; a never-edited question shows nothing. Reload: still saved and still "edited". (AC21, AC22)
6. As A on a question with several answers, edit A's own answer: pencil only on A's answers; text updates in place with "edited"; B's answer has no pencil. Open two edit forms at once: they stay independent. (AC13, AC15, AC18, AC21)
7. Vote on and view an unedited question several times: it still shows no "edited" label. (AC8)
8. Error path: stop the backend and Save: form stays open, text kept, message shown. (AC19)
9. API checks (curl/REST client): non-author PUT -> 403; admin non-author PUT -> 403; blank title -> 400; `tags: ""` -> 400; malformed id -> 400; unknown id -> 404; no token -> 401; admin DELETE of someone else's post still works. (AC3-AC6, AC11)
10. Smoke-test existing flows: register, login, vote, post answer, Improve Question and Summarize Answers if a Gemini key is set, and the Bookmarks feature if already built. (AC12)

---

## Risks to watch while implementing
- Existing unit tests mock the model chain; changing `updateQuestionService` (populate, `editedAt`, tag handling) means adjusting those mocks. Do that in T1/T2, not by loosening assertions.
- Never set `state.question.loading` or the page-level `error` from edit thunks: both replace the whole page and unmount the open form.
- The question PUT response has no `answers`: merge only the changed fields so answers and author survive.
- `author._id` and `userInfo.userId` are strings in JSON; compare with `String(...)` and guard on `userInfo`.
- Keep `deleteQuestionService` and `deleteAnswerService` admin behaviour exactly as is.
- Do not use `updatedAt` for the indicator; only `editedAt`.
