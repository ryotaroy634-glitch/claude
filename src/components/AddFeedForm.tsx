import { useState } from 'react';

interface AddFeedFormProps {
  onAddFeed: (url: string) => void;
  isLoading: boolean;
}

export function AddFeedForm({ onAddFeed, isLoading }: AddFeedFormProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAddFeed(url.trim());
      setUrl('');
    }
  };

  return (
    <form className="add-feed-form" onSubmit={handleSubmit}>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="RSSフィードのURLを入力..."
        required
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading || !url.trim()}>
        {isLoading ? '読み込み中...' : '追加'}
      </button>
    </form>
  );
}
