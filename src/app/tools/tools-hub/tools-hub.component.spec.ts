import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToolsHubComponent } from './tools-hub.component';

describe('ToolsHubComponent', () => {
  let fixture: ComponentFixture<ToolsHubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolsHubComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolsHubComponent);
    fixture.detectChanges();
  });

  it('links to the life counter', () => {
    const link = fixture.nativeElement.querySelector('.tool-card') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/tools/life-counter');
    expect(link.textContent).toContain('Life counter');
  });

  it('says which tools need no account, since the hub itself is not guarded', () => {
    expect(fixture.nativeElement.querySelector('.tool-tag').textContent).toContain(
      'No account needed',
    );
  });
});
