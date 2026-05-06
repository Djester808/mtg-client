import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ForumPostSummary, ForumPostDetail, ForumComment } from '../models/forum.models';

@Injectable({ providedIn: 'root' })
export class ForumApiService {
  private readonly base = '/api/forum';

  constructor(private http: HttpClient) {}

  getPosts(): Observable<ForumPostSummary[]> {
    return this.http.get<ForumPostSummary[]>(this.base);
  }

  getPost(id: string): Observable<ForumPostDetail> {
    return this.http.get<ForumPostDetail>(`${this.base}/${id}`);
  }

  publishDeck(deckId: string, description: string | null): Observable<ForumPostSummary> {
    return this.http.post<ForumPostSummary>(this.base, { deckId, description });
  }

  deletePost(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addComment(postId: string, content: string): Observable<ForumComment> {
    return this.http.post<ForumComment>(`${this.base}/${postId}/comments`, { content });
  }

  updateComment(postId: string, commentId: string, content: string): Observable<ForumComment> {
    return this.http.put<ForumComment>(`${this.base}/${postId}/comments/${commentId}`, { content });
  }

  deleteComment(postId: string, commentId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${postId}/comments/${commentId}`);
  }
}
