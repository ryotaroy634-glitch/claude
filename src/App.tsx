import { useState, useEffect, useCallback } from 'react';
import { Feed, FeedSource } from './types';
import { fetchFeed } from './services/rssService';
import { FeedList } from './components/FeedList';
import { ArticleList } from './components/ArticleList';
import { ArticleView } from './components/ArticleView';
import { AddFeedForm } from './components/AddFeedForm';
import './App.css';

const STORAGE_KEY = 'rss-reader-feeds';

function loadSavedFeeds(): FeedSource[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveFeeds(feeds: FeedSource[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(feeds));
}

export default function App() {
  const [feedSources, setFeedSources] = useState<FeedSource[]>(loadSavedFeeds);
  const [feeds, setFeeds] = useState<Map<string, Feed>>(new Map());
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedArticleGuid, setSelectedArticleGuid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddFeed = async (url: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const feed = await fetchFeed(url);
      const source: FeedSource = {
        id: feed.id,
        url: feed.url,
        title: feed.title,
      };

      setFeedSources((prev) => {
        const updated = [...prev, source];
        saveFeeds(updated);
        return updated;
      });

      setFeeds((prev) => new Map(prev).set(feed.id, feed));
      setSelectedFeedId(feed.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フィードの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFeed = (id: string) => {
    setFeedSources((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      saveFeeds(updated);
      return updated;
    });

    setFeeds((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });

    if (selectedFeedId === id) {
      setSelectedFeedId(null);
      setSelectedArticleGuid(null);
    }
  };

  const handleSelectFeed = useCallback(async (id: string) => {
    setSelectedFeedId(id);
    setSelectedArticleGuid(null);

    if (!feeds.has(id)) {
      const source = feedSources.find((f) => f.id === id);
      if (source) {
        setIsLoading(true);
        setError(null);
        try {
          const feed = await fetchFeed(source.url);
          feed.id = id;
          setFeeds((prev) => new Map(prev).set(id, feed));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'フィードの取得に失敗しました');
        } finally {
          setIsLoading(false);
        }
      }
    }
  }, [feeds, feedSources]);

  const handleSelectArticle = (guid: string) => {
    setSelectedArticleGuid(guid);
  };

  const handleRefreshFeed = async () => {
    if (!selectedFeedId) return;

    const source = feedSources.find((f) => f.id === selectedFeedId);
    if (!source) return;

    setIsLoading(true);
    setError(null);

    try {
      const feed = await fetchFeed(source.url);
      feed.id = selectedFeedId;
      setFeeds((prev) => new Map(prev).set(selectedFeedId, feed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フィードの更新に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (feedSources.length > 0 && !selectedFeedId) {
      handleSelectFeed(feedSources[0].id);
    }
  }, [feedSources, selectedFeedId, handleSelectFeed]);

  const currentFeed = selectedFeedId ? feeds.get(selectedFeedId) : null;
  const articles = currentFeed?.items || [];
  const selectedArticle = articles.find((a) => a.guid === selectedArticleGuid) || null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>RSS Reader</h1>
        <AddFeedForm onAddFeed={handleAddFeed} isLoading={isLoading} />
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <main className="app-main">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>フィード</h2>
          </div>
          <FeedList
            feeds={feedSources}
            selectedFeedId={selectedFeedId}
            onSelectFeed={handleSelectFeed}
            onDeleteFeed={handleDeleteFeed}
          />
        </aside>

        <section className="content">
          <div className="articles-panel">
            <div className="panel-header">
              <h2>{currentFeed?.title || '記事一覧'}</h2>
              {selectedFeedId && (
                <button
                  className="refresh-btn"
                  onClick={handleRefreshFeed}
                  disabled={isLoading}
                >
                  更新
                </button>
              )}
            </div>
            <ArticleList
              articles={articles}
              selectedArticleGuid={selectedArticleGuid}
              onSelectArticle={handleSelectArticle}
            />
          </div>

          <div className="article-panel">
            <ArticleView article={selectedArticle} />
          </div>
        </section>
      </main>
    </div>
  );
}
