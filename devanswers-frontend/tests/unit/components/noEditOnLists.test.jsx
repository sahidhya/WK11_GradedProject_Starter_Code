import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import QuestionList from '../../../src/components/Question/QuestionList';
import questionReducer from '../../../src/reducers/questionSlice';

// Editing is only available on the single-question page. Even for the author,
// list views (home feed, tag feed, profile) must show no edit affordance.
const store = configureStore({
  reducer: {
    question: questionReducer,
    user: () => ({ userInfo: { userId: 'user-1', name: 'Alice', token: 'tok' } }),
  },
});

const ownQuestions = [
  {
    _id: 'q1',
    title: 'My own question',
    description: 'Written by the logged-in user',
    voteCount: 1,
    answerCount: 0,
    tags: [{ _id: 't1', name: 'react' }],
    author: { _id: 'user-1', name: 'Alice' },
    createdAt: '2026-01-10T10:00:00.000Z',
    editedAt: '2026-01-11T10:00:00.000Z',
  },
];

describe('list views have no edit affordances', () => {
  it('shows no pencil and no edit form on the author\'s own questions', () => {
    render(
      <Provider store={store}>
        <BrowserRouter>
          <QuestionList questions={ownQuestions} />
        </BrowserRouter>
      </Provider>
    );

    expect(screen.getByText('My own question')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });
});
