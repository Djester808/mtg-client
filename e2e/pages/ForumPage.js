const { By } = require('selenium-webdriver');
const BasePage = require('./BasePage');

class ForumPage extends BasePage {
  constructor(driver) {
    super(driver);

    // ---- List page ----
    this.forumTitle   = By.css('.forum-title');
    this.postCards    = By.css('.post-card');
    this.publishLink  = By.css('.publish-btn');  // "Publish a Deck" link in forum list header

    // ---- Detail page ----
    this.headerTitle    = By.css('.header-title');
    this.headerByline   = By.css('.header-byline');
    this.backBtn        = By.css('.back-btn');
    this.cardGroups     = By.css('.card-group');
    this.cardRows       = By.css('.forum-detail .card-row');
    this.boardTabs      = By.css('.board-tab');
    this.commentsBlock  = By.css('.comments-block');
    this.commentsList   = By.css('.comments-list .comment');
    this.commentTextarea = By.css('.comment-form .comment-textarea');
    this.commentSubmit  = By.css('.comment-form .comment-submit-btn');
    this.deletePostBtn  = By.css('.delete-post-btn');

    // ---- Deck detail publish UI ----
    this.deckPublishBtn    = By.css('.publish-btn');
    this.publishModal      = By.css('.publish-modal-backdrop');
    this.publishTextarea   = By.css('.publish-modal-textarea');
    this.publishSubmitBtn  = By.css('.publish-modal-submit');
    this.publishCancelBtn  = By.css('.publish-modal-cancel');
  }

  async navigateToList() {
    await this.navigate('/forum');
  }

  async navigateToPost(postId) {
    await this.navigate(`/forum/${postId}`);
  }

  // ---- List helpers ----

  async getPostCards() {
    return this.driver.findElements(this.postCards);
  }

  async getPostCardCount() {
    const cards = await this.getPostCards();
    return cards.length;
  }

  /** Returns the text content of each post card's deck name element. */
  async getPostCardNames() {
    const cards = await this.getPostCards();
    return Promise.all(cards.map(c => c.findElement(By.css('.post-deck-name')).getText()));
  }

  // ---- Detail helpers ----

  async getHeaderTitle() {
    return this.getText(this.headerTitle);
  }

  async getCardGroupCount() {
    const groups = await this.driver.findElements(this.cardGroups);
    return groups.length;
  }

  async getCardRowCount() {
    try {
      const rows = await this.driver.findElements(By.css('.card-group .card-row'));
      return rows.length;
    } catch { return 0; }
  }

  async getCommentCount() {
    try {
      const items = await this.driver.findElements(this.commentsList);
      return items.length;
    } catch { return 0; }
  }

  async getCommentTexts() {
    const items = await this.driver.findElements(this.commentsList);
    return Promise.all(items.map(c => c.findElement(By.css('.comment-body')).getText()));
  }

  async addComment(text) {
    const area = await this.waitForElement(this.commentTextarea, 5000);
    await this.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', area);
    await this.driver.sleep(300);
    await this.driver.executeScript(`
      const el = arguments[0];
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `, area);
    await area.sendKeys(text);
    await this.driver.executeScript(`
      const el = arguments[0];
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `, area);
    await this.driver.sleep(200);
    const submitBtn = await this.waitForElement(this.commentSubmit, 3000);
    await this.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', submitBtn);
    await this.driver.executeScript('arguments[0].click()', submitBtn);
    await this.driver.sleep(800);
  }

  /** Click edit on the Nth comment (0-indexed). */
  async clickEditComment(index) {
    const comments = await this.driver.findElements(this.commentsList);
    const btn = await comments[index].findElement(By.css('.comment-action-btn:not(.danger)'));
    await this.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', btn);
    await this.driver.executeScript('arguments[0].click()', btn);
    await this.driver.sleep(300);
  }

  /** Submit the inline edit form for the currently-editing comment. */
  async submitEditComment(newText) {
    const area = await this.waitForElement(By.css('.comment-edit .comment-textarea'), 3000);
    await this.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', area);
    await this.driver.sleep(200);
    await this.driver.executeScript(`
      const el = arguments[0]; el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `, area);
    await area.sendKeys(newText);
    await this.driver.executeScript(`
      arguments[0].dispatchEvent(new Event('input', { bubbles: true }));
    `, area);
    await this.driver.sleep(200);
    const saveBtn = await this.waitForElement(By.css('.comment-edit .comment-submit-btn'), 3000);
    await this.driver.executeScript('arguments[0].click()', saveBtn);
    await this.driver.sleep(800);
  }

  /** Click delete on the Nth comment (0-indexed). Overrides window.confirm to auto-accept. */
  async deleteComment(index) {
    const comments = await this.driver.findElements(this.commentsList);
    const btn = await comments[index].findElement(By.css('.comment-action-btn.danger'));
    await this.driver.executeScript('arguments[0].scrollIntoView({block:"center"})', btn);
    await this.driver.executeScript('arguments[0].click()', btn);
    await this.driver.sleep(800);
  }

  /** Delete the forum post itself. Overrides window.confirm to auto-accept. */
  async deletePost() {
    await this.driver.executeScript('window.confirm = () => true');
    await this.click(this.deletePostBtn);
    await this.waitForUrlToContain('/forum', 5000);
    await this.driver.wait(async () => {
      const url = await this.driver.getCurrentUrl();
      return /\/forum\/?$/.test(url);
    }, 5000, 'Expected to land on /forum list after delete');
  }
}

module.exports = ForumPage;
