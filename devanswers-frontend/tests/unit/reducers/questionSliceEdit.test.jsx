// Tests for the edit thunks in questionSlice.js (updateQuestion / updateAnswer):
// - fulfilled merges only the edited fields and keeps `answers` and `author`
// - fulfilled replaces exactly one answer
// - rejected leaves state untouched (the form shows the message locally)
// - no edit request ever changes state.loading or the page-level state.error

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server';
import questionReducer, {
  updateQuestion,
  updateAnswer,
} from '../../../src/reducers/questionSlice.js';
import userReducer from '../../../src/reducers/userSlice.js';

const BASE_URL = 'http://localhost:3000/api';

const answers = [
  { _id: 'a1', answerText: 'First', voteCount: 2, author: { _id: 'u2', name: 'Bob' } },
  { _id: 'a2', answerText: 'Second', voteCount: 5, author: { _id: 'u1', name: 'Ann' } },
];

const currentQuestion = {
  _id: 'q1',
  title: 'Old title',
  description: 'Old description',
  tags: [{ _id: 't1', name: 'old' }],
  voteCount: 3,
  author: { _id: 'u1', name: 'Ann' },
  answers,
};

const startState = {
  questions: [{ _id: 'q1', title: 'Old title', description: 'Old description', tags: [] }],
  currentQuestion,
  loading: false,
  error: null,
};

describe('questionSlice - edit thunks', () => {
  describe('updateQuestion', () => {
    const payload = {
      _id: 'q1',
      title: 'New title',
      description: 'New description',
      tags: [{ _id: 't9', name: 'new' }],
      author: { _id: 'u1', name: 'Ann' },
      editedAt: '2026-02-01T00:00:00.000Z',
    };

    it('should merge the edited fields into currentQuestion', () => {
      const state = questionReducer(
        startState,
        updateQuestion.fulfilled(payload, 'req', { id: 'q1' })
      );

      expect(state.currentQuestion.title).toBe('New title');
      expect(state.currentQuestion.description).toBe('New description');
      expect(state.currentQuestion.tags).toEqual(payload.tags);
      expect(state.currentQuestion.editedAt).toBe(payload.editedAt);
    });

    it('should keep answers, votes and author (the PUT response has no answers)', () => {
      const state = questionReducer(
        startState,
        updateQuestion.fulfilled(payload, 'req', { id: 'q1' })
      );

      expect(state.currentQuestion.answers).toEqual(answers);
      expect(state.currentQuestion.voteCount).toBe(3);
      expect(state.currentQuestion.author).toEqual({ _id: 'u1', name: 'Ann' });
    });

    it('should also update the matching question in the questions list', () => {
      const state = questionReducer(
        startState,
        updateQuestion.fulfilled(payload, 'req', { id: 'q1' })
      );

      expect(state.questions[0].title).toBe('New title');
      expect(state.questions[0].editedAt).toBe(payload.editedAt);
    });

    it('should not change the state when rejected', () => {
      const state = questionReducer(
        startState,
        updateQuestion.rejected(null, 'req', { id: 'q1' }, 'Title is required')
      );

      expect(state).toEqual(startState);
    });
  });

  describe('updateAnswer', () => {
    const payload = {
      _id: 'a2',
      answerText: 'Second, edited',
      voteCount: 5,
      author: { _id: 'u1', name: 'Ann' },
      editedAt: '2026-02-01T00:00:00.000Z',
    };

    it('should replace only the edited answer', () => {
      const state = questionReducer(
        startState,
        updateAnswer.fulfilled(payload, 'req', { answerId: 'a2' })
      );

      expect(state.currentQuestion.answers[0]).toEqual(answers[0]);
      expect(state.currentQuestion.answers[1].answerText).toBe('Second, edited');
      expect(state.currentQuestion.answers[1].editedAt).toBe(payload.editedAt);
    });

    it('should keep fields the response does not include', () => {
      const state = questionReducer(
        startState,
        updateAnswer.fulfilled({ _id: 'a2', answerText: 'X' }, 'req', { answerId: 'a2' })
      );

      expect(state.currentQuestion.answers[1].voteCount).toBe(5);
      expect(state.currentQuestion.answers[1].author).toEqual({ _id: 'u1', name: 'Ann' });
    });

    it('should do nothing when the answer is not on the current question', () => {
      const state = questionReducer(
        startState,
        updateAnswer.fulfilled({ _id: 'other', answerText: 'X' }, 'req', { answerId: 'other' })
      );

      expect(state.currentQuestion.answers).toEqual(answers);
    });

    it('should not change the state when rejected', () => {
      const state = questionReducer(
        startState,
        updateAnswer.rejected(null, 'req', { answerId: 'a2' }, 'Answer text is required')
      );

      expect(state).toEqual(startState);
    });
  });

  describe('with a real store and mocked API', () => {
    const createStore = () =>
      configureStore({
        reducer: { user: userReducer, question: questionReducer },
        preloadedState: {
          user: {
            userInfo: { userId: 'user-1', name: 'Alice', token: 'tok' },
            login: { status: 'idle', error: null },
            registration: { status: 'idle', error: null },
          },
          question: {
            questions: [],
            currentQuestion: {
              _id: 'question-1',
              title: 'Old',
              description: 'Old',
              tags: [],
              author: { _id: 'user-1', name: 'Alice Johnson' },
              answers: [{ _id: 'answer-2', answerText: 'Old answer', author: { _id: 'user-1' } }],
            },
            loading: false,
            error: null,
          },
        },
      });

    it('should return the server message when the request is rejected', async () => {
      const store = createStore();

      const result = await store.dispatch(
        updateQuestion({ id: 'question-1', title: '   ', description: 'D', tags: 't' })
      );

      expect(result.type).toBe('question/updateQuestion/rejected');
      expect(result.payload).toBe('Title is required');
      expect(store.getState().question.currentQuestion.title).toBe('Old');
    });

    it('should never change loading or the page-level error during an edit', async () => {
      server.use(
        http.put(`${BASE_URL}/answers/:answerId`, async () => {
          await delay(20);
          return HttpResponse.json({ message: 'Server error' }, { status: 500 });
        })
      );
      const store = createStore();
      const seen = new Set();
      const record = () => {
        const { loading, error } = store.getState().question;
        seen.add(`${loading}|${error}`);
      };
      store.subscribe(record);
      record();

      await store.dispatch(
        updateQuestion({ id: 'question-1', title: 'New', description: 'D', tags: 't' })
      );
      await store.dispatch(updateAnswer({ answerId: 'answer-2', answerText: 'New text' }));
      await store.dispatch(updateAnswer({ answerId: 'answer-2', answerText: '  ' }));

      expect([...seen]).toEqual(['false|null']);
    });
  });
});
