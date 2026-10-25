import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ForumApiService } from './forum-api.service';
describe('ForumApiService paging', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HttpClientTestingModule] }));
  it('sends bounded page offsets for posts and comments', () => {
    const api = TestBed.inject(ForumApiService),
      http = TestBed.inject(HttpTestingController);
    api.getPosts(50).subscribe();
    const posts = http.expectOne((r) => r.url === '/api/forum');
    expect(posts.request.params.get('offset')).toBe('50');
    expect(posts.request.params.get('limit')).toBe('50');
    posts.flush([]);
    api.getPost('p', 100).subscribe();
    const comments = http.expectOne((r) => r.url === '/api/forum/p');
    expect(comments.request.params.get('commentOffset')).toBe('100');
    expect(comments.request.params.get('commentLimit')).toBe('50');
    comments.flush({ comments: [] });
    http.verify();
  });
});
