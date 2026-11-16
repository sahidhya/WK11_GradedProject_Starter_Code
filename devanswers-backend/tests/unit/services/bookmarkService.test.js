import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  addBookmarkService,
  removeBookmarkService,
  getBookmarkIdsService,
  getBookmarkedQuestionsService,
} from '../../../src/services/bookmarkService.js';
import User from '../../../src/models/User.js';
import Question from '../../../src/models/Question.js';
import Answer from '../../../src/models/Answer.js';

vi.mock('../../../src/models/User.js');
vi.mock('../../../src/models/Question.js');
vi.mock('../../../src/models/Answer.js');

// Mongoose queries are chainable and awaitable. This helper returns a chainable
// thenable so the tests do not depend on exactly which chain methods the
// service calls (select / lean / populate / sort).
function chain(result) {
  const c = {
    select: vi.fn(() => c),
    lean: vi.fn(() => c),
    populate: vi.fn(() => c),
    sort: vi.fn(() => c),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return c;
}

const USER_ID = new mongoose.Types.ObjectId().toString();
const Q1 = new mongoose.Types.ObjectId();
const Q2 = new mongoose.Types.ObjectId();
const VALID_ID = Q1.toString();

describe('bookmarkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addBookmarkService', () => {
    // Success case
    it('should add the question to the user bookmarks with $addToSet', async () => {
      Question.findById = vi.fn().mockReturnValue(chain({ _id: Q1 }));
      User.findByIdAndUpdate = vi.fn().mockResolvedValue({});

      const result = await addBookmarkService(USER_ID, VALID_ID);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        USER_ID,
        { $addToSet: { bookmarks: VALID_ID } },
        expect.anything()
      );
      expect(result).toEqual({ questionId: VALID_ID, isBookmarked: true });
    });

    // Idempotency - saving twice is not an error
    it('should succeed when the question is already bookmarked', async () => {
      Question.findById = vi.fn().mockReturnValue(chain({ _id: Q1 }));
      User.findByIdAndUpdate = vi.fn().mockResolvedValue({});

      await addBookmarkService(USER_ID, VALID_ID);
      const result = await addBookmarkService(USER_ID, VALID_ID);

      expect(result).toEqual({ questionId: VALID_ID, isBookmarked: true });
      // Always $addToSet, never $push, so duplicates cannot happen
      for (const call of User.findByIdAndUpdate.mock.calls) {
        expect(call[1]).toHaveProperty('$addToSet');
        expect(call[1]).not.toHaveProperty('$push');
      }
    });

    // Error case - question does not exist
    it('should throw 404 when the question does not exist', async () => {
      Question.findById = vi.fn().mockReturnValue(chain(null));
      User.findByIdAndUpdate = vi.fn();

      await expect(addBookmarkService(USER_ID, VALID_ID)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Question not found',
      });
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    // Error case - malformed id
    it('should throw 400 for a malformed question id', async () => {
      User.findByIdAndUpdate = vi.fn();

      await expect(addBookmarkService(USER_ID, 'not-an-id')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid question id',
      });
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('removeBookmarkService', () => {
    // Success case
    it('should remove the question from the user bookmarks with $pull', async () => {
      User.findByIdAndUpdate = vi.fn().mockResolvedValue({});

      const result = await removeBookmarkService(USER_ID, VALID_ID);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        USER_ID,
        { $pull: { bookmarks: VALID_ID } },
        expect.anything()
      );
      expect(result).toEqual({ questionId: VALID_ID, isBookmarked: false });
    });

    // Idempotency - question was never bookmarked or has been deleted
    it('should succeed without checking that the question exists', async () => {
      User.findByIdAndUpdate = vi.fn().mockResolvedValue({});
      Question.findById = vi.fn();

      const result = await removeBookmarkService(USER_ID, VALID_ID);

      expect(result).toEqual({ questionId: VALID_ID, isBookmarked: false });
      expect(Question.findById).not.toHaveBeenCalled();
    });

    // Error case - malformed id
    it('should throw 400 for a malformed question id', async () => {
      User.findByIdAndUpdate = vi.fn();

      await expect(removeBookmarkService(USER_ID, 'not-an-id')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid question id',
      });
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getBookmarkIdsService', () => {
    // Success case
    it('should return the bookmark ids as strings', async () => {
      User.findById = vi.fn().mockReturnValue(chain({ bookmarks: [Q1, Q2] }));

      const result = await getBookmarkIdsService(USER_ID);

      expect(result).toEqual([Q1.toString(), Q2.toString()]);
      result.forEach((id) => expect(typeof id).toBe('string'));
    });

    // Edge case - nothing saved
    it('should return an empty array when the user has no bookmarks', async () => {
      User.findById = vi.fn().mockReturnValue(chain({ bookmarks: [] }));

      const result = await getBookmarkIdsService(USER_ID);

      expect(result).toEqual([]);
    });

    // Edge case - field missing on an older user document
    it('should return an empty array when the bookmarks field is missing', async () => {
      User.findById = vi.fn().mockReturnValue(chain({}));

      const result = await getBookmarkIdsService(USER_ID);

      expect(result).toEqual([]);
    });
  });

  describe('getBookmarkedQuestionsService', () => {
    // Success case
    it('should return the bookmarked questions with answerCount', async () => {
      const questions = [
        { _id: Q2, title: 'Newer', author: { _id: 'u1', name: 'Ann' }, tags: [{ name: 'js' }] },
        { _id: Q1, title: 'Older', author: { _id: 'u1', name: 'Ann' }, tags: [] },
      ];
      User.findById = vi.fn().mockReturnValue(chain({ bookmarks: [Q1, Q2] }));
      const questionQuery = chain(questions);
      Question.find = vi.fn().mockReturnValue(questionQuery);
      Answer.countDocuments = vi
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0);

      const result = await getBookmarkedQuestionsService(USER_ID);

      expect(Question.find).toHaveBeenCalledWith({ _id: { $in: [Q1, Q2] } });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ title: 'Newer', answerCount: 3 });
      expect(result[1]).toMatchObject({ title: 'Older', answerCount: 0 });
    });

    // Query shape - same populate/sort as the other question lists
    it('should populate author and tags and sort newest first', async () => {
      User.findById = vi.fn().mockReturnValue(chain({ bookmarks: [Q1] }));
      const questionQuery = chain([{ _id: Q1, title: 'Only' }]);
      Question.find = vi.fn().mockReturnValue(questionQuery);
      Answer.countDocuments = vi.fn().mockResolvedValue(0);

      await getBookmarkedQuestionsService(USER_ID);

      expect(questionQuery.populate).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'author' })
      );
      expect(questionQuery.populate).toHaveBeenCalledWith('tags');
      expect(questionQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    // Edge case - nothing saved: [] and never a 404
    it('should return an empty array (not throw) when the user has no bookmarks', async () => {
      User.findById = vi.fn().mockReturnValue(chain({ bookmarks: [] }));
      Question.find = vi.fn().mockReturnValue(chain([]));
      Answer.countDocuments = vi.fn().mockResolvedValue(0);

      const result = await getBookmarkedQuestionsService(USER_ID);

      expect(result).toEqual([]);
    });

    // Edge case - a bookmarked question was deleted: find simply does not return it
    it('should omit bookmarked questions that no longer exist', async () => {
      // User still holds both ids, but only Q2 exists in the database
      User.findById = vi.fn().mockReturnValue(chain({ bookmarks: [Q1, Q2] }));
      Question.find = vi
        .fn()
        .mockReturnValue(chain([{ _id: Q2, title: 'Still here' }]));
      Answer.countDocuments = vi.fn().mockResolvedValue(1);

      const result = await getBookmarkedQuestionsService(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Still here');
    });
  });
});
