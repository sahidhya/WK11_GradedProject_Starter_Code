import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Provider, useSelector } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import AnswerList from '../../../src/components/Answer/AnswerList';
import questionReducer from '../../../src/reducers/questionSlice';
import userReducer from '../../../src/reducers/userSlice';

const BASE_URL = 'http://localhost:3000/api';

const Connected = () => {
  const question = useSelector((state) => state.question.currentQuestion);
  return <AnswerList answers={question.answers} question={question} />;
};

// answer-1 is written by user-2 (Bob), answer-2 by user-1 (Alice)
const answers = [
  {
    _id: 'answer-1',
    answerText: 'Use the useState hook to manage local component state.',
    author: { _id: 'user-2', name: 'Bob Smith' },
    voteCount: 4,
    createdAt: '2026-01-15T12:00:00.000Z',
  },
  {
    _id: 'answer-2',
    answerText: 'You can also lift the state up to a common parent component.',
    author: { _id: 'user-1', name: 'Alice Johnson' },
    voteCount: 2,
    createdAt: '2026-01-15T13:00:00.000Z',
  },
];

const renderAnswers = ({ userInfo = { userId: 'user-1', name: 'Alice', token: 'tok' }, list = answers } = {}) => {
  const store = configureStore({
    reducer: { user: userReducer, question: questionReducer },
    preloadedState: {
      user: {
        userInfo,
        login: { status: 'idle', error: null },
        registration: { status: 'idle', error: null },
      },
      question: {
        questions: [],
        currentQuestion: { _id: 'question-1', title: 'Q', description: 'D', answers: list },
        loading: false,
        error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <BrowserRouter>
        <Connected />
      </BrowserRouter>
    </Provider>
  );
  return store;
};

describe('AnswerList - editing answers', () => {
  describe('who sees the edit affordance', () => {
    it('shows a pencil only on the logged-in user\'s own answers', () => {
      renderAnswers();
      expect(screen.getAllByRole('button', { name: 'Edit answer' })).toHaveLength(1);
    });

    it('shows no pencil to a user who wrote none of the answers', () => {
      renderAnswers({ userInfo: { userId: 'user-9', name: 'Zed', token: 'tok' } });
      expect(screen.queryByRole('button', { name: 'Edit answer' })).not.toBeInTheDocument();
    });

    it('shows no pencil to an anonymous visitor', () => {
      renderAnswers({ userInfo: null });
      expect(screen.queryByRole('button', { name: 'Edit answer' })).not.toBeInTheDocument();
    });
  });

  describe('edit form', () => {
    it('opens pre-filled with the current answer text', async () => {
      renderAnswers();
      await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }));

      expect(screen.getByLabelText('Answer text')).toHaveValue(answers[1].answerText);
    });

    it('discards changes and sends no request on Cancel', async () => {
      let requests = 0;
      server.use(
        http.put(`${BASE_URL}/answers/:answerId`, () => {
          requests += 1;
          return HttpResponse.json({ data: {} });
        })
      );
      renderAnswers();
      await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }));
      await userEvent.clear(screen.getByLabelText('Answer text'));
      await userEvent.type(screen.getByLabelText('Answer text'), 'Discard me');

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByText(answers[1].answerText)).toBeInTheDocument();
      expect(screen.queryByText('Discard me')).not.toBeInTheDocument();
      expect(requests).toBe(0);
    });

    it('disables Save while the text is blank', async () => {
      renderAnswers();
      await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }));
      const save = screen.getByRole('button', { name: 'Save' });

      await userEvent.clear(screen.getByLabelText('Answer text'));
      expect(save).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Answer text'), '   ');
      expect(save).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Answer text'), 'ok');
      expect(save).toBeEnabled();
    });
  });

  describe('saving', () => {
    it('updates the answer in place and leaves edit mode', async () => {
      renderAnswers();
      await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }));
      await userEvent.clear(screen.getByLabelText('Answer text'));
      await userEvent.type(screen.getByLabelText('Answer text'), 'A much better answer');

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('A much better answer')).toBeInTheDocument();
      expect(screen.queryByLabelText('Answer text')).not.toBeInTheDocument();
      // The other answer is untouched
      expect(screen.getByText(answers[0].answerText)).toBeInTheDocument();
    });

    it('keeps the answer author after saving, so the pencil stays', async () => {
      renderAnswers();
      await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      await screen.findByText('edited');

      expect(screen.getByRole('button', { name: 'Edit answer' })).toBeInTheDocument();
    });

    it('keeps the form open with the typed text and shows the server message on failure', async () => {
      server.use(
        http.put(`${BASE_URL}/answers/:answerId`, () =>
          HttpResponse.json({ message: 'Not authorized to update this answer' }, { status: 403 })
        )
      );
      renderAnswers();
      await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }));
      await userEvent.clear(screen.getByLabelText('Answer text'));
      await userEvent.type(screen.getByLabelText('Answer text'), 'My draft answer');

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Not authorized to update this answer')).toBeInTheDocument();
      expect(screen.getByLabelText('Answer text')).toHaveValue('My draft answer');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    });

    it('lets several answers be edited independently', async () => {
      const own = [
        { ...answers[1], _id: 'answer-2' },
        { ...answers[1], _id: 'answer-3', answerText: 'Another answer by Alice' },
      ];
      renderAnswers({ list: own });
      const pencils = screen.getAllByRole('button', { name: 'Edit answer' });
      await userEvent.click(pencils[0]);
      await userEvent.click(screen.getAllByRole('button', { name: 'Edit answer' })[0]);

      // Both forms are open at once
      expect(screen.getAllByLabelText('Answer text')).toHaveLength(2);

      // Cancelling one leaves the other open
      await userEvent.click(within(screen.getAllByLabelText('Answer text')[0].closest('.card-body')).getByRole('button', { name: 'Cancel' }));
      expect(screen.getAllByLabelText('Answer text')).toHaveLength(1);
    });
  });

  describe('edited indicator', () => {
    it('is not shown for answers that were never edited', () => {
      renderAnswers();
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });

    it('is shown only on the answer that has editedAt', () => {
      const list = [answers[0], { ...answers[1], editedAt: '2026-01-20T00:00:00.000Z' }];
      renderAnswers({ list });

      expect(screen.getAllByText('edited')).toHaveLength(1);
    });

    it('appears after saving an edit', async () => {
      renderAnswers();
      await userEvent.click(screen.getByRole('button', { name: 'Edit answer' }));

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('edited')).toBeInTheDocument();
    });
  });
});
