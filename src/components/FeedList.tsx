import { FeedSource } from '../types';

interface FeedListProps {
  feeds: FeedSource[];
  selectedFeedId: string | null;
  onSelectFeed: (id: string) => void;
  onDeleteFeed: (id: string) => void;
}

export function FeedList({ feeds, selectedFeedId, onSelectFeed, onDeleteFeed }: FeedListProps) {
  if (feeds.length === 0) {
    return (
      <div className="feed-list-empty">
        <p>フィードが登録されていません</p>
        <p>上のフォームからRSSフィードを追加してください</p>
      </div>
    );
  }

  return (
    <ul className="feed-list">
      {feeds.map((feed) => (
        <li
          key={feed.id}
          className={`feed-item ${selectedFeedId === feed.id ? 'selected' : ''}`}
          onClick={() => onSelectFeed(feed.id)}
        >
          <span className="feed-title">{feed.title}</span>
          <button
            className="delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFeed(feed.id);
            }}
            aria-label="フィードを削除"
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}
