import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAllQuestionsService,
  getQuestionByIdService,
  createQuestionService,
  updateQuestionService,
  deleteQuestionService,
  upvoteQuestionService,
  downvoteQuestionService,
} from "../../../src/services/questionService.js";
import Question from "../../../src/models/Question.js";
import Answer from "../../../src/models/Answer.js";
import Tag from "../../../src/models/Tag.js";
import { handleVote } from "../../../src/services/voteService.js";

// Mock the models and services
// Mock voteService since questionService delegates vote logic to it
vi.mock("../../../src/models/Question.js");
vi.mock("../../../src/models/Answer.js");
vi.mock("../../../src/models/Tag.js");
vi.mock("../../../src/services/voteService.js");

describe("questionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllQuestionsService", () => {
    // Success case
    it("should return all questions with populated fields", async () => {
      // Arrange
      const mockQuestions = [
        {
          _id: "question1",
          title: "Question 1",
          author: { _id: "user1", name: "User 1" },
          tags: [{ _id: "tag1", name: "javascript" }],
        },
      ];

      Question.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            sort: vi.fn().mockResolvedValue(mockQuestions),
          }),
        }),
      });
      Answer.countDocuments = vi.fn().mockResolvedValue(3);

      // Act
      const result = await getAllQuestionsService();

      // Assert
      expect(Question.find).toHaveBeenCalledWith({});
      expect(result).toEqual([{ ...mockQuestions[0], answerCount: 3 }]);
      expect(result).toHaveLength(1);
    });

    // Edge case - sorted by createdAt
    it("should sort questions by createdAt descending", async () => {
      // Arrange
      const sortSpy = vi.fn().mockResolvedValue([{ _id: "q1" }]);

      Question.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            sort: sortSpy,
          }),
        }),
      });
      Answer.countDocuments = vi.fn().mockResolvedValue(0);

      // Act
      await getAllQuestionsService();

      // Assert
      expect(sortSpy).toHaveBeenCalledWith({ createdAt: -1 });
    });

    // Error case - no questions found
    it("should throw 404 error when no questions exist", async () => {
      // Arrange
      Question.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            sort: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Act & Assert
      await expect(getAllQuestionsService()).rejects.toThrow(
        "No questions found",
      );
      await expect(getAllQuestionsService()).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    // Error case - null result
    it("should throw 404 error when result is null", async () => {
      // Arrange
      Question.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            sort: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      // Act & Assert
      await expect(getAllQuestionsService()).rejects.toThrow(
        "No questions found",
      );
    });
  });

  describe("getQuestionByIdService", () => {
    // Success case
    it("should return question by id with populated fields and answers", async () => {
      // Arrange
      const mockPopulatedQuestion = {
        _id: "question123",
        title: "Test Question",
        author: { _id: "user1", name: "User 1" },
        tags: [{ _id: "tag1", name: "javascript" }],
        views: 1,
        toObject: vi.fn().mockReturnValue({
          _id: "question123",
          title: "Test Question",
          author: { _id: "user1", name: "User 1" },
          views: 1,
        }),
      };

      const mockAnswers = [{ _id: "answer1", answerText: "Test Answer" }];

      // Views are incremented and the document fetched in one atomic query
      Question.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(mockPopulatedQuestion),
        }),
      });

      Answer.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockAnswers),
      });

      // Act
      const result = await getQuestionByIdService("question123");

      // Assert
      expect(Question.findByIdAndUpdate).toHaveBeenCalledWith(
        "question123",
        { $inc: { views: 1 } },
        { new: true },
      );
      expect(result.answers).toEqual(mockAnswers);
    });

    // Edge case - view increment
    it("should increment views count atomically", async () => {
      // Arrange
      const mockPopulated = {
        _id: "question123",
        views: 6,
        toObject: vi.fn().mockReturnValue({ _id: "question123", views: 6 }),
      };

      Question.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(mockPopulated),
        }),
      });

      Answer.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
      });

      // Act
      const result = await getQuestionByIdService("question123");

      // Assert
      expect(Question.findByIdAndUpdate).toHaveBeenCalledWith(
        "question123",
        { $inc: { views: 1 } },
        { new: true },
      );
      expect(result.views).toBe(6);
    });

    // Error case - question not found
    it("should throw 404 error if question not found", async () => {
      // Arrange
      Question.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue(null),
        }),
      });

      // Act & Assert
      await expect(getQuestionByIdService("nonexistent")).rejects.toThrow(
        "Question not found",
      );
      await expect(getQuestionByIdService("nonexistent")).rejects.toMatchObject(
        {
          statusCode: 404,
        },
      );
    });

    // Failure case - database error
    it("should propagate database errors", async () => {
      // Arrange
      Question.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockRejectedValue(new Error("Database error")),
        }),
      });

      // Act & Assert
      await expect(getQuestionByIdService("question123")).rejects.toThrow(
        "Database error",
      );
    });
  });

  describe("createQuestionService", () => {
    // Success case
    it("should create and return a new question with tags", async () => {
      // Arrange
      Tag.findOne = vi.fn().mockResolvedValue(null);

      const mockTagInstance = {
        _id: "tag123",
        save: vi.fn().mockResolvedValue(true),
      };
      Tag.mockImplementation(() => mockTagInstance);

      const mockQuestionInstance = {
        _id: "question123",
        title: "New Question",
        description: "Question description",
        tags: ["tag123", "tag123"],
        author: "user123",
        save: vi.fn().mockResolvedValue(true),
      };
      Question.mockImplementation(() => mockQuestionInstance);

      // Act
      const result = await createQuestionService({
        title: "New Question",
        description: "Question description",
        tags: "javascript, nodejs",
        author: "user123",
      });

      // Assert
      expect(mockQuestionInstance.save).toHaveBeenCalled();
      expect(result).toEqual(mockQuestionInstance);
    });

    // Edge case - reuse existing tags
    it("should reuse existing tags", async () => {
      // Arrange
      const existingTag = { _id: "existingTag123", name: "javascript" };
      Tag.findOne = vi
        .fn()
        .mockResolvedValueOnce(existingTag)
        .mockResolvedValueOnce(null);

      const mockNewTag = {
        _id: "newTag123",
        save: vi.fn().mockResolvedValue(true),
      };
      Tag.mockImplementation(() => mockNewTag);

      const mockQuestion = {
        _id: "question123",
        tags: ["existingTag123", "newTag123"],
        save: vi.fn().mockResolvedValue(true),
      };
      Question.mockImplementation(() => mockQuestion);

      // Act
      await createQuestionService({
        title: "Test",
        description: "Test",
        tags: "javascript, new-tag",
        author: "user123",
      });

      // Assert
      expect(Tag.findOne).toHaveBeenCalledTimes(2);
      expect(mockNewTag.save).toHaveBeenCalled();
    });

    // Edge case - trim whitespace from tags
    it("should handle tags with extra whitespace", async () => {
      // Arrange
      Tag.findOne = vi.fn().mockResolvedValue(null);
      Tag.mockImplementation(() => ({
        _id: "tag123",
        save: vi.fn().mockResolvedValue(true),
      }));

      Question.mockImplementation(() => ({
        _id: "q123",
        save: vi.fn().mockResolvedValue(true),
      }));

      // Act
      await createQuestionService({
        title: "Test",
        description: "Test",
        tags: "  javascript  ,  nodejs  ",
        author: "user123",
      });

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: "javascript" });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: "nodejs" });
    });
  });

  describe("updateQuestionService", () => {
    const QID = "507f1f77bcf86cd799439011";
    const author = { id: "user123", isAdmin: false };
    const existingQuestion = () => ({
      _id: QID,
      author: { toString: () => "user123" },
    });

    // Mongoose queries are chainable and awaitable
    const chain = (result) => {
      const c = {
        populate: vi.fn(() => c),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return c;
    };

    const setupTags = () => {
      Tag.findOne = vi.fn().mockResolvedValue(null);
      let n = 0;
      Tag.mockImplementation(() => ({
        _id: `tag${++n}`,
        save: vi.fn().mockResolvedValue(true),
      }));
    };

    beforeEach(() => {
      setupTags();
      Question.findById = vi.fn().mockResolvedValue(existingQuestion());
      Question.findByIdAndUpdate = vi.fn().mockReturnValue(chain({ _id: QID }));
    });

    // Success case
    it("should update, set editedAt and return the populated question", async () => {
      const populated = {
        _id: QID,
        title: "Updated Title",
        description: "Updated Description",
        author: { _id: "user123", name: "Ann" },
        tags: [{ _id: "tag1", name: "tag1" }],
      };
      const query = chain(populated);
      Question.findByIdAndUpdate = vi.fn().mockReturnValue(query);

      const result = await updateQuestionService(
        QID,
        "Updated Title",
        "Updated Description",
        "tag1, tag2",
        author,
      );

      expect(Question.findById).toHaveBeenCalledWith(QID);
      expect(Question.findByIdAndUpdate).toHaveBeenCalledWith(
        QID,
        expect.objectContaining({
          title: "Updated Title",
          description: "Updated Description",
          editedAt: expect.any(Date),
        }),
        { new: true },
      );
      expect(query.populate).toHaveBeenCalledWith(
        expect.objectContaining({ path: "author" }),
      );
      expect(query.populate).toHaveBeenCalledWith("tags");
      expect(result).toEqual(populated);
    });

    it("should save trimmed values", async () => {
      await updateQuestionService(QID, "  Title  ", "  Desc  ", " a ", author);

      expect(Question.findByIdAndUpdate).toHaveBeenCalledWith(
        QID,
        expect.objectContaining({ title: "Title", description: "Desc" }),
        { new: true },
      );
      expect(Tag.findOne).toHaveBeenCalledWith({ name: "a" });
    });

    it("should drop empty and duplicate tags", async () => {
      await updateQuestionService(QID, "Title", "Desc", "a, a, b, ,", author);

      expect(Tag.findOne).toHaveBeenCalledTimes(2);
      expect(Tag.findOne).toHaveBeenCalledWith({ name: "a" });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: "b" });
      const update = Question.findByIdAndUpdate.mock.calls[0][1];
      expect(update.tags).toHaveLength(2);
    });

    it("should reuse the existing tag when a concurrent request created it first", async () => {
      Tag.findOne = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: "existingTag" });
      Tag.mockImplementation(() => ({
        _id: "newTag",
        save: vi.fn().mockRejectedValue({ code: 11000 }),
      }));

      await updateQuestionService(QID, "Title", "Desc", "race", author);

      const update = Question.findByIdAndUpdate.mock.calls[0][1];
      expect(update.tags).toEqual(["existingTag"]);
    });

    // Error case - question not found
    it("should throw 404 if question not found during update", async () => {
      Question.findById = vi.fn().mockResolvedValue(null);

      await expect(
        updateQuestionService(QID, "Title", "Description", "tag", author),
      ).rejects.toMatchObject({ statusCode: 404, message: "Question not found" });
    });

    // Error case - malformed id
    it("should throw 400 for a malformed question id", async () => {
      await expect(
        updateQuestionService("not-an-id", "Title", "Description", "tag", author),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(Question.findById).not.toHaveBeenCalled();
    });

    // Authorization cases
    it("should throw 403 if user is not the author", async () => {
      const other = { id: "otherUser", isAdmin: false };

      await expect(
        updateQuestionService(QID, "Hacked", "Hacked", "tag", other),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "Not authorized to update this question",
      });
      expect(Question.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should throw 403 for an admin who is not the author", async () => {
      const admin = { id: "admin123", isAdmin: true };

      await expect(
        updateQuestionService(QID, "Admin edit", "Admin edit", "tag", admin),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(Question.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    // Validation cases
    it.each([
      ["blank title", "   ", "Desc", "tag"],
      ["empty title", "", "Desc", "tag"],
      ["missing title", undefined, "Desc", "tag"],
      ["non-string title", 123, "Desc", "tag"],
      ["blank description", "Title", "   ", "tag"],
      ["missing description", "Title", undefined, "tag"],
      ["missing tags", "Title", "Desc", undefined],
      ["empty tags", "Title", "Desc", ""],
      ["tags with only separators", "Title", "Desc", " , , "],
      ["array tags", "Title", "Desc", ["a"]],
    ])("should throw 400 and save nothing for %s", async (_name, title, description, tags) => {
      await expect(
        updateQuestionService(QID, title, description, tags, author),
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(Question.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(Tag.findOne).not.toHaveBeenCalled();
    });
  });

  describe("deleteQuestionService", () => {
    // Success case - author deletes
    it("should delete question when user is the author", async () => {
      // Arrange
      const mockQuestion = {
        _id: "question123",
        author: { toString: () => "user123" },
        title: "Test Question",
      };

      Question.findById = vi.fn().mockResolvedValue(mockQuestion);
      Question.findByIdAndDelete = vi.fn().mockResolvedValue(mockQuestion);
      Answer.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 2 });

      const loggedInUser = { id: "user123", isAdmin: false };

      // Act
      const result = await deleteQuestionService("question123", loggedInUser);

      // Assert
      expect(Question.findByIdAndDelete).toHaveBeenCalledWith("question123");
      expect(Answer.deleteMany).toHaveBeenCalledWith({
        questionId: "question123",
      });
      expect(result).toEqual(mockQuestion);
    });

    // Success case - admin deletes
    it("should delete question when user is an admin", async () => {
      // Arrange
      const mockQuestion = {
        _id: "question123",
        author: { toString: () => "author456" },
      };

      Question.findById = vi.fn().mockResolvedValue(mockQuestion);
      Question.findByIdAndDelete = vi.fn().mockResolvedValue(mockQuestion);
      Answer.deleteMany = vi.fn().mockResolvedValue({});

      const loggedInUser = { id: "admin789", isAdmin: true };

      // Act
      const result = await deleteQuestionService("question123", loggedInUser);

      // Assert
      expect(Question.findByIdAndDelete).toHaveBeenCalledWith("question123");
      expect(result).toEqual(mockQuestion);
    });

    // Error case - not authorized
    it("should throw 403 error when user is not authorized", async () => {
      // Arrange
      const mockQuestion = {
        _id: "question123",
        author: { toString: () => "author456" },
      };

      Question.findById = vi.fn().mockResolvedValue(mockQuestion);

      const loggedInUser = { id: "otherUser789", isAdmin: false };

      // Act & Assert
      await expect(
        deleteQuestionService("question123", loggedInUser),
      ).rejects.toThrow("Not authorized to delete this question");
      await expect(
        deleteQuestionService("question123", loggedInUser),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    // Error case - question not found
    it("should throw 404 error for non-existent question", async () => {
      // Arrange
      Question.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(
        deleteQuestionService("nonexistent", { id: "user123", isAdmin: false }),
      ).rejects.toThrow("Question not found");
      await expect(
        deleteQuestionService("nonexistent", { id: "user123", isAdmin: false }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    // Edge case - deletes related answers
    it("should delete related answers when deleting a question", async () => {
      // Arrange
      const mockQuestion = {
        _id: "question123",
        author: { toString: () => "user123" },
      };

      Question.findById = vi.fn().mockResolvedValue(mockQuestion);
      Question.findByIdAndDelete = vi.fn().mockResolvedValue(mockQuestion);
      Answer.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 3 });

      // Act
      await deleteQuestionService("question123", {
        id: "user123",
        isAdmin: false,
      });

      // Assert
      expect(Answer.deleteMany).toHaveBeenCalledWith({
        questionId: "question123",
      });
    });
  });

  describe("upvoteQuestionService", () => {
    // Success case
    it("should call handleVote with correct parameters", async () => {
      // Arrange
      const mockDocument = {
        upvotes: ["user123"],
        downvotes: [],
        voteCount: 1,
      };
      handleVote.mockResolvedValue(mockDocument);

      // Act
      const result = await upvoteQuestionService("questionId", "user123");

      // Assert
      expect(handleVote).toHaveBeenCalledWith(
        Question,
        "questionId",
        "user123",
        "upvote",
      );
      expect(result).toEqual(mockDocument);
    });

    // Error case - handleVote returns null
    it("should throw error when handleVote returns null", async () => {
      // Arrange
      handleVote.mockResolvedValue(null);

      // Act & Assert
      await expect(
        upvoteQuestionService("questionId", "user123"),
      ).rejects.toThrow("Failed to upvote question");
    });
  });

  describe("downvoteQuestionService", () => {
    // Success case
    it("should call handleVote with correct parameters", async () => {
      // Arrange
      const mockDocument = {
        upvotes: [],
        downvotes: ["user123"],
        voteCount: -1,
      };
      handleVote.mockResolvedValue(mockDocument);

      // Act
      const result = await downvoteQuestionService("questionId", "user123");

      // Assert
      expect(handleVote).toHaveBeenCalledWith(
        Question,
        "questionId",
        "user123",
        "downvote",
      );
      expect(result).toEqual(mockDocument);
    });

    // Error case - handleVote returns null
    it("should throw error when handleVote returns null", async () => {
      // Arrange
      handleVote.mockResolvedValue(null);

      // Act & Assert
      await expect(
        downvoteQuestionService("questionId", "user123"),
      ).rejects.toThrow("Failed to downvote question");
    });
  });
});
