# Spec: Edit Your Own Questions and Answers

## 1. Summary and goals

An author can edit the questions and answers they posted, only from the single-question page (`/question/:id`). Authors see a small pencil icon on their own question (edit title, description, tags) and on each of their own answers (edit answer text). Saving updates the post in place without a page reload. Posts that have been edited show an "edited" indicator; never-edited posts do not. Only the author may edit: the UI hides the pencil for everyone else and the server rejects non-authors with 403.

Decisions already made (Stage 1 brainstorm):
- The PUT endpoints already exist. Do not create new routes; harden the existing ones.
- Author only. Remove the admin bypass from the two update services only. Delete services keep their admin bypass.
- Add an `editedAt` Date field on Question and Answer, set only by the update services.
- Add 400 validation for blank/invalid input on both update endpoints.
- The question update response is populated (author name, tags) like the GET response.
- The frontend uses per-item pending state and never touches the shared `question.loading` flag.

## 2. Out of scope

- Deleting questions or answers.
- Edit affordances or edit forms on the home feed, tag views, profile or any list view.
- Edit history / revision log, "edited by" metadata.
- Admins editing other users' posts.
- Changing how questions and answers are created (including the existing crash on missing `tags` in create).
- Editing votes, views, or the question an answer belongs to.

## 3. What already exists

Backend (`devanswers-backend/src/`):
- `routes/questions.js`: `PUT /:id` with `authenticate` -> `controllers/questionController.js` `updateQuestion` -> `services/questionService.js` `updateQuestionService(id, title, description, tags, loggedInUser)`. It returns 404 for a missing question, 403 for a non-author, parses `tags` as a comma-separated string, find-or-creates `Tag` documents, then `findByIdAndUpdate(..., { new: true })`.
- `routes/answers.js`: `PUT /:answerId` with `authenticate` -> `controllers/answerController.js` `updateAnswer` -> `services/answerService.js` `updateAnswerService(answerId, answerText, loggedInUser)`. It returns 404/403 the same way, sets `answerText`, `save()`, and returns the answer with `author` populated (name).
- Both ownership checks are `author.toString() !== loggedInUser.id.toString() && !loggedInUser.isAdmin`. This `isAdmin` bypass is what must go (update only).
- `middleware/authHandler.js` (sets `req.user = { id, isAdmin }`), `utils/createAppError.js`, `middleware/errorHandler.js` (`{ success: false, message }`, status from `err.statusCode`, otherwise 500).
- `models/Question.js` and `models/Answer.js`: `timestamps: true`, `title`/`description` and `answerText` are `required` strings. No `editedAt`/`isEdited` field exists.
- `getQuestionByIdService` returns a populated question (`author {_id, name}`, `tags [{_id, name}]`) with `answers` attached (each with populated author).
- Why `updatedAt` cannot be the "edited" signal: `getQuestionByIdService` does `findByIdAndUpdate({ $inc: { views: 1 } })` (every view) and `voteService.handleVote` calls `document.save()` (every vote). Both bump `updatedAt` through the `timestamps` option.
- Existing tests: integration PUT cases (200/401/403/404 and "admin can update") in `tests/integration/questions.test.js` and `tests/integration/answers.test.js`; unit tests for the update services and controllers under `tests/unit/`.

