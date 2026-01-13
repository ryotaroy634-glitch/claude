import { FeedItem } from '../types';

interface ArticleViewProps {
  article: FeedItem | null;
}

export function ArticleView({ article }: ArticleViewProps) {
  if (!article) {
    return (
      <div className="article-view-empty">
        <p>記事を選択してください</p>
      </div>
    );
  }

  return (
    <article className="article-view">
      <header>
        <h1>{article.title}</h1>
        <p className="article-meta">
          {formatDate(article.pubDate)}
          {article.link && (
            <>
              {' | '}
              <a href={article.link} target="_blank" rel="noopener noreferrer">
                元の記事を見る
              </a>
            </>
          )}
        </p>
      </header>
      <div
        className="article-content"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </article>
  );
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}
