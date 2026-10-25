import { AccountNavComponent } from '../components/account-nav/account-nav.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BreakpointsService } from '../shared/breakpoints.service';
import { STARTUP_DESTINATIONS, UiPreferencesService } from '../services/ui-preferences.service';

import {
  LibraryShortcutAction,
  LibraryShortcutBindingPolicy,
} from '../game/choices/library-shortcut-bindings';

interface Setting {
  id: string;
  category: string;
  title: string;
  description: string;
  keywords: string;
}
const SETTINGS: Setting[] = [
  {
    id: 'library-layout',
    category: 'Play',
    title: 'Library window layout',
    description: 'Save or restore the size and position of your library inspection window.',
    keywords: 'library layout import export window geometry',
  },
  {
    id: 'library-shortcuts',
    category: 'Play',
    title: 'Opening-hand shortcuts',
    description:
      'Choose Keep and Mulligan keys for this browser. Focus a field and press a key combination. Tab moves between controls.',
    keywords: 'library keyboard bindings mulligan keep reset',
  },
  {
    id: 'account',
    category: 'Account',
    title: 'Account & security',
    description: 'Email, password, verification and signed-in devices.',
    keywords: 'sign login profile recovery delete',
  },
  {
    id: 'text',
    category: 'Accessibility',
    title: 'Text size',
    description: 'Scale text from 85% to 160%.',
    keywords: 'font larger smaller reading zoom',
  },
  {
    id: 'contrast',
    category: 'Accessibility',
    title: 'High contrast',
    description: 'Brighter text and stronger borders.',
    keywords: 'vision visibility colors colours',
  },
  {
    id: 'motion',
    category: 'Accessibility',
    title: 'Reduce motion',
    description: 'Stop decorative animation and card movement. Keep short fades.',
    keywords: 'drag drop animations movement effects',
  },
  {
    id: 'reset',
    category: 'Accessibility',
    title: 'Reset accessibility',
    description: 'Restore standard text, contrast and motion. You can undo this.',
    keywords: 'defaults restore',
  },
  {
    id: 'startup',
    category: 'Navigation',
    title: 'Open on',
    description: 'Choose the screen shown the next time you launch Compleat.',
    keywords: 'launch home start destination',
  },
  {
    id: 'navigation',
    category: 'Navigation',
    title: 'Desktop navigation',
    description: 'Choose a top bar, compact sidebar or expanded sidebar. Phones keep the menu.',
    keywords: 'rail labels collapse expand',
  },
  {
    id: 'about',
    category: 'About',
    title: 'About Compleat',
    description: 'Your Magic collection, decks, community and play.',
    keywords: 'version card data scryfall credits',
  },
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [AccountNavComponent, CommonModule, FormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly preferences = inject(UiPreferencesService);
  readonly breakpoints = inject(BreakpointsService);
  readonly layoutStatus = signal('');
  readonly layoutBusy = signal(false);
  exportLayout(): void {
    const url = URL.createObjectURL(
      new Blob([this.preferences.exportLibraryLayout()], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'library-layout.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async importLayout(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file || this.layoutBusy()) return;
    this.layoutBusy.set(true);
    this.layoutStatus.set('Reading layout…');
    try {
      const accepted =
        file.size <= 65536 && this.preferences.importLibraryLayout(await file.text());
      this.layoutStatus.set(
        accepted
          ? this.preferences.saved()
            ? 'Library layout restored. It applies when you next open an inspection.'
            : 'Layout restored for this session, but browser storage is unavailable.'
          : 'Invalid library layout. Your settings were not changed.',
      );
    } catch {
      this.layoutStatus.set('Could not read the layout file. Your settings were not changed.');
    } finally {
      input.value = '';
      this.layoutBusy.set(false);
    }
  }
  readonly shortcutError = signal('');
  readonly shortcutActions: { id: LibraryShortcutAction; label: string }[] = [
    { id: 'mulligan', label: 'Mulligan' },
    { id: 'keep', label: 'Keep' },
  ];
  captureShortcut(action: LibraryShortcutAction, event: KeyboardEvent): void {
    const key = LibraryShortcutBindingPolicy.capture(event);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    this.shortcutError.set(
      this.preferences.setLibraryShortcut(action, key)
        ? ''
        : 'That combination is already assigned to the other opening-hand action.',
    );
  }
  clearShortcut(action: LibraryShortcutAction): void {
    this.preferences.setLibraryShortcut(action, null);
    this.shortcutError.set('');
  }
  resetShortcuts(): void {
    this.preferences.resetLibraryShortcuts();
    this.shortcutError.set('');
  }
  readonly query = signal('');
  readonly category = signal<string | null>(null);
  readonly categories = ['Account', 'Accessibility', 'Navigation', 'Play', 'About'];
  readonly destinations = STARTUP_DESTINATIONS;
  readonly showCategories = computed(
    () => !this.query().trim() && (!this.breakpoints.isPhone() || !this.category()),
  );
  readonly visible = computed(() => {
    const words = this.query().toLowerCase().trim().split(/\s+/).filter(Boolean);
    const category = this.category() ?? (this.breakpoints.isPhone() ? '' : 'Accessibility');
    return SETTINGS.filter((setting) =>
      words.length
        ? words.every((word) =>
            (
              setting.title +
              ' ' +
              setting.description +
              ' ' +
              setting.keywords +
              ' ' +
              setting.category
            )
              .toLowerCase()
              .includes(word),
          )
        : setting.category === category,
    );
  });
  readonly heading = computed(() =>
    this.query().trim()
      ? 'Search results'
      : (this.category() ?? (this.breakpoints.isPhone() ? 'Settings' : 'Accessibility')),
  );
  trackSetting(_index: number, setting: Setting) {
    return setting.id;
  }
  setNavigation(value: string) {
    if (value === 'top' || value === 'compact' || value === 'expanded')
      this.preferences.update({ navigation: value });
  }
}
