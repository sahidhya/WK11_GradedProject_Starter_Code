import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import QuestionList from '../../../src/components/Question/QuestionList';
import questionReducer from '../../../src/reducers/questionSlice';

const createMockStore = () => {
  return configureStore({
    reducer: {
      question: questionReducer,
      user: () => ({
        userInfo: { userId: 'user-1' },
        loading: false,
        error: null,
      }),
    },
  });
};

const mockQuestions = [
  {
    _id: 'q1',
    title: 'First Question',
    description: 'Description for first question',
    voteCount: 5,
    answerCount: 2,
    tags: [{ _id: 't1', name: 'react' }],
    author: { _id: 'user-2', name: 'Alice' },
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    _id: 'q2',
    title: 'Second Question',
    description: 'Description for second question',
    voteCount: 3,
    answerCount: 1,
    tags: [{ _id: 't2', name: 'javascript' }],
    author: { _id: 'user-3', name: 'Bob' },
    createdAt: '2026-01-11T12:00:00.000Z',
  },
];

const renderQuestionList = (questions = mockQuestions) => {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <QuestionList questions={questions} />
      </BrowserRouter>
    </Provider>
  );
};

describe('QuestionList Component', () => {
  it('renders all question titles', () => {
    renderQuestionList();
    expect(screen.getByText('First Question')).toBeInTheDocument();
    expect(screen.getByText('Second Question')).toBeInTheDocument();
  });

  it('renders question descriptions', () => {
    renderQuestionList();
    expect(screen.getByText('Description for first question')).toBeInTheDocument();
    expect(screen.getByText('Description for second question')).toBeInTheDocument();
  });

  it('renders "No questions found" when list is empty', () => {
    renderQuestionList([]);
    expect(screen.getByText(/No questions found/i)).toBeInTheDocument();
  });

  it('renders the question count', () => {
    renderQuestionList();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderQuestionList();
    expect(screen.getByPlaceholderText(/search questions/i)).toBeInTheDocument();
  });

  it('filters questions by search query', async () => {
    renderQuestionList();
    await userEvent.type(screen.getByPlaceholderText(/search questions/i), 'First');

    expect(screen.getByText('First Question')).toBeInTheDocument();
    expect(screen.queryByText('Second Question')).not.toBeInTheDocument();
  });

  it('shows "No questions found" when search has no matches', async () => {
    renderQuestionList();
    await userEvent.type(screen.getByPlaceholderText(/search questions/i), 'xyz-no-match');

    expect(screen.getByText(/No questions found/i)).toBeInTheDocument();
  });

  it('renders sort dropdown', () => {
    renderQuestionList();
    expect(screen.getByText('Newest')).toBeInTheDocument();
  });
  it('renders custom empty-state text when emptyTitle and emptyMessage are given', () => {
    render(
      <Provider store={createMockStore()}>
        <BrowserRouter>
          <QuestionList
            questions={[]}
            emptyTitle="No saved questions yet"
            emptyMessage="Click the bookmark icon to save one."
          />
        </BrowserRouter>
      </Provider>
    );
    expect(screen.getByText('No saved questions yet')).toBeInTheDocument();
    expect(screen.getByText('Click the bookmark icon to save one.')).toBeInTheDocument();
    expect(screen.queryByText(/No questions found/i)).not.toBeInTheDocument();
  });

  it('keeps the default empty-state text when no empty props are given', () => {
    renderQuestionList([]);
    expect(screen.getByText('No questions found')).toBeInTheDocument();
    expect(screen.getByText(/be the first to ask/i)).toBeInTheDocument();
  });

  it('clamps to the last page when the list shrinks (e.g. the last item is unsaved)', async () => {
    const makeQuestions = (n) =>
      Array.from({ length: n }, (_, i) => ({
        _id: `bulk-${i}`,
        title: `Bulk question ${i}`,
        description: `Bulk description ${i}`,
        voteCount: 0,
        answerCount: 0,
        tags: [],
        author: { _id: 'user-2', name: 'Alice' },
        // Newest first by default sort: higher i is newer
        createdAt: new Date(2026, 0, 1 + i).toISOString(),
      }));
    const store = createMockStore();
    const ui = (questions) => (
      <Provider store={store}>
        <BrowserRouter>
          <QuestionList questions={questions} />
        </BrowserRouter>
      </Provider>
    );

    // 6 questions -> 2 pages (5 per page). Go to page 2: only the oldest shows.
    const { rerender } = render(ui(makeQuestions(6)));
    await userEvent.click(screen.getByText('2'));
    expect(screen.getByText('Bulk question 0')).toBeInTheDocument();

    // Shrink to 5 questions -> only 1 page. Must show page 1, not an empty page.
    rerender(ui(makeQuestions(5).slice(0, 5)));
    expect(screen.queryByText(/No questions found/i)).not.toBeInTheDocument();
    expect(screen.getByText('Bulk question 4')).toBeInTheDocument();
  });
});
