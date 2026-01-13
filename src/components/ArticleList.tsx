import { FeedItem } from '../types';

interface ArticleListProps {
  articles: FeedItem[];
  selectedArticleGuid: string | null;
  onSelectArticle: (guid: string) => void;
}

export function ArticleList({ articles, selectedArticleGuid, onSelectArticle }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="article-list-empty">
        <p>記事がありません</p>
      </div>
    );
  }

  return (
    <ul className="article-list">
      {articles.map((article) => (
        <li
          key={article.guid}
          className={`article-item ${selectedArticleGuid === article.guid ? 'selected' : ''}`}
          onClick={() => onSelectArticle(article.guid)}
        >
          <h3 className="article-title">{article.title}</h3>
          <p className="article-date">{formatDate(article.pubDate)}</p>
          <p className="article-snippet">{article.contentSnippet}...</p>
        </li>
      ))}
    </ul>
  );
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}
