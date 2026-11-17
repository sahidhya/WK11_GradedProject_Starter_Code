import axiosInstance from "../api/axiosInstance.js";
import { BOOKMARK_API } from "../config/config.js";

// API calls for bookmarks. All of them need the logged-in user's token (Bearer header).
const authHeader = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

export const getBookmarkIds = async (token) => {
  const res = await axiosInstance.get(BOOKMARK_API.IDS, authHeader(token));
  return res.data.data || [];
};

export const getBookmarkedQuestions = async (token) => {
  const res = await axiosInstance.get(BOOKMARK_API.LIST, authHeader(token));
  return res.data.data || [];
};

export const addBookmark = async (questionId, token) => {
  const res = await axiosInstance.put(
    BOOKMARK_API.ITEM(questionId),
    {},
    authHeader(token),
  );
  return res.data.data;
};

export const removeBookmark = async (questionId, token) => {
  const res = await axiosInstance.delete(
    BOOKMARK_API.ITEM(questionId),
    authHeader(token),
  );
  return res.data.data;
};
