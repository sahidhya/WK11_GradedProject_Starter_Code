import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addBookmark,
  removeBookmark,
  getBookmarkIds,
  getBookmarkedQuestions,
} from '../../../src/controllers/bookmarkController.js';
import * as bookmarkService from '../../../src/services/bookmarkService.js';

// Mock the bookmark service
vi.mock('../../../src/services/bookmarkService.js');

describe('bookmarkController', () => {
  let req, res;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      params: { questionId: 'question123' },
      body: {},
      user: { id: 'user123', isAdmin: false },
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe('addBookmark', () => {
    it('should bookmark a question and return 200', async () => {
      const mockData = { questionId: 'question123', isBookmarked: true };
      bookmarkService.addBookmarkService = vi.fn().mockResolvedValue(mockData);

      await addBookmark(req, res);

      expect(bookmarkService.addBookmarkService).toHaveBeenCalledWith('user123', 'question123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Question bookmarked',
        data: mockData,
      });
    });

    it('should propagate service errors (handled by the error middleware)', async () => {
      const error = new Error('Question not found');
      error.statusCode = 404;
      bookmarkService.addBookmarkService = vi.fn().mockRejectedValue(error);

      await expect(addBookmark(req, res)).rejects.toThrow('Question not found');
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('removeBookmark', () => {
    it('should remove a bookmark and return 200', async () => {
      const mockData = { questionId: 'question123', isBookmarked: false };
      bookmarkService.removeBookmarkService = vi.fn().mockResolvedValue(mockData);

      await removeBookmark(req, res);

      expect(bookmarkService.removeBookmarkService).toHaveBeenCalledWith('user123', 'question123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Bookmark removed',
        data: mockData,
      });
    });
  });

  describe('getBookmarkIds', () => {
    it('should return the saved ids with 200', async () => {
      const mockIds = ['question123', 'question456'];
      bookmarkService.getBookmarkIdsService = vi.fn().mockResolvedValue(mockIds);

      await getBookmarkIds(req, res);

      expect(bookmarkService.getBookmarkIdsService).toHaveBeenCalledWith('user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Bookmark ids fetched successfully',
        data: mockIds,
      });
    });

    it('should return an empty array with 200 when nothing is saved', async () => {
      bookmarkService.getBookmarkIdsService = vi.fn().mockResolvedValue([]);

      await getBookmarkIds(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: [] })
      );
    });
  });

  describe('getBookmarkedQuestions', () => {
    it('should return the saved questions with 200', async () => {
      const mockQuestions = [{ _id: 'question123', title: 'Q', answerCount: 2 }];
      bookmarkService.getBookmarkedQuestionsService = vi.fn().mockResolvedValue(mockQuestions);

      await getBookmarkedQuestions(req, res);

      expect(bookmarkService.getBookmarkedQuestionsService).toHaveBeenCalledWith('user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Bookmarked questions fetched successfully',
        data: mockQuestions,
      });
    });

    it('should return an empty array with 200 when nothing is saved', async () => {
      bookmarkService.getBookmarkedQuestionsService = vi.fn().mockResolvedValue([]);

      await getBookmarkedQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: [] })
      );
    });
  });
});
