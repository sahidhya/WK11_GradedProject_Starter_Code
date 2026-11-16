import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
// Import setup to initialize MongoDB
import '../setup.js';
import app from "../../src/app.js";
import Question from "../../src/models/Question.js";
import Answer from "../../src/models/Answer.js";
import Tag from "../../src/models/Tag.js";
import User from "../../src/models/User.js";
import dotenv from "dotenv";
dotenv.config();

// The app rate-limits to 100 requests per window and every test file gets its
// own app instance, so users are registered once (beforeAll) and saved
// bookmarks are reset directly in the database between tests, not over HTTP.
// Emails are unique because tests/setup.js does not clear users.
let counter = 0;

async function createUserAndLogin(name = "Bookmark User") {
    counter += 1;
    const email = `bookmark+${Date.now()}-${counter}@example.com`;
    const password = "password123";

    const userRes = await request(app)
        .post("/api/auth/register")
        .send({ name, email, password, isAdmin: false });

    const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email, password });

    return {
        user: userRes.body.data,
        token: loginRes.body.data.token,
        loginData: loginRes.body.data,
    };
}

async function createTag(name = `tag-${Date.now()}-${++counter}`) {
    const tag = new Tag({ name });
    await tag.save();
    return tag;
}

async function createQuestion(author, overrides = {}) {
    const tag = await createTag();
    const question = new Question({
        title: "Bookmark Test Question",
        description: "Testing bookmarks",
        tags: [tag._id],
        author: author._id,
        ...overrides,
    });
    await question.save();
    return question;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe("Bookmarks API", () => {
    let userA, tokenA, loginDataA, userB, tokenB;
    let q1, q2;

    beforeAll(async () => {
        ({ user: userA, token: tokenA, loginData: loginDataA } = await createUserAndLogin("User A"));
        ({ user: userB, token: tokenB } = await createUserAndLogin("User B"));
    });

    beforeEach(async () => {
        await Question.deleteMany({});
        await Answer.deleteMany({});
        await Tag.deleteMany({});
        await User.updateMany({}, { $set: { bookmarks: [] } });

        q1 = await createQuestion(userA, { title: "First question" });
        q2 = await createQuestion(userB, { title: "Second question" });
    });

    describe("PUT /api/users/me/bookmarks/:questionId", () => {
        it("should bookmark a question", async () => {
            const res = await request(app)
                .put(`/api/users/me/bookmarks/${q1._id}`)
                .set(auth(tokenA));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual({
                questionId: q1._id.toString(),
                isBookmarked: true,
            });

            const ids = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenA));
            expect(ids.body.data).toEqual([q1._id.toString()]);
        });

        it("should be idempotent: saving twice stores one entry", async () => {
            await request(app).put(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenA));
            const second = await request(app)
                .put(`/api/users/me/bookmarks/${q1._id}`)
                .set(auth(tokenA));

            expect(second.status).toBe(200);

            const ids = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenA));
            expect(ids.body.data).toEqual([q1._id.toString()]);
        });

        it("should allow bookmarking your own question", async () => {
            const res = await request(app)
                .put(`/api/users/me/bookmarks/${q1._id}`) // q1 was written by user A
                .set(auth(tokenA));

            expect(res.status).toBe(200);
        });

        it("should return 401 without a token", async () => {
            const res = await request(app).put(`/api/users/me/bookmarks/${q1._id}`);

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it("should return 404 for a question that does not exist", async () => {
            const missingId = new mongoose.Types.ObjectId();
            const res = await request(app)
                .put(`/api/users/me/bookmarks/${missingId}`)
                .set(auth(tokenA));

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });

        it("should return 400 for a malformed question id", async () => {
            const res = await request(app)
                .put("/api/users/me/bookmarks/not-an-id")
                .set(auth(tokenA));

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe("DELETE /api/users/me/bookmarks/:questionId", () => {
        it("should remove a bookmark", async () => {
            await request(app).put(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenA));

            const res = await request(app)
                .delete(`/api/users/me/bookmarks/${q1._id}`)
                .set(auth(tokenA));

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual({
                questionId: q1._id.toString(),
                isBookmarked: false,
            });

            const ids = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenA));
            expect(ids.body.data).toEqual([]);
        });

        it("should return 200 when the question was not bookmarked", async () => {
            const res = await request(app)
                .delete(`/api/users/me/bookmarks/${q1._id}`)
                .set(auth(tokenA));

            expect(res.status).toBe(200);
        });

        it("should return 401 without a token", async () => {
            const res = await request(app).delete(`/api/users/me/bookmarks/${q1._id}`);

            expect(res.status).toBe(401);
        });

        it("should return 400 for a malformed question id", async () => {
            const res = await request(app)
                .delete("/api/users/me/bookmarks/not-an-id")
                .set(auth(tokenA));

            expect(res.status).toBe(400);
        });
    });

    describe("GET /api/users/me/bookmarks/ids", () => {
        it("should return an empty array with 200 when nothing is saved", async () => {
            const res = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenA));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([]);
        });

        it("should return the saved ids as strings", async () => {
            await request(app).put(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenA));
            await request(app).put(`/api/users/me/bookmarks/${q2._id}`).set(auth(tokenA));

            const res = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenA));

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.data).toEqual(
                expect.arrayContaining([q1._id.toString(), q2._id.toString()])
            );
            res.body.data.forEach((id) => expect(typeof id).toBe("string"));
        });

        it("should return 401 without a token", async () => {
            const res = await request(app).get("/api/users/me/bookmarks/ids");

            expect(res.status).toBe(401);
        });
    });

    describe("GET /api/users/me/bookmarks", () => {
        it("should return an empty array with 200 when nothing is saved", async () => {
            const res = await request(app)
                .get("/api/users/me/bookmarks")
                .set(auth(tokenA));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([]);
        });

        it("should return populated questions with answerCount", async () => {
            await Answer.create({
                questionId: q2._id,
                answerText: "An answer",
                author: userA._id,
            });
            await request(app).put(`/api/users/me/bookmarks/${q2._id}`).set(auth(tokenA));

            const res = await request(app)
                .get("/api/users/me/bookmarks")
                .set(auth(tokenA));

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            const question = res.body.data[0];
            expect(question._id).toBe(q2._id.toString());
            expect(question.title).toBe("Second question");
            expect(question.author).toMatchObject({ name: "User B" });
            expect(question.tags[0]).toHaveProperty("name");
            expect(question.answerCount).toBe(1);
        });

        it("should return questions newest first", async () => {
            const older = await createQuestion(userA, {
                title: "Older",
                createdAt: new Date("2024-01-01T00:00:00Z"),
            });
            const newer = await createQuestion(userA, {
                title: "Newer",
                createdAt: new Date("2025-01-01T00:00:00Z"),
            });
            // Save the older one last, to prove order is not "most recently saved"
            await request(app).put(`/api/users/me/bookmarks/${newer._id}`).set(auth(tokenA));
            await request(app).put(`/api/users/me/bookmarks/${older._id}`).set(auth(tokenA));

            const res = await request(app)
                .get("/api/users/me/bookmarks")
                .set(auth(tokenA));

            expect(res.body.data.map((q) => q.title)).toEqual(["Newer", "Older"]);
        });

        it("should omit a saved question that was later deleted", async () => {
            await request(app).put(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenA));
            await request(app).put(`/api/users/me/bookmarks/${q2._id}`).set(auth(tokenA));
            await Question.findByIdAndDelete(q1._id);

            const res = await request(app)
                .get("/api/users/me/bookmarks")
                .set(auth(tokenA));

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0]._id).toBe(q2._id.toString());
        });

        it("should return 401 without a token", async () => {
            const res = await request(app).get("/api/users/me/bookmarks");

            expect(res.status).toBe(401);
        });
    });

    describe("Per-user isolation", () => {
        it("should never show one user's saves to another user", async () => {
            await request(app).put(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenA));

            const idsB = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenB));
            const listB = await request(app)
                .get("/api/users/me/bookmarks")
                .set(auth(tokenB));

            expect(idsB.body.data).toEqual([]);
            expect(listB.body.data).toEqual([]);
        });

        it("should keep each user's save and unsave independent", async () => {
            await request(app).put(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenA));
            await request(app).put(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenB));
            await request(app).delete(`/api/users/me/bookmarks/${q1._id}`).set(auth(tokenA));

            const idsA = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenA));
            const idsB = await request(app)
                .get("/api/users/me/bookmarks/ids")
                .set(auth(tokenB));

            expect(idsA.body.data).toEqual([]);
            expect(idsB.body.data).toEqual([q1._id.toString()]);
        });
    });

    describe("Existing behaviour is unchanged", () => {
        it("should keep the login payload as { token, userId, name }", async () => {
            expect(Object.keys(loginDataA).sort()).toEqual(["name", "token", "userId"]);
        });

        it("should keep GET /api/questions public", async () => {
            const res = await request(app).get("/api/questions");

            expect(res.status).toBe(200);
        });
    });
});
