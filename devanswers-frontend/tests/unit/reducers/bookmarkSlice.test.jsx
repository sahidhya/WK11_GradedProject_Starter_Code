// Unit tests for bookmarkSlice.js. They verify:
// - The initial state and the safe selectors (stores without a bookmark reducer).
// - Reducer transitions for fetchBookmarkIds / fetchBookmarkedQuestions.
// - The optimistic toggle (save and unsave), its rollback on failure, and pending ids.
// - The slice resets on logout, so another user never sees the previous user's saves.
// - Bookmark requests never touch state.question.loading (real store + msw).

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server';
import bookmarkReducer, {
  fetchBookmarkIds,
  fetchBookmarkedQuestions,
  toggleBookmark,
  selectBookmarkIds,
  selectIsBookmarked,
  selectIsBookmarkPending,
  selectSavedQuestions,
  selectBookmarkListStatus,
} from '../../../src/reducers/bookmarkSlice.js';
import userReducer, { logout } from '../../../src/reducers/userSlice.js';
import questionReducer from '../../../src/reducers/questionSlice.js';

const BASE_URL = 'http://localhost:3000/api';

const initialState = {
  ids: [],
  savedQuestions: [],
  removedQuestions: {},
  pendingIds: [],
  listStatus: 'idle',
  error: null,
};

const q1 = { _id: 'q1', title: 'First' };
const q2 = { _id: 'q2', title: 'Second' };

