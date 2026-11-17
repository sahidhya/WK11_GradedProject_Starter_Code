import mongoose from 'mongoose';
import User from '../models/User.js';
import Question from '../models/Question.js';
import Answer from '../models/Answer.js';
import { createAppError } from '../utils/createAppError.js';

// Bookmarks: each user keeps a list of saved question ids (User.bookmarks).
// Save and unsave are idempotent, so repeated clicks or retries are harmless.

// A malformed id is a client error (400), not a server error (500).
const assertValidQuestionId = (questionId) => {
  if (!mongoose.isValidObjectId(questionId)) {
    throw createAppError('Invalid question id', 400);
  }
};

// Save a question for this user (404 if the question does not exist).
export const addBookmarkService = async (userId, questionId) => {
  assertValidQuestionId(questionId);

  const question = await Question.findById(questionId);
  if (!question) {
    throw createAppError('Question not found', 404);
  }

  // $addToSet keeps the operation atomic and idempotent (no duplicates)
  await User.findByIdAndUpdate(
    userId,
    { $addToSet: { bookmarks: questionId } },
    { new: true },
  );

  return { questionId, isBookmarked: true };
};

// Unsave a question. Always succeeds, even if it was never saved.
export const removeBookmarkService = async (userId, questionId) => {
  assertValidQuestionId(questionId);

  // No existence check: unsaving a missing/deleted question must still succeed
  await User.findByIdAndUpdate(
    userId,
    { $pull: { bookmarks: questionId } },
    { new: true },
  );

  return { questionId, isBookmarked: false };
};

// Only the ids (as strings). The frontend loads these on startup to draw the
// filled / outline icon on every question.
export const getBookmarkIdsService = async (userId) => {
  const user = await User.findById(userId).select('bookmarks').lean();

  return (user?.bookmarks ?? []).map((id) => id.toString());
};

// Full questions for the Profile "Saved Questions" list, newest first.
export const getBookmarkedQuestionsService = async (userId) => {
  const user = await User.findById(userId).select('bookmarks').lean();
  const bookmarkIds = user?.bookmarks ?? [];

  // Questions deleted after being saved are simply not returned by find().
  // An empty result is a valid answer here, never a 404.
  const questions = await Question.find({ _id: { $in: bookmarkIds } })
    .populate({ path: 'author', select: 'name' })
    .populate('tags')
    .sort({ createdAt: -1 });

  return Promise.all(
    questions.map(async (q) => {
      // Question cards show an answer count, so attach it like the other list endpoints do.
      const answerCount = await Answer.countDocuments({ questionId: q._id });
      return { ...(q.toObject?.() ?? q), answerCount };
    }),
  );
};
