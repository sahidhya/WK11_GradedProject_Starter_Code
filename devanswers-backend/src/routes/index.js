import express from 'express';
import authRouter from './auth.js';
import questionsRouter from './questions.js';
import answersRouter from './answers.js';
import tagsRouter from './tags.js';
import usersRouter from './users.js';

const router = express.Router();

// Route for user registration
router.use('/auth', authRouter);

// Route for Questions
router.use('/questions', questionsRouter);

// Routes for Answers
router.use('/answers', answersRouter);

// Routes for Tags
router.use('/tags', tagsRouter);

// Routes for the authenticated user (bookmarks)
router.use('/users', usersRouter);

export default router;