describe('bookmarkSlice', () => {
  describe('initial state', () => {
    it('should return the initial state', () => {
      expect(bookmarkReducer(undefined, { type: 'unknown' })).toEqual(initialState);
    });
  });

  describe('selectors', () => {
    it('should return safe defaults when the store has no bookmark reducer', () => {
      const state = { user: { userInfo: null } };

      expect(selectBookmarkIds(state)).toEqual([]);
      expect(selectIsBookmarked(state, 'q1')).toBe(false);
      expect(selectIsBookmarkPending(state, 'q1')).toBe(false);
      expect(selectSavedQuestions(state)).toEqual([]);
      expect(selectBookmarkListStatus(state)).toBe('idle');
    });

    it('should read ids and pending state from the bookmark slice', () => {
      const state = { bookmark: { ...initialState, ids: ['q1'], pendingIds: ['q2'] } };

      expect(selectIsBookmarked(state, 'q1')).toBe(true);
      expect(selectIsBookmarked(state, 'q2')).toBe(false);
      expect(selectIsBookmarkPending(state, 'q2')).toBe(true);
    });
  });

  describe('fetchBookmarkIds', () => {
    it('should store the saved ids as strings', () => {
      const state = bookmarkReducer(
        initialState,
        fetchBookmarkIds.fulfilled(['q1', 'q2'], 'req', undefined)
      );

      expect(state.ids).toEqual(['q1', 'q2']);
    });

    it('should store the error when the request fails', () => {
      const state = bookmarkReducer(
        initialState,
        fetchBookmarkIds.rejected(null, 'req', undefined, 'Token is not valid.')
      );

      expect(state.error).toBe('Token is not valid.');
    });
  });

  describe('fetchBookmarkedQuestions', () => {
    it('should set listStatus to pending', () => {
      const state = bookmarkReducer(
        initialState,
        fetchBookmarkedQuestions.pending('req', undefined)
      );

      expect(state.listStatus).toBe('pending');
    });

    it('should store the saved questions on fulfilled', () => {
      const state = bookmarkReducer(
        { ...initialState, listStatus: 'pending' },
        fetchBookmarkedQuestions.fulfilled([q1, q2], 'req', undefined)
      );

      expect(state.listStatus).toBe('fulfilled');
      expect(state.savedQuestions).toEqual([q1, q2]);
    });

    it('should set rejected status and the error on failure', () => {
      const state = bookmarkReducer(
        initialState,
        fetchBookmarkedQuestions.rejected(null, 'req', undefined, 'Server error')
      );

      expect(state.listStatus).toBe('rejected');
      expect(state.error).toBe('Server error');
    });
  });

  describe('toggleBookmark (optimistic)', () => {
    it('should add the id immediately and mark it pending when saving', () => {
      const arg = { questionId: 'q1', currentlySaved: false };

      const state = bookmarkReducer(initialState, toggleBookmark.pending('req', arg));

      expect(state.ids).toEqual(['q1']);
      expect(state.pendingIds).toEqual(['q1']);
    });

    it('should not duplicate an id that is already present', () => {
      const arg = { questionId: 'q1', currentlySaved: false };
      const start = { ...initialState, ids: ['q1'] };

      const state = bookmarkReducer(start, toggleBookmark.pending('req', arg));

      expect(state.ids).toEqual(['q1']);
    });

    it('should remove the id and the saved question immediately when unsaving', () => {
      const arg = { questionId: 'q1', currentlySaved: true };
      const start = { ...initialState, ids: ['q1', 'q2'], savedQuestions: [q1, q2] };

      const state = bookmarkReducer(start, toggleBookmark.pending('req', arg));

      expect(state.ids).toEqual(['q2']);
      expect(state.savedQuestions).toEqual([q2]);
      expect(state.pendingIds).toEqual(['q1']);
    });

    it('should clear the pending flag and keep the change on fulfilled', () => {
      const arg = { questionId: 'q1', currentlySaved: false };
      let state = bookmarkReducer(initialState, toggleBookmark.pending('req', arg));

      state = bookmarkReducer(
        state,
        toggleBookmark.fulfilled({ questionId: 'q1', isBookmarked: true }, 'req', arg)
      );

      expect(state.ids).toEqual(['q1']);
      expect(state.pendingIds).toEqual([]);
      expect(state.error).toBeNull();
    });

    it('should roll back a failed save', () => {
      const arg = { questionId: 'q1', currentlySaved: false };
      let state = bookmarkReducer(initialState, toggleBookmark.pending('req', arg));

      state = bookmarkReducer(
        state,
        toggleBookmark.rejected(null, 'req', arg, 'Question not found')
      );

      expect(state.ids).toEqual([]);
      expect(state.pendingIds).toEqual([]);
      expect(state.error).toBe('Question not found');
    });

    it('should roll back a failed unsave, restoring the id and the saved question', () => {
      const arg = { questionId: 'q1', currentlySaved: true };
      const start = { ...initialState, ids: ['q1'], savedQuestions: [q1] };
      let state = bookmarkReducer(start, toggleBookmark.pending('req', arg));

      state = bookmarkReducer(
        state,
        toggleBookmark.rejected(null, 'req', arg, 'Network Error')
      );

      expect(state.ids).toEqual(['q1']);
      expect(state.savedQuestions).toEqual([q1]);
      expect(state.pendingIds).toEqual([]);
      expect(state.removedQuestions).toEqual({});
      expect(state.error).toBe('Network Error');
    });

    it('should not keep the removed question around after a successful unsave', () => {
      const arg = { questionId: 'q1', currentlySaved: true };
      const start = { ...initialState, ids: ['q1'], savedQuestions: [q1] };
      let state = bookmarkReducer(start, toggleBookmark.pending('req', arg));

      state = bookmarkReducer(
        state,
        toggleBookmark.fulfilled({ questionId: 'q1', isBookmarked: false }, 'req', arg)
      );

      expect(state.savedQuestions).toEqual([]);
      expect(state.removedQuestions).toEqual({});
    });
  });

  describe('logout', () => {
    it('should reset everything so another user never sees the previous saves', () => {
      const start = {
        ...initialState,
        ids: ['q1'],
        savedQuestions: [q1],
        pendingIds: ['q2'],
        listStatus: 'fulfilled',
        error: 'old error',
      };

      expect(bookmarkReducer(start, logout())).toEqual(initialState);
    });
  });

  describe('with a real store and mocked API', () => {
    const createStore = () =>
      configureStore({
        reducer: { user: userReducer, question: questionReducer, bookmark: bookmarkReducer },
        preloadedState: {
          user: {
            userInfo: { userId: 'user-1', name: 'Alice', token: 'tok' },
            login: { status: 'idle', error: null },
            registration: { status: 'idle', error: null },
          },
        },
      });

    it('should load ids from the API', async () => {
      const store = createStore();

      await store.dispatch(fetchBookmarkIds());

      expect(store.getState().bookmark.ids).toEqual(['question-1']);
    });

    it('should save a question and keep it saved after the request resolves', async () => {
      const store = createStore();

      const promise = store.dispatch(
        toggleBookmark({ questionId: 'question-2', currentlySaved: false })
      );
      // Optimistic: already saved and pending before the response arrives
      expect(store.getState().bookmark.ids).toContain('question-2');
      expect(store.getState().bookmark.pendingIds).toContain('question-2');

      await promise;

      expect(store.getState().bookmark.ids).toContain('question-2');
      expect(store.getState().bookmark.pendingIds).toEqual([]);
    });

    it('should roll back when the API fails and expose the server message', async () => {
      server.use(
        http.put(`${BASE_URL}/users/me/bookmarks/:questionId`, () =>
          HttpResponse.json({ message: 'Question not found' }, { status: 404 })
        )
      );
      const store = createStore();

      const result = await store.dispatch(
        toggleBookmark({ questionId: 'question-9', currentlySaved: false })
      );

      expect(result.type).toBe('bookmark/toggleBookmark/rejected');
      expect(store.getState().bookmark.ids).not.toContain('question-9');
      expect(store.getState().bookmark.error).toBe('Question not found');
    });

    it('should never change state.question.loading during any bookmark request', async () => {
      server.use(
        http.put(`${BASE_URL}/users/me/bookmarks/:questionId`, async () => {
          await delay(20);
          return HttpResponse.json({ data: { questionId: 'question-2', isBookmarked: true } });
        })
      );
      const store = createStore();
      const seen = new Set();
      store.subscribe(() => seen.add(store.getState().question.loading));
      seen.add(store.getState().question.loading);

      await store.dispatch(fetchBookmarkIds());
      await store.dispatch(fetchBookmarkedQuestions());
      await store.dispatch(toggleBookmark({ questionId: 'question-2', currentlySaved: false }));
      await store.dispatch(toggleBookmark({ questionId: 'question-1', currentlySaved: true }));

      expect([...seen]).toEqual([false]);
    });
  });
});
