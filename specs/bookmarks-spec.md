# Spec: Bookmark Questions for Later

## 1. Summary and goals

A logged-in user can save (bookmark) questions and unsave them. A bookmark icon appears on every question card (home feed, tag-filtered feed, profile list) and on the question detail page, and shows saved vs unsaved state. The user sees all their saved questions in a "Saved Questions" section on the Profile page, with a friendly empty state. Saves are per-user and persist across reloads.

Decisions already made (from the Stage 1 brainstorm):
- Storage: a `bookmarks` array of Question ids on the `User` model.
- The frontend learns saved ids from a separate GET endpoint, fetched on app load when a session exists. The login payload is unchanged.
- The saved-questions list returns `[]` with HTTP 200 when empty.
- Bookmark loading/error state is kept in its own slice, separate from the shared `question.loading` flag.

## 2. Out of scope

- Bookmarking answers.
- Folders, tags, notes, sharing, exporting of saved questions.
- Deleting questions or answers (a deleted question simply disappears from the saved list).
- Fixing the existing broken Profile stats call (`USER_API.STATS` points at a route that does not exist).
- Adding `isBookmarked` flags to the public question endpoints.

## 3. What already exists

Backend (`devanswers-backend/src/`):
- `middleware/authHandler.js`: `authenticate` sets `req.user = { id: ObjectId, isAdmin }`; throws 401 when the token is missing/invalid. Reuse for all bookmark routes.
- `utils/createAppError.js`: `createAppError(message, statusCode)`. `middleware/errorHandler.js` returns `{ success: false, message }`.
- `models/User.js`: `name, email, password, profileImage, isAdmin` (no bookmark field).
- `models/Question.js`: `author` refs User, `tags` refs Tag; vote arrays use `[{ type: ObjectId, ref: "User" }]` (pattern to follow).
- `services/tagService.js` `getQuestionsByTagService`: populate `author` (name) and `tags`, sort `createdAt` desc, attach `answerCount`. Template for the saved-questions query.
- `routes/index.js` mounts `/auth`, `/questions`, `/answers`, `/tags`. There is no `/users` router.
- `controllers/authController.js` login returns `{ token, userId, name }`. There is no `/auth/me`.
- Nothing bookmark-related exists (grep for bookmark/saved is empty).

Frontend (`devanswers-frontend/src/`):
- `config/config.js` holds endpoint constants; `USER_API` currently has only `STATS`.
- `services/questionService.js`: axios calls take `(…, token)` and pass `Authorization: Bearer` header manually.
- `reducers/userSlice.js`: `userInfo = { token, userId, name }` restored from localStorage; `logout` action; no saved-id state. `store.js` registers `user`, `question`, `theme`.
- `components/Question/QuestionCard.jsx` (card used by lists) and `QuestionContent.jsx` (detail title card; has no user/author logic yet).
- `components/Question/QuestionList.jsx`: takes `questions` prop; own search/sort/pagination (5 per page); empty state text is hardcoded ("No questions found ... be the first to ask!").
- `pages/Profile/Profile.jsx`: redirects to `/login` when unauthenticated; no saved section.
- `react-icons/fa` is installed (`FaBookmark`, `FaRegBookmark` available).
- Tests: backend `tests/{unit,integration}` (vitest, supertest, mongodb-memory-server); frontend `tests/{unit,integration,mocks}` with msw (`tests/mocks/handlers.js`).

## 4. User stories

1. As a logged-in user, I click a bookmark icon on a question to save it, and click again to unsave it.
2. As a logged-in user, I see at a glance which questions I have saved (filled vs outline icon).
3. As a logged-in user, I see all my saved questions in one place on my profile and can open or unsave them from there.
4. As a visitor who is not logged in, I cannot save questions and am sent to log in if I try.
5. As a user, my saved set never affects, and is never visible to, another user.

## 5. Acceptance criteria

Backend
1. `PUT /api/users/me/bookmarks/:questionId` with a valid token adds the question to the caller's `bookmarks` and returns 200.
2. Calling it twice leaves exactly one entry (idempotent, no duplicates).
3. `DELETE /api/users/me/bookmarks/:questionId` removes it and returns 200; calling it when not bookmarked also returns 200.
4. `GET /api/users/me/bookmarks/ids` returns the caller's saved question ids as strings; `[]` with 200 when none.
5. `GET /api/users/me/bookmarks` returns the caller's saved questions, populated (author name, tags) with `answerCount`, newest first; `[]` with 200 when none.
6. All four endpoints return 401 without a valid token.
7. Saving a question that does not exist returns 404; a malformed id returns 400.
8. User A's saves never appear in user B's responses.
9. If a saved question has been deleted, `GET /api/users/me/bookmarks` omits it without error.
10. Existing endpoints (login/register, question, answer, vote, tag, AI) behave exactly as before; login payload is unchanged.

