import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserAvatarComponent } from '../../components/user-avatar/user-avatar.component';
import { ProfileApiService } from '../../services/profile-api.service';
import { ToastService } from '../../services/toast.service';
import { AvatarLimits, CommanderBrief, MyProfile } from '../../models/profile.models';
import { prepareAvatar } from '../../utils/avatar-image';
import { describeHttpError } from '../../utils/http-error.utils';

/** Offered as a picker rather than free text, so the profile stat groups cleanly. */
const FORMATS = [
  'Commander',
  'Standard',
  'Modern',
  'Pioneer',
  'Legacy',
  'Vintage',
  'Pauper',
  'Limited',
  'Brawl',
  'Cube',
];

/**
 * The account page: everything about a profile its owner controls, plus the stats nobody
 * else is shown.
 *
 * This is what the navbar's "Profile" item has always pointed at — `/account` was in the
 * menu with no route behind it, so the link did nothing.
 */
@Component({
  selector: 'app-profile-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-edit.component.html',
  styleUrls: ['./profile-edit.component.scss'],
})
export class ProfileEditComponent implements OnInit {
  readonly formats = FORMATS;

  /** Caps mirrored from the DTO's DataAnnotations; the server enforces them regardless. */
  readonly maxes = { displayName: 64, tagline: 120, bio: 2000 };

  me: MyProfile | null = null;
  limits: AvatarLimits | null = null;

  loading = true;
  saving = false;
  uploading = false;
  error: string | null = null;

  // Edit buffer, kept apart from `me` so Cancel is just a re-copy.
  displayName = '';
  tagline = '';
  bio = '';
  favoriteFormat = '';
  favoriteCommanderOracleId: string | null = null;

  constructor(
    private api: ProfileApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();

    // Advisory only — the upload still works if this fails, it just cannot pre-shrink to
    // the exact cap, so fall back to the server's documented maximums.
    this.api.getAvatarLimits().subscribe({
      next: (limits) => {
        this.limits = limits;
        this.cdr.markForCheck();
      },
      error: () => {
        this.limits = {
          maxBytes: 512 * 1024,
          maxDimension: 1024,
          acceptedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        };
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * Loads the profile. Public because the failure state offers a retry.
   *
   * A dead end here is worse than it looks: the dev proxy answers "API is down" with a
   * 500 rather than a connection error, so the page cannot even name the real problem —
   * and without a retry the only way out is a full reload.
   */
  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    this.api.getMyProfile().subscribe({
      next: (me) => {
        this.apply(me);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = describeHttpError(err, 'Could not load your profile.');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Commanders they actually build with — the only ones offered to pin. */
  get commanderChoices(): CommanderBrief[] {
    return this.me?.profile.topCommanders ?? [];
  }

  get dirty(): boolean {
    const p = this.me?.profile;
    if (!p) return false;
    return (
      this.displayName !== (p.displayName ?? '') ||
      this.tagline !== (p.tagline ?? '') ||
      this.bio !== (p.bio ?? '') ||
      this.favoriteFormat !== (p.favoriteFormat ?? '') ||
      this.favoriteCommanderOracleId !== (p.favoriteCommander?.oracleId ?? null)
    );
  }

  save(): void {
    if (!this.me || this.saving) return;

    this.saving = true;
    this.cdr.markForCheck();

    this.api
      .updateMyProfile({
        displayName: this.displayName || null,
        tagline: this.tagline || null,
        bio: this.bio || null,
        favoriteFormat: this.favoriteFormat || null,
        favoriteCommanderOracleId: this.favoriteCommanderOracleId,
      })
      .subscribe({
        next: (me) => {
          this.apply(me);
          this.saving = false;
          this.toast.show('Profile saved', 'success');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.saving = false;
          this.toast.error(describeHttpError(err, 'Could not save your profile.'));
          this.cdr.markForCheck();
        },
      });
  }

  revert(): void {
    if (this.me) this.apply(this.me);
    this.cdr.markForCheck();
  }

  pinCommander(oracleId: string | null): void {
    this.favoriteCommanderOracleId = this.favoriteCommanderOracleId === oracleId ? null : oracleId;
    this.cdr.markForCheck();
  }

  /**
   * Shrinks the chosen photo in the browser, then uploads it.
   *
   * A camera-roll picture is several megabytes and thousands of pixels wide; the server
   * caps at half a megabyte. Sending the original would fail for most real photos, so the
   * resize is not an optimisation here — it is what makes the feature usable on a phone.
   */
  async onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // Clear immediately so choosing the same file twice still fires a change event.
    input.value = '';
    if (!file) return;

    const limits = this.limits ?? { maxBytes: 512 * 1024, maxDimension: 1024 };

    this.uploading = true;
    this.cdr.markForCheck();

    try {
      const prepared = await prepareAvatar(file, limits.maxDimension, limits.maxBytes);
      this.api.uploadAvatar(prepared.blob).subscribe({
        next: (me) => {
          this.apply(me);
          this.uploading = false;
          this.toast.show('Avatar updated', 'success');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.uploading = false;
          this.toast.error(describeHttpError(err, 'Could not upload that image.'));
          this.cdr.markForCheck();
        },
      });
    } catch (err) {
      // prepareAvatar rejects with a message written for the user.
      this.uploading = false;
      this.toast.error(err instanceof Error ? err.message : 'Could not read that image.');
      this.cdr.markForCheck();
    }
  }

  removeAvatar(): void {
    if (!this.me?.profile.avatarUrl || this.uploading) return;

    this.uploading = true;
    this.cdr.markForCheck();

    this.api.deleteAvatar().subscribe({
      next: (me) => {
        this.apply(me);
        this.uploading = false;
        this.toast.show('Avatar removed', 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.uploading = false;
        this.toast.error(describeHttpError(err, 'Could not remove your avatar.'));
        this.cdr.markForCheck();
      },
    });
  }

  formatValue(value: number): string {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  /** Copies a server response into both the view model and the edit buffer. */
  private apply(me: MyProfile): void {
    this.me = me;
    this.displayName = me.profile.displayName ?? '';
    this.tagline = me.profile.tagline ?? '';
    this.bio = me.profile.bio ?? '';
    this.favoriteFormat = me.profile.favoriteFormat ?? '';
    this.favoriteCommanderOracleId = me.profile.favoriteCommander?.oracleId ?? null;
  }
}
