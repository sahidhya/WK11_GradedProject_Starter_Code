import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import questionReducer, {
  fetchQuestionById,
  updateQuestion,
  updateAnswer,
} from '../../src/reducers/questionSlice';

/**
 * Integration Tests: Edit Flow with Redux + MSW
 * Loads a question like the question page does, then edits the question and
 * an answer through the real thunks, services and (mocked) API.
 * question-1 is written by user-1 (Alice); answer-2 is written by user-1 too.
 */

const BASE_URL = 'http://localhost:3000/api';

const createTestStore = (userInfo = { userId: 'user-1', token: 'mock-jwt-token-alice', name: 'Alice Johnson' }) =>
  configureStore({
    reducer: {
      question: questionReducer,
      user: () => ({ userInfo }),
    },
  });

describe('Edit Flow Integration Tests (Redux + MSW)', () => {
  let store;

  beforeEach(async () => {
    store = createTestStore();
    await store.dispatch(fetchQuestionById('question-1'));
  });

  describe('Edit a question', () => {
    it('should send the edit and merge it into the current question', async () => {
      const before = store.getState().question.currentQuestion;
      expect(before.editedAt).toBeUndefined();

      const result = await store.dispatch(
        updateQuestion({
          id: 'question-1',
          title: '  Better title  ',
          description: 'Better description',
          tags: 'vue, pinia',
        })
      );

      expect(updateQuestion.fulfilled.match(result)).toBe(true);
      const after = store.getState().question.currentQuestion;
      expect(after.title).toBe('Better title');
      expect(after.description).toBe('Better description');
      expect(after.tags.map((t) => t.name)).toEqual(['vue', 'pinia']);
      expect(after.editedAt).toBeTruthy();
    });

    it('should keep the answers and the author after the edit', async () => {
      const before = store.getState().question.currentQuestion;

      await store.dispatch(
        updateQuestion({ id: 'question-1', title: 'T', description: 'D', tags: 't' })
      );

      const after = store.getState().question.currentQuestion;
      expect(after.answers).toEqual(before.answers);
      expect(after.author).toEqual(before.author);
    });

    it('should send the user token as a Bearer header', async () => {
      let authorization = null;
      server.use(
        http.put(`${BASE_URL}/questions/:id`, ({ request }) => {
          authorization = request.headers.get('Authorization');
          return HttpResponse.json({ data: { _id: 'question-1', title: 'T', description: 'D', tags: [] } });
        })
      );

      await store.dispatch(
        updateQuestion({ id: 'question-1', title: 'T', description: 'D', tags: 't' })
      );

      expect(authorization).toBe('Bearer mock-jwt-token-alice');
    });

    it('should reject with the server message and leave the question unchanged', async () => {
      const before = store.getState().question.currentQuestion;

      const result = await store.dispatch(
        updateQuestion({ id: 'question-1', title: '   ', description: 'D', tags: 't' })
      );

      expect(updateQuestion.rejected.match(result)).toBe(true);
      expect(result.payload).toBe('Title is required');
      expect(store.getState().question.currentQuestion).toEqual(before);
    });

    it('should reject when the server forbids a non-author', async () => {
      server.use(
        http.put(`${BASE_URL}/questions/:id`, () =>
          HttpResponse.json({ message: 'Not authorized to update this question' }, { status: 403 })
        )
      );
      const otherStore = createTestStore({ userId: 'user-2', token: 'mock-jwt-token-bob', name: 'Bob' });
      await otherStore.dispatch(fetchQuestionById('question-1'));

      const result = await otherStore.dispatch(
        updateQuestion({ id: 'question-1', title: 'Hijack', description: 'D', tags: 't' })
      );

      expect(result.payload).toBe('Not authorized to update this question');
      expect(otherStore.getState().question.currentQuestion.title).not.toBe('Hijack');
    });
  });

  describe('Edit an answer', () => {
    it('should update that answer in place and leave the others alone', async () => {
      const before = store.getState().question.currentQuestion.answers;
      const untouched = before.find((a) => a._id === 'answer-1');

      const result = await store.dispatch(
        updateAnswer({ answerId: 'answer-2', answerText: '  Edited answer  ' })
      );

      expect(updateAnswer.fulfilled.match(result)).toBe(true);
      const after = store.getState().question.currentQuestion.answers;
      expect(after).toHaveLength(before.length);
      const edited = after.find((a) => a._id === 'answer-2');
      expect(edited.answerText).toBe('Edited answer');
      expect(edited.editedAt).toBeTruthy();
      expect(edited.author).toEqual(before.find((a) => a._id === 'answer-2').author);
      expect(after.find((a) => a._id === 'answer-1')).toEqual(untouched);
    });

    it('should reject blank text with the server message and change nothing', async () => {
      const before = store.getState().question.currentQuestion;

      const result = await store.dispatch(
        updateAnswer({ answerId: 'answer-2', answerText: '   ' })
      );

      expect(updateAnswer.rejected.match(result)).toBe(true);
      expect(result.payload).toBe('Answer text is required');
      expect(store.getState().question.currentQuestion).toEqual(before);
    });
  });

  describe('Page state during edits', () => {
    it('should never set loading or the page-level error', async () => {
      const seen = new Set();
      const record = () => {
        const { loading, error } = store.getState().question;
        seen.add(`${loading}|${error}`);
      };
      store.subscribe(record);
      record();

      await store.dispatch(updateQuestion({ id: 'question-1', title: 'T', description: 'D', tags: 't' }));
      await store.dispatch(updateQuestion({ id: 'question-1', title: '', description: 'D', tags: 't' }));
      await store.dispatch(updateAnswer({ answerId: 'answer-2', answerText: 'New' }));
      await store.dispatch(updateAnswer({ answerId: 'answer-2', answerText: '' }));

      expect([...seen]).toEqual(['false|null']);
    });
  });
});