Frontend
11. On app load with a stored session, saved ids are fetched; saved questions render with a filled icon immediately after that fetch resolves.
12. After login, saved ids are fetched; after logout they are cleared and all icons render as outline.
13. Every `QuestionCard` and the question detail title card show a bookmark control, outline when unsaved and filled when saved, with an accessible label ("Save question" / "Remove bookmark").
14. Clicking the control toggles the icon immediately (optimistic) without a page reload; if the request fails the icon reverts and an error message is shown.
15. While a toggle request for a question is pending, its control is disabled (no double toggles).
16. An anonymous visitor clicking the control is redirected to `/login`; no API call is made.
17. Profile shows a "Saved Questions" section rendered with `QuestionList`. Unsaving from it removes that question from the section immediately.
18. With no saved questions, the section shows "No saved questions yet" (with a hint to use the bookmark icon), not the generic "No questions found" text.
19. Saves persist across a full page reload.
20. Bookmark requests never set `state.question.loading`; the question detail page does not flash its spinner when toggling.

## 6. Edge cases and error cases

| Case | Expected |
|---|---|
| No / invalid / expired token on any bookmark endpoint | 401 (existing `authenticate` behaviour) |
| `questionId` not a valid ObjectId | 400 `Invalid question id` (do not let a CastError become a 500) |
| `questionId` valid but no such question (PUT) | 404 `Question not found` |
| `questionId` valid, no such question (DELETE) | 200 (idempotent, `$pull` of an absent id is harmless) |
| Save same question twice / unsave when not saved | 200, no duplicate, no error |
| Bookmark own question | Allowed |
| Saved question later deleted | Omitted from the list endpoint; id may remain in ids endpoint, and the frontend ignores ids with no matching card |
| User has zero saves | Ids and list endpoints return `[]` with 200 (never 404, unlike `getAllQuestionsService`) |
| Network failure on toggle | Revert optimistic change, show error |
| Logout then login as another user | Previous user's saved ids/list are cleared before the new fetch |
| Last item on a profile page is unsaved | `QuestionList` page index is clamped to the last valid page |
| Existing mock-store tests without a bookmark reducer | Selectors default safely (`state.bookmark?.ids ?? []`) so they do not break |

## 7. API contract

All responses use `{ success, message, data }`. Errors are raised with `createAppError`. All routes require `Authorization: Bearer <token>`. New router `routes/users.js` mounted at `/users` in `routes/index.js`. `me` always means the authenticated user; there is no way to read another user's bookmarks.

| Method | Path | Request | Success response | Errors |
|---|---|---|---|---|
| PUT | `/api/users/me/bookmarks/:questionId` | none | 200 `{ success: true, message: "Question bookmarked", data: { questionId, isBookmarked: true } }` | 400, 401, 404 |
| DELETE | `/api/users/me/bookmarks/:questionId` | none | 200 `{ success: true, message: "Bookmark removed", data: { questionId, isBookmarked: false } }` | 400, 401 |
| GET | `/api/users/me/bookmarks/ids` | none | 200 `{ success: true, message: "Bookmark ids fetched successfully", data: ["<id>", ...] }` | 401 |
| GET | `/api/users/me/bookmarks` | none | 200 `{ success: true, message: "Bookmarked questions fetched successfully", data: [ { ...question, author: {_id, name}, tags: [...], answerCount } ] }` | 401 |

Notes:
- `PUT`/`DELETE` use `$addToSet` / `$pull` on `User.bookmarks` so they are atomic and idempotent.
- Ids are returned as strings (`String(id)`), matching `question._id` in JSON on the frontend.
- Static `/ids` is declared before any parameterised GET on the same prefix (there is none today, but keep the ordering rule from CLAUDE.md).

## 8. Data model changes

`models/User.js`: add
`bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }]` with `default: []`.

No migration needed: existing users have no field and Mongoose treats it as `[]`. No change to Question. The seed script needs no change.

## 9. UI behaviour

