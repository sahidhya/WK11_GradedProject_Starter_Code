import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import Profile from '../../../src/pages/Profile/Profile';
import bookmarkReducer from '../../../src/reducers/bookmarkSlice';
import questionReducer from '../../../src/reducers/questionSlice';

const BASE_URL = 'http://localhost:3000/api';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// Real bookmark reducer (the existing profile.test.jsx keeps its user-only store).
// question-1 is the question the default msw handler returns as saved.
const renderProfile = ({ ids = ['question-1'] } = {}) => {
  const store = configureStore({
    reducer: {
      user: () => ({ userInfo: { userId: 'user-1', name: 'Alice', token: 'tok' } }),
      question: questionReducer,
      bookmark: bookmarkReducer,
    },
    preloadedState: {
      bookmark: {
        ids,
        savedQuestions: [],
        removedQuestions: {},
        pendingIds: [],
        listStatus: 'idle',
        error: null,
      },
    },
  });

  render(
    <Provider store={store}>
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    </Provider>
  );
  return store;
};

describe('Profile - Saved Questions', () => {
  it('renders a "Saved Questions" section', async () => {
    renderProfile();

    expect(screen.getByText('Saved Questions')).toBeInTheDocument();
    await screen.findByText('How do I manage state in React?');
  });

  it('lists the saved questions using the question-list UI', async () => {
    renderProfile();

    expect(await screen.findByText('How do I manage state in React?')).toBeInTheDocument();
    expect(screen.getByText('1 question')).toBeInTheDocument();
  });

  it('links each saved question to its detail page', async () => {
    renderProfile();

    const link = await screen.findByRole('link', { name: 'How do I manage state in React?' });
    expect(link).toHaveAttribute('href', '/question/question-1');
  });

  it('shows the friendly empty state when nothing is saved', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me/bookmarks`, () =>
        HttpResponse.json({ success: true, data: [] })
      )
    );
    renderProfile({ ids: [] });

    expect(await screen.findByText('No saved questions yet')).toBeInTheDocument();
    expect(screen.queryByText(/No questions found/i)).not.toBeInTheDocument();
  });

  it('removes a question from the list immediately when it is unsaved', async () => {
    renderProfile();
    await screen.findByText('How do I manage state in React?');

    await userEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));

    await waitFor(() =>
      expect(screen.queryByText('How do I manage state in React?')).not.toBeInTheDocument()
    );
    expect(screen.getByText('No saved questions yet')).toBeInTheDocument();
  });

  it('shows an error message when the saved list cannot be loaded', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me/bookmarks`, () =>
        HttpResponse.json({ message: 'Server exploded' }, { status: 500 })
      )
    );
    renderProfile({ ids: [] });

    expect(await screen.findByText(/Could not load your saved questions/i)).toBeInTheDocument();
    expect(screen.getByText(/Server exploded/)).toBeInTheDocument();
  });
});
