import { useDispatch, useSelector } from 'react-redux';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { FaBookmark, FaRegBookmark } from 'react-icons/fa';
import {
  toggleBookmark,
  selectIsBookmarked,
  selectIsBookmarkPending,
} from '../../reducers/bookmarkSlice';
import './BookmarkButton.css';

/**
 * Bookmark toggle used by QuestionCard and QuestionContent.
 * Handles the auth guard (anonymous -> /login), the optimistic toggle and the
 * pending state (disabled while a request is in flight) internally.
 */
const BaseBookmarkButton = ({ questionId, className = '', onAnonymous }) => {
  const dispatch = useDispatch();
  const userInfo = useSelector((state) => state.user?.userInfo);
  const isSaved = useSelector((state) => selectIsBookmarked(state, questionId));
  const isPending = useSelector((state) => selectIsBookmarkPending(state, questionId));

  const label = isSaved ? 'Remove bookmark' : 'Save question';

  const handleClick = async (e) => {
    // The button can sit inside a link/card: never navigate on click
    e.preventDefault();
    e.stopPropagation();

    if (!userInfo) {
      onAnonymous();
      return;
    }

    try {
      await dispatch(
        toggleBookmark({ questionId: String(questionId), currentlySaved: isSaved }),
      ).unwrap();
    } catch (error) {
      alert(`Failed to update bookmark: ${error}`);
    }
  };

  return (
    <button
      type="button"
      className={`bookmark-btn ${isSaved ? 'bookmark-btn-saved' : ''} ${className}`}
      onClick={handleClick}
      disabled={isPending}
      aria-label={label}
      aria-pressed={isSaved}
      title={label}
    >
      {isSaved ? <FaBookmark /> : <FaRegBookmark />}
    </button>
  );
};

// useNavigate only works inside a Router. Some component tests render cards
// without one, so fall back to a plain redirect there.
const RoutedBookmarkButton = (props) => {
  const navigate = useNavigate();
  return <BaseBookmarkButton {...props} onAnonymous={() => navigate('/login')} />;
};

const BookmarkButton = (props) => {
  const inRouter = useInRouterContext();

  return inRouter ? (
    <RoutedBookmarkButton {...props} />
  ) : (
    <BaseBookmarkButton
      {...props}
      onAnonymous={() => window.location.assign('/login')}
    />
  );
};

export default BookmarkButton;