- **Bookmark control**: icon button using `FaRegBookmark` (unsaved) / `FaBookmark` (saved), tooltip/aria-label as above. Placed in the stats column of `QuestionCard` (under the answer count) and in the title card of `QuestionContent` (right side of the title row). Clicking it must not navigate to the question (stop propagation if inside a link).
- **State**: new `reducers/bookmarkSlice.js`, registered as `bookmark` in `store.js`:
  `{ ids: [], savedQuestions: [], pendingIds: [], listStatus, error }`.
  Thunks: `fetchBookmarkIds`, `fetchBookmarkedQuestions`, `toggleBookmark({ questionId, currentlySaved })`. Thunks use `getState().user.userInfo.token` and `rejectWithValue(error.response?.data?.message ...)` like the other slices. It listens to `user/logout` to reset itself.
- **Load**: `App.jsx` (or a small hook it uses) dispatches `fetchBookmarkIds` whenever `userInfo?.token` is set/changes.
- **Toggle**: optimistic update of `ids` (and removal from `savedQuestions` on unsave), mark id in `pendingIds`, rollback on rejection.
- **Profile**: new "Saved Questions" card below the existing profile content, fetches `fetchBookmarkedQuestions` on mount, shows a spinner while `listStatus` is pending, then `QuestionList` or the empty state.
- **QuestionList**: add optional props `emptyTitle` and `emptyMessage` (defaults keep today's text) so Profile can pass "No saved questions yet". Clamp `currentPage` when the list shrinks.
- **Anonymous**: icon is still visible, but clicking redirects to `/login`.

## 10. File list

Create (backend):
- `src/routes/users.js`
- `src/controllers/userController.js` (or `bookmarkController.js`)
- `src/services/bookmarkService.js`
- `tests/unit/services/bookmarkService.test.js`
- `tests/unit/controllers/bookmarkController.test.js`
- `tests/integration/bookmarks.test.js`

Modify (backend):
- `src/models/User.js` (add `bookmarks`)
- `src/routes/index.js` (mount `/users`)

Create (frontend):
- `src/services/bookmarkService.js`
- `src/reducers/bookmarkSlice.js`
- `src/components/Shared/BookmarkButton.jsx` (+ css if needed)
- `tests/unit/reducers/bookmarkSlice.test.jsx`, `tests/unit/components/BookmarkButton.test.jsx`

Modify (frontend):
- `src/config/config.js` (add `BOOKMARK_API` constants)
- `src/store.js` (register `bookmark`)
- `src/App.jsx` (fetch ids on session)
- `src/components/Question/QuestionCard.jsx`, `QuestionContent.jsx` (render `BookmarkButton`)
- `src/components/Question/QuestionList.jsx` (empty-state props, page clamp)
- `src/pages/Profile/Profile.jsx` (Saved Questions section)
- `tests/mocks/handlers.js`, `tests/mocks/mockData.js` (bookmark handlers/data)
- Existing tests that mount `QuestionCard`/`QuestionContent`/`Profile` only if the safe-selector defaults do not already keep them green.

## 11. Test list

Backend (write first):
- Unit service: add (new, duplicate), remove (present, absent), question-not-found 404, invalid id 400, list returns `[]` when empty, list omits deleted questions, ids returned as strings.
- Unit controller: 200 envelopes and status codes, passes `req.user.id` and `req.params.questionId`.
- Integration (supertest, register+login for token): PUT/DELETE/GET ids/GET list happy paths, 401 for each without token, 404/400 cases, idempotency, two-user isolation, list shape (author name, tags, answerCount), login response unchanged.

Frontend:
- Slice: ids loaded, optimistic toggle, rollback on failure, pending id handling, reset on `user/logout`, saved list removal on unsave, does not touch `question.loading`.
- `BookmarkButton`: outline vs filled, click dispatches toggle, anonymous click navigates to `/login`, disabled while pending.
- `QuestionCard` / `QuestionContent`: render the control; existing tests still pass with a store that has no `bookmark` reducer.
- Profile: shows saved list, empty state text, unsave removes item (msw handlers).
- `QuestionList`: custom empty props and page clamp.
- Regression: full backend and frontend suites pass.

## 12. Resolved decisions (from review)

1. Anonymous click redirects to `/login` with no API call (matches AC 16).
2. The saved list keeps the existing search/sort bar from `QuestionList`.
3. Saved questions are ordered by question `createdAt`, newest first. No `savedAt` is stored.
4. Deleting a question does not clean up bookmarks. Read-time filtering is enough because question deletion is out of scope.
5. `PUT`/`DELETE` return `{ questionId, isBookmarked }` only. The frontend already holds the id list in state.

## 13. Remaining open questions

None.