Frontend (`devanswers-frontend/src/`):
- `config/config.js` already has `QUESTION_API.UPDATE(id)` and `ANSWER_API.UPDATE(answerId)`. No new endpoint constants needed.
- `services/questionService.js` and `services/answerService.js`: no update functions. Existing calls take `(…, token)` and send `Authorization: Bearer`.
- `reducers/questionSlice.js`: `currentQuestion` state; thunks use `rejectWithValue(error.response?.data?.message ...)`; `fetchQuestionById.pending` and `postAnswer.pending` set the shared `loading = true`. There are no update thunks.
- `pages/Question/QuestionDetail.jsx`: `if (loading)` returns a full-page `<Spinner />` (lines 22-28). Any thunk that sets `loading` would unmount the edit form. It renders `QuestionContent`, `AnswerList` (answers rendered inline in a `.map`, no separate item component), `AnswerForm`.
- `components/Question/QuestionContent.jsx` (title card, description, tag badges, "Posted by") and `components/Answer/AnswerList.jsx` (already reads `state.user.userInfo`).
- `components/Shared/VoteButtons.jsx` already compares `authorId === userInfo?.userId` (string vs string) for the self-vote guard. Same comparison works for the pencil.
- `pages/Question/PostQuestion.jsx` has the title/description/tags form fields and the comma-separated tags convention (reference for the edit form; it is a page, not a reusable component).
- `react-icons/fa` is installed (`FaPencilAlt` available). `utils/timeFormat.js` has `formatDate`.
- Frontend tests: `tests/unit/{components,pages,reducers}`, `tests/integration/*Flow.test.jsx`, msw `tests/mocks/handlers.js` (no PUT handlers for questions/answers).

## 4. User stories

1. As the author of a question, I click a pencil on my question, change the title, description or tags, and save; the page shows the new content immediately.
2. As the author of an answer, I click a pencil on my answer, change its text, and save; the answer updates in place.
3. As a reader, I see "edited" on posts that were edited and nothing on posts that were not.
4. As any other user (or a visitor), I never see a pencil on posts that are not mine, and cannot edit them even by calling the API.
5. As an author, I can cancel an edit and my changes are discarded; I cannot save a blank post.

## 5. Acceptance criteria

Backend
1. `PUT /api/questions/:id` by the author with valid `title`, `description`, `tags` returns 200 with the updated, populated question and a non-null `editedAt`.
2. `PUT /api/answers/:answerId` by the author with valid `answerText` returns 200 with the updated answer (author populated) and a non-null `editedAt`.
3. A non-author gets 403 on both endpoints, including users with `isAdmin: true`; the post is unchanged and `editedAt` is not set.
4. No token or invalid token gives 401; unknown id gives 404; malformed id gives 400 (not 500).
5. Blank or whitespace-only `title`, `description` or `answerText`, a missing field, or a non-string field gives 400 with a clear message, and nothing is saved.
6. `tags` that is missing, not a string, or has no non-empty tag after splitting on commas gives 400 (not 500); empty entries and duplicates are dropped; tags are trimmed.
7. Values are stored trimmed.
8. `editedAt` is absent/null on a post that was never edited, and is not changed by views, votes, or answer creation.
9. A second successful edit moves `editedAt` forward.
10. `GET /api/questions/:id` includes `editedAt` for the question and for each answer (no extra code beyond the schema field, since the whole document is returned).
11. Delete behaviour is unchanged (admin may still delete).
12. All other existing backend tests pass, with the two "admin can update" tests changed to expect 403.

Frontend
13. On `/question/:id`, a pencil appears on the question only when `String(question.author._id) === userInfo.userId`, and on an answer only when `String(answer.author._id) === userInfo.userId`. Anonymous users and other users see no pencil.
14. No pencil, edit form, or edit-related control renders on the home feed, tag-filtered feed, or profile.
15. Clicking the pencil swaps that post into an edit form pre-filled with the current content (question: title, description, tags as "a, b, c"; answer: text). Each post has independent edit state, so several posts can be in edit mode at once.
16. Cancel restores the read view with the original content and sends no request.
17. Save is disabled while a save is pending for that post, and while required fields are blank (after trim). Client validation mirrors the server rules.
18. On success the post shows the new content immediately and leaves edit mode, with no page reload, without the page-level spinner, and without losing other posts' state (e.g. another answer's open edit form, scroll position).
19. On failure (400/403/404/network) the form stays open with the user's text intact and shows the server message.
20. After a question update the page still shows its answers, author name and tag badges (response is merged into `currentQuestion`; `answers` and `author` are not overwritten by a response that lacks them).
21. An "edited" label appears next to a post when `editedAt` is set (tooltip or text with the edit date) and is absent when it is not.
22. A reload of the page shows the saved content and the "edited" label.
23. Edit requests never set `state.question.loading`.

