import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RuleBlockComponent } from './rule-block.component';
import { Rule } from '../../services/rules-api.service';

function makeRule(): Rule {
  return {
    number: '509.1',
    text: 'First, the defending player declares blockers.',
    examples: ['A 2/2 blocks a 3/3.'],
    subrules: [
      {
        number: '509.1a',
        text: 'The creature must be untapped.',
        examples: ['An attacker with menace needs two blockers.'],
        subrules: [],
      },
      { number: '509.1b', text: 'It must be able to block.', examples: [], subrules: [] },
    ],
  };
}

describe('RuleBlockComponent', () => {
  let fixture: ComponentFixture<RuleBlockComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RuleBlockComponent] });
    fixture = TestBed.createComponent(RuleBlockComponent);
    // setInput, not a field poke: the component is OnPush, so assigning to the instance
    // never marks the view dirty and the template would keep rendering the old input.
    fixture.componentRef.setInput('rule', makeRule());
    fixture.detectChanges();
  });

  it('renders the rule, its subrules and its examples', () => {
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('509.1');
    expect(text).toContain('defending player declares blockers');
    expect(text).toContain('509.1a');
    expect(text).toContain('509.1b');
    expect(text).toContain('A 2/2 blocks a 3/3.');
    expect(text).toContain('An attacker with menace needs two blockers.');
  });

  it('labels examples so they read as examples, not as rules text', () => {
    const labels = fixture.nativeElement.querySelectorAll('.rule-example-label');
    expect(labels.length).toBe(2);
  });

  it('marks nothing when no rule is highlighted', () => {
    expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(0);
  });

  it('marks the rule a search hit pointed at', () => {
    fixture.componentRef.setInput('highlight', '509.1');
    fixture.detectChanges();

    const marked = fixture.nativeElement.querySelectorAll('.is-highlighted');
    expect(marked.length).toBe(1);
    expect(marked[0].textContent).toContain('509.1');
  });

  it('marks a subrule, which is what a search hit usually points at', () => {
    fixture.componentRef.setInput('highlight', '509.1a');
    fixture.detectChanges();

    const marked = fixture.nativeElement.querySelectorAll('.is-highlighted');
    expect(marked.length).toBe(1);
    expect(marked[0].textContent).toContain('509.1a');
  });

  it('renders a rule with nothing hanging off it', () => {
    fixture.componentRef.setInput('rule', {
      number: '100.1',
      text: 'These Magic rules apply to any Magic game.',
      examples: [],
      subrules: [],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.subrule').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.rule-example').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('100.1');
  });
});
