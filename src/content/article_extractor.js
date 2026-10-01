/**
 * article_extractor.js
 * Extracts Title, Head (lead), Tail (conclusion), and Context while cleaning out ads and clutter
 */

window.ArticleExtractor = {
  /**
   * Main entry point to extract structured article data
   */
  extract() {
    const url = window.location.href;
    const domain = window.location.hostname.replace(/^www\./, '');
    const title = this.extractTitle();
    const { head, tail, context } = this.extractContentSegments();
    const meta = this.extractMetadata();

    return {
      title,
      head,
      tail,
      context,
      domain,
      url,
      meta
    };
  },

  /**
   * Extracts the most accurate article title
   */
  extractTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && ogTitle.trim().length > 5) return ogTitle.trim();

    const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    if (twitterTitle && twitterTitle.trim().length > 5) return twitterTitle.trim();

    const h1 = document.querySelector('article h1, main h1, h1');
    if (h1 && h1.innerText.trim().length > 5) return h1.innerText.trim();

    return document.title.replace(/\s*[-|–]\s*.*$/, '').trim() || document.title || 'Untitled Page';
  },

  /**
   * Extracts Head (opening), Tail (conclusion), and Context (condensed body)
   */
  extractContentSegments() {
    // Locate the core container (article, main, or high-density text block)
    const root = document.querySelector('article, [role="main"], main, .post-content, .article-body, .story-body') || document.body;

    // Clone to safely sanitize without affecting DOM
    const clone = root.cloneNode(true);

    // Strip unneeded elements
    const elementsToRemove = clone.querySelectorAll(
      'script, style, noscript, nav, header, footer, aside, iframe, svg, ' +
      '.advertisement, .ad, .ad-slot, .social-share, .comments, .related-articles, ' +
      '.newsletter-signup, .popup, #cookie-banner, [aria-hidden="true"]'
    );
    elementsToRemove.forEach(el => el.remove());

    // Gather all meaningful paragraphs
    const paragraphs = Array.from(clone.querySelectorAll('p'))
      .map(p => p.innerText.trim())
      .filter(text => text.length > 30); // ignore short disclaimers, timestamps, caption fragments

    if (paragraphs.length === 0) {
      // Fallback: extract clean text blocks if no <p> tags
      const rawText = clone.innerText || '';
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 40);
      const head = lines.slice(0, 2).join('\n\n') || document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const tail = lines.slice(-2).join('\n\n') || '';
      const context = lines.slice(0, 20).join('\n\n').substring(0, 5000);
      return { head, tail, context };
    }

    // HEAD: 1-2 introductory paragraphs (plus meta description if helpful)
    const metaDesc = document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute('content');
    let head = paragraphs.slice(0, 2).join('\n\n');
    if (metaDesc && !head.includes(metaDesc)) {
      head = `${metaDesc}\n\n${head}`;
    }

    // TAIL: Final 1-2 concluding paragraphs
    const tail = paragraphs.length > 2 
      ? paragraphs.slice(-2).join('\n\n') 
      : paragraphs[paragraphs.length - 1] || '';

    // CONTEXT: Condensed core body text (limited to ~1,200 words / 6,000 chars to maximize speed and minimize token cost)
    let context = paragraphs.join('\n\n');
    if (context.length > 6000) {
      context = context.substring(0, 6000) + '... [Excerpt condensed for token efficiency]';
    }

    return { head, tail, context };
  },

  /**
   * Extracts author, publish date, and publication info
   */
  extractMetadata() {
    const author = 
      document.querySelector('meta[name="author"]')?.getAttribute('content') ||
      document.querySelector('[rel="author"], .author-name, .byline')?.innerText?.trim() ||
      '';

    const publishDate = 
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      document.querySelector('time')?.getAttribute('datetime') ||
      document.querySelector('time')?.innerText?.trim() ||
      '';

    return { author, publishDate };
  }
};
