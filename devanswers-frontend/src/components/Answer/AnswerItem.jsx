import { useState } from 'react';
import { Card, Row, Col, Form, Button, Alert } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';
import { FaUser, FaClock, FaPencilAlt } from 'react-icons/fa';
import { voteAnswer, updateAnswer } from '../../reducers/questionSlice';
import { formatDate } from '../../utils/timeFormat';
import VoteButtons from '../Shared/VoteButtons';
import './AnswerList.css';

// One answer. It owns its own edit state, so several answers can be in edit
// mode at once and saving one never disturbs the others.
const AnswerItem = ({ answer }) => {
  const dispatch = useDispatch();
  const userInfo = useSelector((state) => state.user?.userInfo);
  const isAuthor =
    !!userInfo && !!answer.author?._id &&
    String(answer.author._id) === String(userInfo.userId);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [text, setText] = useState('');

  const startEditing = () => {
    setText(answer.answerText || '');
    setSaveError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveError('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      await dispatch(updateAnswer({ answerId: answer._id, answerText: text })).unwrap();
      setIsEditing(false);
    } catch (error) {
      setSaveError(String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="mb-1 alist-answer-card">
      <Card.Body className="p-2">
        <Row>
          {/* Voting Controls */}
          <Col xs="auto" className="d-flex flex-column align-items-center align-self-start pe-3">
            <VoteButtons
              voteCount={answer.voteCount}
              authorId={answer.author?._id}
              onVote={(voteType) => dispatch(voteAnswer({ answer, voteType }))}
              variant="outline-secondary"
              upClassName="alist-vote-btn alist-vote-btn-up"
              downClassName="alist-vote-btn alist-vote-btn-down"
              countClassName="alist-vote-count"
              upIconClassName="alist-icon-up"
              downIconClassName="alist-icon-down"
              itemType="answer"
            />
          </Col>

          {/* Answer Content */}
          <Col>
            {isEditing ? (
              <div className="mb-2">
                <Form.Control
                  as="textarea"
                  rows={5}
                  aria-label="Answer text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="mb-2"
                />
                {saveError && <Alert variant="danger">{saveError}</Alert>}
                <div className="d-flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || !text.trim()}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={cancelEditing}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-2 alist-content">
                {answer.answerText}
              </div>
            )}
            <div className="mt-2 d-flex align-items-center gap-2 alist-meta">
              <FaUser className="alist-icon-sm" />
              <span>Answered by </span>
              <strong className="alist-author">{answer.author?.name}</strong>
              {answer.createdAt && (
                <>
                  <span className="mx-2">•</span>
                  <FaClock className="alist-icon-sm" />
                  <span>{formatDate(answer.createdAt)}</span>
                </>
              )}
              {answer.editedAt && (
                <em title={`Edited ${formatDate(answer.editedAt)}`}>edited</em>
              )}
              {isAuthor && !isEditing && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-1 text-muted"
                  aria-label="Edit answer"
                  title="Edit answer"
                  onClick={startEditing}
                >
                  <FaPencilAlt />
                </Button>
              )}
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default AnswerItem;
