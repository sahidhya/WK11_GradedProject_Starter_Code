import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Provider, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import QuestionContent from '../../../src/components/Question/QuestionContent';
import questionReducer from '../../../src/reducers/questionSlice';
import userReducer from '../../../src/reducers/userSlice';

const BASE_URL = 'http://localhost:3000/api';

// Reads the question from the store, like QuestionDetail does, so saved edits re-render
const Connected = () => {
  const question = useSelector((state) => state.question.currentQuestion);
  return <QuestionContent question={question} />;
};

// question-1 is written by user-1 (Alice), tags: javascript, react
const baseQuestion = {
  _id: 'question-1',
  title: 'How do I manage state in React?',
  description: 'I want to understand the best way to manage component state.',
  voteCount: 10,
  tags: [
    { _id: 'tag-1', name: 'javascript' },
    { _id: 'tag-2', name: 'react' },
  ],
  author: { _id: 'user-1', name: 'Alice Johnson' },
  answers: [{ _id: 'answer-1', answerText: 'Keep me' }],
  createdAt: '2026-01-14T10:00:00.000Z',
};

const renderQuestion = ({ userInfo = { userId: 'user-1', name: 'Alice', token: 'tok' }, question = baseQuestion } = {}) => {
  const store = configureStore({
    reducer: { user: userReducer, question: questionReducer },
    preloadedState: {
      user: {
        userInfo,
        login: { status: 'idle', error: null },
        registration: { status: 'idle', error: null },
      },
      question: { questions: [], currentQuestion: question, loading: false, error: null },
    },
  });
  render(
    <Provider store={store}>
      <Connected />
    </Provider>
  );
  return store;
};

describe('QuestionContent - editing', () => {
  describe('who sees the edit affordance', () => {
    it('shows a pencil to the author', () => {
      renderQuestion();
      expect(screen.getByRole('button', { name: 'Edit question' })).toBeInTheDocument();
    });

    it('shows no pencil to another user', () => {
      renderQuestion({ userInfo: { userId: 'user-2', name: 'Bob', token: 'tok' } });
      expect(screen.queryByRole('button', { name: 'Edit question' })).not.toBeInTheDocument();
    });

    it('shows no pencil to an anonymous visitor', () => {
      renderQuestion({ userInfo: null });
      expect(screen.queryByRole('button', { name: 'Edit question' })).not.toBeInTheDocument();
    });
  });

  describe('edit form', () => {
    it('opens pre-filled with the current title, description and tags', async () => {
      renderQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));

      expect(screen.getByLabelText('Title')).toHaveValue(baseQuestion.title);
      expect(screen.getByLabelText('Description')).toHaveValue(baseQuestion.description);
      expect(screen.getByLabelText(/Tags/)).toHaveValue('javascript, react');
    });

    it('discards changes and sends no request on Cancel', async () => {
      let requests = 0;
      server.use(
        http.put(`${BASE_URL}/questions/:id`, () => {
          requests += 1;
          return HttpResponse.json({ data: {} });
        })
      );
      renderQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));
      await userEvent.clear(screen.getByLabelText('Title'));
      await userEvent.type(screen.getByLabelText('Title'), 'Something else');

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByText(baseQuestion.title)).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(requests).toBe(0);

      // Re-opening starts from the saved content again, not the discarded draft
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));
      expect(screen.getByLabelText('Title')).toHaveValue(baseQuestion.title);
    });

    it('disables Save while the title, description or tags are blank', async () => {
      renderQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));
      const save = screen.getByRole('button', { name: 'Save' });
      expect(save).toBeEnabled();

      await userEvent.clear(screen.getByLabelText('Title'));
      expect(save).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Title'), '   ');
      expect(save).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Title'), 'ok');
      expect(save).toBeEnabled();

      await userEvent.clear(screen.getByLabelText('Description'));
      expect(save).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Description'), 'ok');

      await userEvent.clear(screen.getByLabelText(/Tags/));
      expect(save).toBeDisabled();
      await userEvent.type(screen.getByLabelText(/Tags/), ' , ');
      expect(save).toBeDisabled();
    });
  });

  describe('saving', () => {
    it('shows the new content immediately and leaves edit mode', async () => {
      renderQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));
      await userEvent.clear(screen.getByLabelText('Title'));
      await userEvent.type(screen.getByLabelText('Title'), 'A better title');
      await userEvent.clear(screen.getByLabelText(/Tags/));
      await userEvent.type(screen.getByLabelText(/Tags/), 'vue, pinia');

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('A better title')).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.getByText('vue')).toBeInTheDocument();
      expect(screen.getByText('pinia')).toBeInTheDocument();
      expect(screen.queryByText('react')).not.toBeInTheDocument();
    });

    it('keeps the answers and author after saving (response has neither)', async () => {
      const store = renderQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await screen.findByText('edited');

      const question = store.getState().question.currentQuestion;
      expect(question.answers).toEqual(baseQuestion.answers);
      expect(question.author.name).toBe('Alice Johnson');
      // The author is still the user, so the pencil is still there
      expect(screen.getByRole('button', { name: 'Edit question' })).toBeInTheDocument();
    });

    it('never swaps the page for a spinner while saving', async () => {
      const store = renderQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(store.getState().question.loading).toBe(false);
      await screen.findByText('edited');
    });

    it('keeps the form open with the typed text and shows the server message on failure', async () => {
      server.use(
        http.put(`${BASE_URL}/questions/:id`, () =>
          HttpResponse.json({ message: 'Not authorized to update this question' }, { status: 403 })
        )
      );
      renderQuestion();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));
      await userEvent.clear(screen.getByLabelText('Title'));
      await userEvent.type(screen.getByLabelText('Title'), 'My draft');

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Not authorized to update this question')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('My draft');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    });
  });

  describe('edited indicator', () => {
    it('is not shown for a question that was never edited', () => {
      renderQuestion();
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });

    it('is shown when the question has been edited', () => {
      renderQuestion({ question: { ...baseQuestion, editedAt: '2026-01-20T00:00:00.000Z' } });
      expect(screen.getByText('edited')).toBeInTheDocument();
    });

    it('appears after saving an edit', async () => {
      renderQuestion();
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Edit question' }));

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('edited')).toBeInTheDocument();
    });
  });
});
