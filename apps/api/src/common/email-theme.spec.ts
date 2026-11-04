jest.mock('node:fs', () => {
  const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    readFileSync: jest.fn(actual.readFileSync),
  };
});
import * as fs from 'node:fs';
import { readEmailTheme } from './email-theme';

describe('Shared email palette', () => {
  beforeEach(() => {
    const actual = jest.requireActual<typeof import('node:fs')>('node:fs');
    jest
      .mocked(fs.existsSync)
      .mockReset()
      .mockImplementation(actual.existsSync);
    jest
      .mocked(fs.readFileSync)
      .mockReset()
      .mockImplementation(actual.readFileSync);
  });
  it('reads the same semantic colors defined by the web application', () => {
    const theme = readEmailTheme();
    expect(theme).toEqual({
      'primary-color': '#8a2be2',
      'accent-color': '#ffd700',
      'page-background': '#020617',
      'surface-background': '#0f172a',
      'content-background': '#f8f9fa',
    });
  });
  it('uses the packaged stylesheet when running the compiled API', () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    const read = jest
      .mocked(fs.readFileSync)
      .mockReturnValue(
        '--primary-color: #112233; --accent-color: #223344; --page-background: #334455; --surface-background: #445566; --content-background: #556677;',
      );
    expect(readEmailTheme()['primary-color']).toBe('#112233');
    expect(read).toHaveBeenCalledWith(
      expect.stringContaining('email-theme'),
      'utf8',
    );
  });
  it('fails explicitly if a required color is missing rather than inventing a second palette', () => {
    jest.mocked(fs.readFileSync).mockReturnValue(':root {}');
    expect(() => readEmailTheme()).toThrow(
      'Missing email theme token: primary-color',
    );
  });
  it('preserves a missing stylesheet error for the sender to handle', () => {
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('missing asset');
    });
    expect(() => readEmailTheme()).toThrow('missing asset');
  });
});
