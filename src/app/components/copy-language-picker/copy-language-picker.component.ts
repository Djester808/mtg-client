import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
const LANGUAGES = [
  ['en', 'English'],
  ['ja', 'Japanese'],
  ['de', 'German'],
  ['fr', 'French'],
  ['it', 'Italian'],
  ['es', 'Spanish'],
  ['pt', 'Portuguese'],
  ['ko', 'Korean'],
  ['ru', 'Russian'],
  ['zhs', 'Simplified Chinese'],
  ['zht', 'Traditional Chinese'],
  ['he', 'Hebrew'],
  ['la', 'Latin'],
  ['grc', 'Ancient Greek'],
  ['ar', 'Arabic'],
  ['sa', 'Sanskrit'],
  ['ph', 'Phyrexian'],
];
const KNOWN_LANGUAGES = new Set(LANGUAGES.map((language) => language[0]));
@Component({
  selector: 'app-copy-language-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template:
    '<label class="copy-language">Card language<select [ngModel]="value" (ngModelChange)="valueChange.emit($event)"><option *ngFor="let language of languages" [value]="language[0]">{{language[1]}}</option><option *ngIf="!known" [value]="value">{{value}}</option></select></label><span class="copy-language-counts" *ngIf="normalCount != null">{{normalCount}} normal · {{foilCount ?? 0}} foil<span *ngIf="etchedCount"> · {{etchedCount}} etched</span> in this language</span>',
  styleUrls: ['./copy-language-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyLanguagePickerComponent {
  @Input() value = 'en';
  @Input() normalCount?: number;
  @Input() foilCount?: number;
  @Input() etchedCount?: number;
  @Output() valueChange = new EventEmitter<string>();
  readonly languages = LANGUAGES;
  get known(): boolean {
    return KNOWN_LANGUAGES.has(this.value);
  }
}