## 6. Edge cases and error cases

| Case | Expected |
|---|---|
| Non-author calls PUT (question or answer) | 403 `Not authorized to update this ...`, no change |
| Admin (not author) calls PUT | 403 (bypass removed for update) |
| Admin (not author) calls DELETE | Still allowed (unchanged) |
| Question/answer id does not exist | 404 |
| Malformed id (not an ObjectId) | 400 |
| Blank title, description or answerText (`""`, spaces) | 400, nothing saved |
| `tags` missing, `[]`, `""`, `" , ,"` | 400 |
| `tags` `"a, a, b"` | Saved as two tags (`a`, `b`) |
| New tag name not in DB | Tag created (existing find-or-create behaviour) |
| Two simultaneous updates creating the same new tag | Must not 500 on duplicate key; retry the find, or treat a duplicate-key error as "use existing" |
| Edit saved with identical content | Allowed; sets `editedAt` (see open question 2) |
| Author edits, other user views | Other user sees the new content and the edited label |
| Token expired mid-edit | 401 shown in the form, text kept |
| Question update response lacks `answers` | Frontend merges only changed fields; answers preserved |
| Logout while editing | Form disappears (pencil depends on `userInfo`) |
| Existing seeded posts without `editedAt` | Treated as never edited, no migration |

## 7. API contract

No new routes. Both existing routes keep their method, path, auth and envelope; only validation, authorization (no admin bypass), the `editedAt` side effect and the populated question response change.

### PUT `/api/questions/:id`
- Auth: `Authorization: Bearer <token>`; caller must be the question's author.
- Request body: `{ "title": string, "description": string, "tags": "comma, separated, string" }` (all required, non-blank after trim).
- 200: `{ "success": true, "message": "Question updated successfully", "data": { _id, title, description, tags: [{ _id, name }], author: { _id, name }, voteCount, views, createdAt, updatedAt, editedAt } }`
- Errors: 400 (invalid id or invalid body, message names the field), 401, 403 `Not authorized to update this question`, 404 `Question not found`.

### PUT `/api/answers/:answerId`
- Auth: Bearer token; caller must be the answer's author.
- Request body: `{ "answerText": string }` (required, non-blank after trim).
- 200: `{ "success": true, "message": "Answer updated successfully", "data": { _id, questionId, answerText, author: { _id, name }, voteCount, createdAt, updatedAt, editedAt } }`
- Errors: 400, 401, 403 `Not authorized to update this answer`, 404 `Answer not found`.

Validation errors are raised with `createAppError(message, 400)` in the service (not Mongoose `ValidationError`, which the error handler would turn into a 500).

## 8. Data model changes

- `models/Question.js`: add `editedAt: { type: Date, default: null }`.
- `models/Answer.js`: add `editedAt: { type: Date, default: null }`.
- Only `updateQuestionService` and `updateAnswerService` write it (`new Date()`).
- No migration, no seed change. `null`/absent means never edited.

## 9. UI behaviour

- **Pencil**: small icon button (`FaPencilAlt`), `aria-label="Edit question"` / `"Edit answer"`, only for the author on the question page. Question: in the title card next to the title. Answer: in the answer meta row next to the author/date.
- **Edit form (question)**: inline in the question card; fields title, description, tags (comma-separated text), Save and Cancel buttons. Pre-filled from `currentQuestion`.
- **Edit form (answer)**: inline textarea in the answer card replacing the text; Save and Cancel.
- **Edited indicator**: muted "edited" text beside the "Asked/Answered" date when `editedAt` is set; `title` attribute shows `formatDate(editedAt)`.
- **States**: pending (Save shows "Saving...", disabled), error (inline `Alert` with the server message, form stays open), success (read view with new content).
- **State management**: new thunks `updateQuestion` and `updateAnswer` in `questionSlice.js`. They do not set `state.loading`. Pending per item is tracked locally in the component (or as `updating` ids in the slice). `updateQuestion.fulfilled` merges `title`, `description`, `tags`, `editedAt` into `currentQuestion` (and into `questions[]` if present) and keeps `answers`/`author`. `updateAnswer.fulfilled` replaces the matching entry in `currentQuestion.answers` by `_id`, preserving fields the response lacks.
- **Where not shown**: `QuestionCard`/`QuestionList` get no pencil or edit form.
- Extracting an `AnswerItem` component from the `AnswerList` map is allowed so each answer owns its edit state.

