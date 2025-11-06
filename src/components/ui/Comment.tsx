/**
 * Comment Component
 * Atlassian Design System inspired comment component for discussions
 */

import React, { useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { TextArea } from './TextArea';

export interface CommentAuthor {
  name: string;
  avatar?: string;
  timestamp: string;
}

export interface CommentProps {
  id: string;
  author: CommentAuthor;
  content: string;
  isEdited?: boolean;
  isCurrentUser?: boolean;
  onEdit?: (id: string, newContent: string) => void;
  onDelete?: (id: string) => void;
  onReply?: (id: string, content: string) => void;
  replies?: CommentProps[];
  maxLength?: number;
  className?: string;
}

const Comment: React.FC<CommentProps> = ({
  id,
  author,
  content,
  isEdited = false,
  isCurrentUser = false,
  onEdit,
  onDelete,
  onReply,
  replies = [],
  maxLength = 500,
  className = '',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  const handleEdit = () => {
    if (onEdit && editContent.trim() !== content) {
      onEdit(id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleReply = () => {
    if (onReply && replyContent.trim()) {
      onReply(id, replyContent.trim());
      setReplyContent('');
    }
    setIsReplying(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(content);
    setIsReplying(false);
    setReplyContent('');
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex space-x-3">
        <Avatar
          src={author.avatar}
          name={author.name}
          size="medium"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-[var(--color-text)]">
              {author.name}
            </span>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {author.timestamp}
            </span>
            {isEdited && (
              <span className="text-xs text-[var(--color-text-secondary)] italic">
                (edited)
              </span>
            )}
          </div>

          {isEditing ? (
            <div className="mt-2 space-y-2">
              <TextArea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={maxLength}
                rows={3}
              />
              <div className="flex space-x-2">
                <Button
                  size="small"
                  variant="primary"
                  onClick={handleEdit}
                  disabled={!editContent.trim() || editContent === content}
                >
                  Save
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap break-words">
                {content}
              </p>

              <div className="mt-2 flex items-center space-x-3">
                {onReply && (
                  <Button
                    size="small"
                    variant="link"
                    onClick={() => setIsReplying(!isReplying)}
                  >
                    Reply
                  </Button>
                )}

                {isCurrentUser && onEdit && (
                  <Button
                    size="small"
                    variant="link"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </Button>
                )}

                {isCurrentUser && onDelete && (
                  <Button
                    size="small"
                    variant="link"
                    onClick={() => onDelete(id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reply form */}
      {isReplying && (
        <div className="ml-12 space-y-2">
          <TextArea
            placeholder="Write a reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            maxLength={maxLength}
            rows={2}
          />
          <div className="flex space-x-2">
            <Button
              size="small"
              variant="primary"
              onClick={handleReply}
              disabled={!replyContent.trim()}
            >
              Reply
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-12 space-y-4">
          {replies.map((reply) => (
            <Comment
              key={reply.id}
              {...reply}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export { Comment };
