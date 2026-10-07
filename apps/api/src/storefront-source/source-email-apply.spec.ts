import { validateGeneratedSource } from './source-generation.service';
import { applyOrderEmailTemplate } from './source-email-html';

const page = (path: string) => ({ path, content: '<!doctype html><html><body><h1>x</h1></body></html>' });
const shell = [page('index.html'), { path: 'styles.css', content: 'body{margin:0}' }, { path: 'site.js', content: '' }];
const email = {
  path: 'emails/order-confirmation.html',
  content: '<!doctype html><html><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total></p><script>alert(1)</script></body></html>',
};

describe('the generator may author the confirmation email', () => {
  // The shell fixture is deliberately minimal and trips later content checks; what this
  // pins is only whether the PATH is reserved, so both assertions name that message.
  const reserved = /archivo reservado/;

  it('accepts emails/order-confirmation.html as a generated path', () => {
    expect(() => validateGeneratedSource([...shell, email])).not.toThrow(reserved);
  });

  it('still rejects another path under emails/', () => {
    expect(() => validateGeneratedSource([...shell, { path: 'emails/evil.sh', content: 'x' }])).toThrow(reserved);
  });

  it('validates the email on the way in, stripping a script and reporting it', () => {
    const { files, repairs } = applyOrderEmailTemplate([...shell, email]);
    const out = files.find(f => f.path === 'emails/order-confirmation.html')!;
    expect(out.content).not.toContain('<script');
    expect(repairs.join(' ')).toContain('script');
  });

  it('leaves a file list with no email template untouched', () => {
    const { files, repairs } = applyOrderEmailTemplate(shell);
    expect(files).toEqual(shell);
    expect(repairs).toEqual([]);
  });
});
