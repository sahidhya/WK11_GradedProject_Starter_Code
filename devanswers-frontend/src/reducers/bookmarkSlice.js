import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  getBookmarkIds,
  getBookmarkedQuestions,
  addBookmark,
  removeBookmark,
} from "../services/bookmarkService.js";
import { logout } from "./userSlice.js";

// Bookmark state lives in its own slice on purpose: nothing here may touch
// state.question.loading, which makes QuestionDetail swap in a full-page spinner.
const initialState = {
  ids: [], // saved question ids (strings) - drives every bookmark icon
  savedQuestions: [], // full questions for the Profile "Saved Questions" list
  removedQuestions: {}, // questionId -> question removed optimistically (for rollback)
  pendingIds: [], // question ids with a toggle request in flight
  listStatus: "idle", // 'idle' | 'pending' | 'fulfilled' | 'rejected'
  error: null,
};

// A load that finishes after the user logged out (or another user logged in)
// must not write the previous user's saves into the store.
const STALE_SESSION = "stale-session";

// Loads just the saved ids (on app start / login). They drive every icon's filled state.
export const fetchBookmarkIds = createAsyncThunk(
  "bookmark/fetchBookmarkIds",
  async (_, { getState, rejectWithValue }) => {
    try {
      const { token } = getState().user.userInfo || {};
      const ids = await getBookmarkIds(token);
      if (getState().user.userInfo?.token !== token) {
        return rejectWithValue(STALE_SESSION);
      }
      return ids;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to load bookmarks",
      );
    }
  },
);

// Loads the full saved questions for the Profile page (each time it opens).
export const fetchBookmarkedQuestions = createAsyncThunk(
  "bookmark/fetchBookmarkedQuestions",
  async (_, { getState, rejectWithValue }) => {
    try {
      const { token } = getState().user.userInfo || {};
      const questions = await getBookmarkedQuestions(token);
      if (getState().user.userInfo?.token !== token) {
        return rejectWithValue(STALE_SESSION);
      }
      return questions;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to load saved questions",
      );
    }
  },
);

// Saves or unsaves one question. The reducers below update the UI immediately
// (optimistic) and undo the change if the request fails.
export const toggleBookmark = createAsyncThunk(
  "bookmark/toggleBookmark",
  async ({ questionId, currentlySaved }, { getState, rejectWithValue }) => {
    try {
      const { token } = getState().user.userInfo || {};
      return currentlySaved
        ? await removeBookmark(questionId, token)
        : await addBookmark(questionId, token);
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to update bookmark",
      );
    }
  },
);

const bookmarkSlice = createSlice({
  name: "bookmark",
  initialState,
  reducers: {
    clearBookmarkError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Another user must never see the previous user's saves
      .addCase(logout, () => initialState)

      // saved ids
      .addCase(fetchBookmarkIds.fulfilled, (state, action) => {
        // Keep clicks made while the request was running: the server list may
        // not reflect a save/unsave that is still in flight.
        const merged = action.payload
          .map(String)
          .filter((id) => !state.pendingIds.includes(id));
        state.pendingIds.forEach((id) => {
          if (state.ids.includes(id)) merged.push(id);
        });
        state.ids = merged;
      })
      .addCase(fetchBookmarkIds.rejected, (state, action) => {
        if (action.payload === STALE_SESSION) return;
        state.error = action.payload || action.error.message;
      })

      // saved questions list (Profile)
      .addCase(fetchBookmarkedQuestions.pending, (state) => {
        state.listStatus = "pending";
        state.error = null;
      })
      .addCase(fetchBookmarkedQuestions.fulfilled, (state, action) => {
        state.listStatus = "fulfilled";
        state.savedQuestions = action.payload;
      })
      .addCase(fetchBookmarkedQuestions.rejected, (state, action) => {
        if (action.payload === STALE_SESSION) return;
        state.listStatus = "rejected";
        state.error = action.payload || action.error.message;
      })

      // toggle: optimistic update, rolled back if the request fails
      .addCase(toggleBookmark.pending, (state, action) => {
        const { questionId, currentlySaved } = action.meta.arg;
        state.error = null;
        if (!state.pendingIds.includes(questionId)) {
          state.pendingIds.push(questionId);
        }

        if (currentlySaved) {
          state.ids = state.ids.filter((id) => id !== questionId);
          const removed = state.savedQuestions.find(
            (q) => q._id === questionId,
          );
          if (removed) {
            state.removedQuestions[questionId] = removed;
          }
          state.savedQuestions = state.savedQuestions.filter(
            (q) => q._id !== questionId,
          );
        } else if (!state.ids.includes(questionId)) {
          state.ids.push(questionId);
        }
      })
      .addCase(toggleBookmark.fulfilled, (state, action) => {
        const { questionId } = action.meta.arg;
        state.pendingIds = state.pendingIds.filter((id) => id !== questionId);
        delete state.removedQuestions[questionId];
      })
      .addCase(toggleBookmark.rejected, (state, action) => {
        const { questionId, currentlySaved } = action.meta.arg;
        state.pendingIds = state.pendingIds.filter((id) => id !== questionId);
        state.error = action.payload || action.error.message;

        // Roll back to the state before the click
        if (currentlySaved) {
          if (!state.ids.includes(questionId)) {
            state.ids.push(questionId);
          }
          const removed = state.removedQuestions[questionId];
          if (removed && !state.savedQuestions.some((q) => q._id === questionId)) {
            state.savedQuestions.push(removed);
          }
        } else {
          state.ids = state.ids.filter((id) => id !== questionId);
        }
        delete state.removedQuestions[questionId];
      });
  },
});

export const { clearBookmarkError } = bookmarkSlice.actions;

// Safe selectors: stores in existing tests have no `bookmark` reducer.
const EMPTY = [];
export const selectBookmarkIds = (state) => state.bookmark?.ids ?? EMPTY;
export const selectIsBookmarked = (state, questionId) =>
  selectBookmarkIds(state).includes(String(questionId));
export const selectIsBookmarkPending = (state, questionId) =>
  (state.bookmark?.pendingIds ?? EMPTY).includes(String(questionId));
export const selectSavedQuestions = (state) =>
  state.bookmark?.savedQuestions ?? EMPTY;
export const selectBookmarkListStatus = (state) =>
  state.bookmark?.listStatus ?? "idle";
export const selectBookmarkError = (state) => state.bookmark?.error ?? null;

export default bookmarkSlice.reducer;
