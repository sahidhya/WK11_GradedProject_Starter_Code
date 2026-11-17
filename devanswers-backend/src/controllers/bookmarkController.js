import {
  addBookmarkService,
  removeBookmarkService,
  getBookmarkIdsService,
  getBookmarkedQuestionsService,
} from '../services/bookmarkService.js';

// Thin handlers: read the logged-in user (req.user.id, set by the authenticate
// middleware), call the service, and reply with the { success, message, data } envelope.
export const addBookmark = async (req, res) => {
  const { questionId } = req.params;

  const data = await addBookmarkService(req.user.id, questionId);

  res.status(200).json({
    success: true,
    message: 'Question bookmarked',
    data,
  });
};

export const removeBookmark = async (req, res) => {
  const { questionId } = req.params;

  const data = await removeBookmarkService(req.user.id, questionId);

  res.status(200).json({
    success: true,
    message: 'Bookmark removed',
    data,
  });
};

export const getBookmarkIds = async (req, res) => {
  const ids = await getBookmarkIdsService(req.user.id);

  res.status(200).json({
    success: true,
    message: 'Bookmark ids fetched successfully',
    data: ids,
  });
};

export const getBookmarkedQuestions = async (req, res) => {
  const questions = await getBookmarkedQuestionsService(req.user.id);

  res.status(200).json({
    success: true,
    message: 'Bookmarked questions fetched successfully',
    data: questions,
  });
};
