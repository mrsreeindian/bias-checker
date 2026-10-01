/**
 * forum_detector.js
 * Detects social media and forums (Reddit, X, HN, Discourse) and warns user of unconfirmed source
 */

window.ForumDetector = {
  /**
   * Evaluates if the current page is a forum or social discussion site
   */
  detect() {
    const host = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();

    // 1. Reddit detection
    if (host.includes('reddit.com')) {
      const match = pathname.match(/\/r\/([^/]+)/);
      const subreddit = match ? match[1] : 'reddit';
      const isThread = pathname.includes('/comments/');

      return {
        isForum: true,
        sourceType: 'reddit',
        platformName: 'Reddit',
        subreddit: `r/${subreddit}`,
        isThread,
        warningMessage: `⚠️ Unconfirmed Source: This content is from Reddit (${subreddit ? 'r/' + subreddit : 'community'}), a user-submitted forum. Claims are unverified user opinions or secondhand reports.`
      };
    }

    // 2. Twitter / X
    if (host.includes('twitter.com') || host.includes('x.com')) {
      return {
        isForum: true,
        sourceType: 'twitter',
        platformName: 'X (Twitter)',
        warningMessage: '⚠️ Unconfirmed Social Media Source: X/Twitter posts are personal statements and unvetted claims.'
      };
    }

    // 3. Hacker News
    if (host.includes('news.ycombinator.com')) {
      return {
        isForum: true,
        sourceType: 'hackernews',
        platformName: 'Hacker News',
        warningMessage: '⚠️ Unconfirmed Discussion Source: Hacker News is an open community forum with user-generated comments.'
      };
    }

    // 4. Discourse / phpBB / vBulletin forum signatures
    const isDiscourse = !!document.querySelector('meta[name="generator"][content*="Discourse"]');
    const isVBulletin = !!document.querySelector('meta[name="generator"][content*="vBulletin"]');
    const isPhpBB = !!document.querySelector('meta[name="generator"][content*="phpBB"]');
    const hasForumUrl = pathname.includes('/forum/') || pathname.includes('/threads/') || pathname.includes('/topic/');

    if (isDiscourse || isVBulletin || isPhpBB || hasForumUrl) {
      return {
        isForum: true,
        sourceType: 'forum',
        platformName: 'Discussion Forum',
        warningMessage: '⚠️ Unconfirmed Source: This page is an online discussion forum. Content represents personal user opinions rather than vetted journalism.'
      };
    }

    return {
      isForum: false,
      sourceType: 'news_or_web',
      platformName: 'Web Publisher'
    };
  },

  /**
   * If on a forum, injects a clear non-intrusive warning banner at the top of the page
   */
  injectWarningBannerIfNeeded(detection) {
    if (!detection || !detection.isForum) return;

    // Check if already injected
    if (document.getElementById('factchecker-forum-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'factchecker-forum-banner';
    banner.innerHTML = `
      <div class="fc-banner-content">
        <span class="fc-banner-icon">⚠️</span>
        <div class="fc-banner-text">
          <strong>Unconfirmed Source Notice:</strong> ${detection.warningMessage}
        </div>
        <button id="fc-banner-check-btn" class="fc-banner-btn">Fact-Check Thread</button>
        <button id="fc-banner-close-btn" class="fc-banner-close" title="Dismiss">&times;</button>
      </div>
    `;

    document.body.prepend(banner);

    // Event listeners
    document.getElementById('fc-banner-close-btn')?.addEventListener('click', () => {
      banner.style.display = 'none';
    });

    document.getElementById('fc-banner-check-btn')?.addEventListener('click', () => {
      if (window.FactCheckerOverlay) {
        window.FactCheckerOverlay.triggerFactCheck();
      }
    });
  }
};
