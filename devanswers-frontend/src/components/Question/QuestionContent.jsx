import { useState } from 'react';
import { Card, Row, Col, Badge, Form, Button, Alert } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';
import { FaUser, FaClock, FaPencilAlt } from 'react-icons/fa';
import { voteQuestion, updateQuestion } from '../../reducers/questionSlice';
import { formatDate } from '../../utils/timeFormat';
import VoteButtons from '../Shared/VoteButtons';
import BookmarkButton from '../Shared/BookmarkButton';
import './QuestionContent.css';

const QuestionContent = ({ question }) => {

  const dispatch = useDispatch();
  const userInfo = useSelector((state) => state.user?.userInfo);
  const isAuthor =
    !!userInfo && !!question.author?._id &&
    String(question.author._id) === String(userInfo.userId);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', tags: '' });

  const hasTag = form.tags.split(',').some((tag) => tag.trim());
  const canSave =
    !isSaving && form.title.trim() && form.description.trim() && hasTag;

  const startEditing = () => {
    setForm({
      title: question.title || '',
      description: question.description || '',
      tags: (question.tags || []).map((tag) => tag.name).join(', '),
    });
    setSaveError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveError('');
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      await dispatch(updateQuestion({ id: question._id, ...form })).unwrap();
      setIsEditing(false);
    } catch (error) {
      setSaveError(String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Question Header */}
      <Card className="mb-4 qcontent-header-card">
        <Card.Body className="p-3 p-sm-4">
          <div className="d-flex align-items-start justify-content-between gap-2">
            {isEditing ? (
              <Form.Control
                name="title"
                aria-label="Title"
                value={form.title}
                onChange={handleChange}
                className="mb-3"
              />
            ) : (
              <Card.Title as="h2" className="mb-3 qcontent-title">
                {question.title}
              </Card.Title>
            )}
            <div className="d-flex align-items-center">
              {isAuthor && !isEditing && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-1 text-muted"
                  aria-label="Edit question"
                  title="Edit question"
                  onClick={startEditing}
                >
                  <FaPencilAlt />
                </Button>
              )}
              <BookmarkButton questionId={question._id} />
            </div>
          </div>
          <div className="d-flex flex-wrap gap-3 gap-sm-4 qcontent-meta">
            <span className="d-flex align-items-center gap-2">
              <FaClock />
              Asked {formatDate(question.createdAt)}
              {question.editedAt && (
                <em className="ms-1" title={`Edited ${formatDate(question.editedAt)}`}>
                  edited
                </em>
              )}
            </span>
          </div>
        </Card.Body>
      </Card>

      {/* Question Content */}
      <Card className="mb-4 qcontent-body-card">
        <Card.Body className="p-3 p-sm-4">
          <Row>
            {/* Voting Controls */}
            <Col xs="auto" className="d-flex flex-column align-items-center pe-3 pe-sm-4">
              <VoteButtons
                voteCount={question.voteCount}
                authorId={question.author?._id}
                onVote={(voteType) => dispatch(voteQuestion({ question, voteType }))}
                variant="outline-secondary"
                upClassName="mb-2 qcontent-vote-btn"
                downClassName="mt-2 qcontent-vote-btn"
                countClassName="qcontent-vote-count"
                upIconClassName="qcontent-icon-up"
                downIconClassName="qcontent-icon-down"
                itemType="question"
              />
            </Col>

            {/* Main Content */}
            <Col>
              {isEditing ? (
                <div className="mb-4">
                  <Form.Group className="mb-3" controlId="edit-question-description">
                    <Form.Label>Description</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={6}
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="edit-question-tags">
                    <Form.Label>Tags (comma separated)</Form.Label>
                    <Form.Control
                      name="tags"
                      value={form.tags}
                      onChange={handleChange}
                    />
                  </Form.Group>
                  {saveError && <Alert variant="danger">{saveError}</Alert>}
                  <div className="d-flex gap-2">
                    <Button onClick={handleSave} disabled={!canSave}>
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      onClick={cancelEditing}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4 qcontent-description">
                    {question.description}
                  </div>

                  <div className="mb-4">
                    {question.tags?.map((tag) => (
                      <Badge
                        key={tag._id}
                        className="me-2 mb-2 qcontent-tag-badge"
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </>
              )}

              <div
                className="d-flex align-items-center gap-2 qcontent-author-row"
              >
                <FaUser className="qcontent-icon-sm" />
                <span>Posted by </span>
                <strong className="qcontent-author-name">{question.author?.name}</strong>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </>
  );
};

export default QuestionContent;
