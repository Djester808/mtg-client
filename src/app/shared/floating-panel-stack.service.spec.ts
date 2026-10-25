import { FloatingPanelStackService } from './floating-panel-stack.service';

describe('FloatingPanelStackService', () => {
  it('retains activation order after blur and preserves the other windows relative order', () => {
    const stack = new FloatingPanelStackService();
    const panels = Array.from({ length: 4 }, () => document.createElement('details'));
    const ranks = () =>
      panels.map((panel) => panel.style.getPropertyValue('--floating-panel-order'));
    panels.forEach((panel) => stack.register(panel));
    expect(ranks()).toEqual(['0', '1', '2', '3']);
    stack.raise(panels[1]);
    panels[1].dispatchEvent(new FocusEvent('focusout'));
    expect(ranks()).toEqual(['0', '3', '1', '2']);
    stack.raise(panels[0]);
    expect(ranks()).toEqual(['3', '2', '0', '1']);
    for (let n = 0; n < 100; n++) stack.raise(panels[0]);
    stack.register(panels[0]);
    stack.raise(document.createElement('details'));
    expect(ranks()).toEqual(['3', '2', '0', '1']);
    stack.unregister(panels[2]);
    expect(ranks()).toEqual(['2', '1', '', '0']);
    panels.forEach((panel) => stack.unregister(panel));
    expect(ranks()).toEqual(['', '', '', '']);
  });
});
