import express from 'express';
import {
  addBookmark,
  removeBookmark,
  getBookmarkIds,
  getBookmarkedQuestions,
} from '../controllers/bookmarkController.js';
import authenticate from '../middleware/authHandler.js';

const router = express.Router();

// All routes are protected - "me" is always the authenticated user.
// Static "/ids" is declared before any parameterised route on the same prefix.
router.get('/me/bookmarks/ids', authenticate, getBookmarkIds);
router.get('/me/bookmarks', authenticate, getBookmarkedQuestions);
router.put('/me/bookmarks/:questionId', authenticate, addBookmark);
router.delete('/me/bookmarks/:questionId', authenticate, removeBookmark);

export default router;
