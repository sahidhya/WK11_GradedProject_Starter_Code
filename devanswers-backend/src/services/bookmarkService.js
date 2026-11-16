import mongoose from 'mongoose';
import User from '../models/User.js';
import Question from '../models/Question.js';
import Answer from '../models/Answer.js';
import { createAppError } from '../utils/createAppError.js';

const assertValidQuestionId = (questionId) => {
  if (!mongoose.isValidObjectId(questionId)) {
    throw createAppError('Invalid question id', 400);
  }
};

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

export const getBookmarkIdsService = async (userId) => {
  const user = await User.findById(userId).select('bookmarks').lean();

  return (user?.bookmarks ?? []).map((id) => id.toString());
};

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
      const answerCount = await Answer.countDocuments({ questionId: q._id });
      return { ...(q.toObject?.() ?? q), answerCount };
    }),
  );
};
