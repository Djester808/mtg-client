import { TestBed } from '@angular/core/testing';
import { CopyLanguagePickerComponent } from './copy-language-picker.component';
describe('Card language picker', () => {
  it('shows zero copy counts, emits a new context and preserves unfamiliar stored language codes', async () => {
    TestBed.configureTestingModule({ imports: [CopyLanguagePickerComponent] });
    const f = TestBed.createComponent(CopyLanguagePickerComponent);
    f.componentRef.setInput('normalCount', 0);
    f.componentRef.setInput('foilCount', 2);
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('0 normal');
    const changed = spyOn(f.componentInstance.valueChange, 'emit');
    const select = f.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'ja';
    select.dispatchEvent(new Event('change'));
    expect(changed).toHaveBeenCalledWith('ja');
    f.componentRef.setInput('value', 'custom');
    f.detectChanges();
    expect(f.componentInstance.known).toBeFalse();
    expect(f.nativeElement.querySelector('option[value=custom]')).not.toBeNull();
    f.destroy();
  });
});
