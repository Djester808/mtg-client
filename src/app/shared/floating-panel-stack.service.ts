import { Injectable } from '@angular/core';

/** Presentation order only; ranks remain bounded by the number of mounted windows. */
@Injectable({ providedIn: 'root' })
export class FloatingPanelStackService {
  private panels: HTMLElement[] = [];
  register(panel: HTMLElement): void {
    if (this.panels.includes(panel)) return;
    this.panels.push(panel);
    this.render();
  }
  raise(panel: HTMLElement): void {
    const index = this.panels.indexOf(panel);
    if (index < 0 || index === this.panels.length - 1) return;
    this.panels.splice(index, 1);
    this.panels.push(panel);
    this.render();
  }
  unregister(panel: HTMLElement): void {
    this.panels = this.panels.filter((item) => item !== panel);
    panel.style.removeProperty('--floating-panel-order');
    this.render();
  }
  private render(): void {
    this.panels.forEach((panel, index) =>
      panel.style.setProperty('--floating-panel-order', String(index)),
    );
  }
}