## 10. File list

Modify (backend):
- `src/services/questionService.js` (`updateQuestionService`: validation, ownership without admin bypass, `editedAt`, populated return, safe tag parsing; may extract a shared tag-resolving helper)
- `src/services/answerService.js` (`updateAnswerService`: validation, ownership without admin bypass, `editedAt`)
- `src/models/Question.js`, `src/models/Answer.js` (add `editedAt`)
- `src/controllers/questionController.js` / `answerController.js` only if needed (they already pass the body through)
- `tests/integration/questions.test.js`, `tests/integration/answers.test.js` (admin-update tests now expect 403; add new cases)
- `tests/unit/services/questionService.test.js`, `answerService.test.js` (update/extend; fix any admin-bypass unit tests)

Create (backend): none.

Modify (frontend):
- `src/services/questionService.js` (add `updateQuestion`), `src/services/answerService.js` (add `updateAnswer`)
- `src/reducers/questionSlice.js` (two thunks and reducers)
- `src/components/Question/QuestionContent.jsx` (pencil, form, edited label)
- `src/components/Answer/AnswerList.jsx` (pencil, form, edited label per answer)
- `tests/mocks/handlers.js`, `tests/mocks/mockData.js` (PUT handlers)
- Existing `QuestionContent`/`AnswerList`/`questionDetail` tests if they break (mock stores only have `question` and `user` reducers)

Create (frontend, optional):
- `src/components/Question/QuestionEditForm.jsx`, `src/components/Answer/AnswerItem.jsx` (+ `AnswerEditForm.jsx`) and their tests.

## 11. Test list

Backend (write first):
- Unit `updateQuestionService`: author success sets `editedAt` and returns populated doc; non-author 403 (including `isAdmin: true`); 404; blank title/description 400; invalid tags (missing, non-string, empty after split) 400; trimming and deduping; `editedAt` not set on failure.
- Unit `updateAnswerService`: author success sets `editedAt`; non-author/admin 403; 404; blank/non-string text 400; trimming.
- Controller unit tests: envelope and status codes unchanged.
- Integration `questions.test.js`: update-by-author (200, `editedAt` set, populated author/tags); admin-not-author now 403 (replaces "admin can update"); 400 blank/invalid tags; 400 malformed id; 401; 404; GET after update shows new content and `editedAt`; GET twice and an upvote do not set `editedAt` on a never-edited question.
- Integration `answers.test.js`: same matrix; GET question shows `editedAt` on the edited answer only.
- Regression: delete by admin still works.

Frontend:
- Slice: `updateQuestion.fulfilled` merges fields and keeps `answers`; `updateAnswer.fulfilled` replaces one answer; rejected leaves state; neither sets `loading`.
- `QuestionContent`: pencil only for author; click shows pre-filled form; cancel discards; blank disables Save; save dispatches and shows new content; error shown; edited label only with `editedAt`.
- `AnswerList`/`AnswerItem`: same, per answer; two answers have independent edit state; other users' answers have no pencil.
- `QuestionCard`/`Home`: no pencil on list views.
- Integration flow (msw): login, open own question, edit, see update without spinner; non-author sees no pencil.
- Regression: full backend and frontend suites pass.

## 12. Resolved decisions (from review)

1. The two "admin can update" integration tests are inverted to expect 403 (not deleted), so the new rule stays covered.
2. A save with unchanged content still sets `editedAt` (simplest, and it matches what the user did).
3. The "edited" label shows on the question page only, not on feed cards.
4. Tag names stay case-sensitive, as create does today.
5. The create endpoint is left untouched. A shared tag helper may be extracted only if create's behaviour stays identical.
6. No length limits are added.

## 13. Remaining open questions

None.
