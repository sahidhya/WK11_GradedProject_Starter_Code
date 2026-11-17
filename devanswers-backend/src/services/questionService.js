import mongoose from "mongoose";
import Question from "../models/Question.js";
import { createAppError } from "../utils/createAppError.js";
import Answer from "../models/Answer.js";
import Tag from "../models/Tag.js";
import { handleVote } from "./voteService.js";
import { generateText, extractJSON } from "../utils/geminiClient.js";

export const getAllQuestionsService = async () => {
  const questions = await Question.find({})
    .populate({ path: "author", select: "name" })
    .populate("tags")
    .sort({ createdAt: -1 });

  if (!questions || questions.length === 0) {
    throw createAppError("No questions found", 404);
  }

  // Attach answerCount to each question so the frontend can display and sort by it
  const questionsWithCount = await Promise.all(
    questions.map(async (q) => {
      const answerCount = await Answer.countDocuments({ questionId: q._id });
      return { ...(q.toObject?.() ?? q), answerCount };
    }),
  );

  return questionsWithCount;
};

export const getQuestionByIdService = async (id) => {
  // Increment views and fetch populated question in one query
  let question = await Question.findByIdAndUpdate(
    id,
    { $inc: { views: 1 } },
    { new: true }, // return updated document
  )
    .populate({ path: "author", select: "name" })
    .populate("tags");

  if (!question) {
    throw createAppError("Question not found", 404);
  }

  // Fetch answers for the question.
  const answers = await Answer.find({ questionId: id }).populate({
    path: "author",
    select: "name",
  });

  question = question.toObject(); // convert Mongoose document to plain object
  question.answers = answers;

  return question;
};

export const createQuestionService = async ({
  title,
  description,
  tags,
  author,
}) => {
  const tagArray = tags
    .trim()
    .split(",")
    .map((tag) => tag.trim());

  const tagIds = await Promise.all(
    tagArray.map(async (tag) => {
      const existingTag = await Tag.findOne({ name: tag });
      if (existingTag) return existingTag._id;

      const newTag = new Tag({ name: tag });
      await newTag.save();
      return newTag._id;
    }),
  );

  const newQuestion = new Question({
    title,
    description,
    tags: tagIds,
    author,
  });

  await newQuestion.save();

  return newQuestion;
};

const isNonBlankString = (value) =>
  typeof value === "string" && value.trim().length > 0;

// Parses "a, b, a" into unique, trimmed, non-empty tag names
const parseTagNames = (tags) => {
  if (typeof tags !== "string") return [];
  const names = tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return [...new Set(names)];
};

// Finds or creates each tag. If a concurrent request creates the same tag
// first (duplicate key), reuse the one that now exists instead of failing.
const resolveTagIds = (tagNames) =>
  Promise.all(
    tagNames.map(async (name) => {
      const existingTag = await Tag.findOne({ name });
      if (existingTag) return existingTag._id;

      try {
        const newTag = new Tag({ name });
        await newTag.save();
        return newTag._id;
      } catch (error) {
        if (error?.code === 11000) {
          const createdMeanwhile = await Tag.findOne({ name });
          if (createdMeanwhile) return createdMeanwhile._id;
        }
        throw error;
      }
    }),
  );

// Edit a question. Author only (admins cannot edit other people's posts). Order of checks:
// valid input (400) -> question exists (404) -> is the author (403) -> save + mark edited.
export const updateQuestionService = async (
  id,
  title,
  description,
  tags,
  loggedInUser,
) => {
  // Validate first: bad input is a 400, never a 500 or a blank post saved to the database.
  if (!mongoose.isValidObjectId(id)) {
    throw createAppError("Invalid question id", 400);
  }
  if (!isNonBlankString(title)) {
    throw createAppError("Title is required", 400);
  }
  if (!isNonBlankString(description)) {
    throw createAppError("Description is required", 400);
  }
  const tagNames = parseTagNames(tags);
  if (tagNames.length === 0) {
    throw createAppError("At least one tag is required", 400);
  }

  const question = await Question.findById(id);

  if (!question) {
    throw createAppError("Question not found", 404);
  }

  // Author only: admins may delete, but not edit, other users' questions
  if (question.author.toString() !== loggedInUser.id.toString()) {
    throw createAppError("Not authorized to update this question", 403);
  }

  // Turn tag names into Tag ids (existing tags are reused, new ones are created).
  const tagIds = await resolveTagIds(tagNames);

  const updatedQuestion = await Question.findByIdAndUpdate(
    id,
    {
      title: title.trim(),
      description: description.trim(),
      tags: tagIds,
      // The "edited" marker. Set only here, so views and votes never make a post look edited.
      editedAt: new Date(),
    },
    { new: true },
  )
    .populate({ path: "author", select: "name" })
    .populate("tags");

  if (!updatedQuestion) {
    throw createAppError("Question not found", 404);
  }

  return updatedQuestion;
};

export const deleteQuestionService = async (id, loggedInUser) => {
  const question = await Question.findById(id);

  if (!question) {
    throw createAppError("Question not found", 404);
  }

  // Check if the logged-in user is the owner or an admin
  if (
    question.author.toString() !== loggedInUser.id.toString() &&
    !loggedInUser.isAdmin
  ) {
    throw createAppError("Not authorized to delete this question", 403);
  }

  await Question.findByIdAndDelete(id);
  await Answer.deleteMany({ questionId: id }); // optional: delete related answers

  return question;
};

export const upvoteQuestionService = async (questionId, userId) => {
  const document = await handleVote(Question, questionId, userId, "upvote");

  if (!document) {
    throw createAppError("Failed to upvote question", 400);
  }

  return document;
};

export const downvoteQuestionService = async (questionId, userId) => {
  const document = await handleVote(Question, questionId, userId, "downvote");

  if (!document) {
    throw createAppError("Failed to downvote question", 400);
  }

  return document;
};

export const improveQuestionService = async (title, description, tags) => {
  if (!title || !description) {
    throw createAppError('title and description are required.', 400);
  }

  const prompt = `You are a developer Q&A assistant. Improve the following question for clarity, specificity, and searchability.
Return ONLY valid JSON (no markdown, no code blocks) with exactly these keys:
- improved_title: string
- improved_description: string
- improved_tags: array of strings (relevant technology/concept tags)

Title: ${title}
Description: ${description}
Tags: ${tags || ''}`;

  const text = await generateText(prompt);

  return extractJSON(text);
};
