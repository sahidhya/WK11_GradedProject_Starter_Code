import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server';
import BookmarkButton from '../../../src/components/Shared/BookmarkButton';
import bookmarkReducer from '../../../src/reducers/bookmarkSlice';

const BASE_URL = 'http://localhost:3000/api';
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const createStore = ({ userInfo = { userId: 'u1', name: 'T', token: 'tok' }, ids = [] } = {}) =>
  configureStore({
    reducer: {
      user: () => ({ userInfo }),
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

const renderButton = (storeOptions = {}, props = {}) => {
  const store = createStore(storeOptions);
  render(
    <Provider store={store}>
      <BrowserRouter>
        <BookmarkButton questionId="q1" {...props} />
      </BrowserRouter>
    </Provider>
  );
  return store;
};

describe('BookmarkButton', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the unsaved (outline) state when the question is not bookmarked', () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'Save question' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the saved (filled) state when the question is bookmarked', () => {
    renderButton({ ids: ['q1'] });
    const button = screen.getByRole('button', { name: 'Remove bookmark' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves immediately on click, without waiting for the response', async () => {
    server.use(
      http.put(`${BASE_URL}/users/me/bookmarks/:questionId`, async () => {
        await delay(100);
        return HttpResponse.json({ data: { questionId: 'q1', isBookmarked: true } });
      })
    );
    const store = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Save question' }));

    // Icon flipped while the request is still in flight
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toBeInTheDocument();
    expect(store.getState().bookmark.ids).toEqual(['q1']);
  });

  it('unsaves on click when the question is bookmarked', async () => {
    const store = renderButton({ ids: ['q1'] });

    await userEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));

    await waitFor(() => expect(store.getState().bookmark.ids).toEqual([]));
    expect(screen.getByRole('button', { name: 'Save question' })).toBeInTheDocument();
  });

  it('is disabled while its request is pending', async () => {
    server.use(
      http.put(`${BASE_URL}/users/me/bookmarks/:questionId`, async () => {
        await delay(150);
        return HttpResponse.json({ data: { questionId: 'q1', isBookmarked: true } });
      })
    );
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Save question' }));
    expect(screen.getByRole('button')).toBeDisabled();

    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
  });

  it('redirects an anonymous visitor to /login and sends no request', async () => {
    let requests = 0;
    server.use(
      http.put(`${BASE_URL}/users/me/bookmarks/:questionId`, () => {
        requests += 1;
        return HttpResponse.json({ data: {} });
      })
    );
    const store = renderButton({ userInfo: null });

    await userEvent.click(screen.getByRole('button', { name: 'Save question' }));

    expect(mockNavigate).toHaveBeenCalledWith('/login');
    expect(requests).toBe(0);
    expect(store.getState().bookmark.ids).toEqual([]);
  });

  it('reverts the icon and alerts when the request fails', async () => {
    server.use(
      http.put(`${BASE_URL}/users/me/bookmarks/:questionId`, () =>
        HttpResponse.json({ message: 'Question not found' }, { status: 404 })
      )
    );
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Save question' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls[0][0]).toMatch(/Question not found/);
    expect(screen.getByRole('button', { name: 'Save question' })).toBeInTheDocument();
  });

  it('does not bubble the click to a parent (e.g. a card link)', async () => {
    const onParentClick = vi.fn();
    const store = createStore();
    render(
      <Provider store={store}>
        <BrowserRouter>
          <div onClick={onParentClick}>
            <BookmarkButton questionId="q1" />
          </div>
        </BrowserRouter>
      </Provider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save question' }));

    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('renders without a Router (used by components rendered in isolation)', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <BookmarkButton questionId="q1" />
      </Provider>
    );

    expect(screen.getByRole('button', { name: 'Save question' })).toBeInTheDocument();
  });
});
