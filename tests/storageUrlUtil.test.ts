import { extractObjectPath } from '../src/util/StorageUrlUtil.ts';

describe('extractObjectPath', () => {
    const bucket = 'https://firebasestorage.googleapis.com/v0/b/mahjong-tma-1.firebasestorage.app/o/';

    it('decodes the object path out of a download URL', () => {
        const url = `${bucket}development%2Favatars%2Fuid123%2Fabc.webp?alt=media&token=xyz`;
        expect(extractObjectPath(url)).toBe('development/avatars/uid123/abc.webp');
    });

    it('handles a post image path', () => {
        const url = `${bucket}production%2Fposts%2Fuid%2Fimg.webp?alt=media`;
        expect(extractObjectPath(url)).toBe('production/posts/uid/img.webp');
    });

    it('works without a query string', () => {
        expect(extractObjectPath(`${bucket}staging%2Fposts%2Fu%2Fa.webp`)).toBe('staging/posts/u/a.webp');
    });

    // A third-party URL must yield no path: treating one as a path could match
    // nothing and is harmless, but reading it as referenced-nothing must never
    // make a real object look unreferenced.
    it('ignores a non-Storage URL', () => {
        expect(extractObjectPath('https://example.com/o/some/image.png')).toBeNull();
        expect(extractObjectPath('https://cdn.example.com/avatar.jpg')).toBeNull();
    });

    it('ignores malformed input', () => {
        expect(extractObjectPath('')).toBeNull();
        expect(extractObjectPath('not a url')).toBeNull();
        expect(extractObjectPath(`${bucket}`)).toBeNull();
    });

    it('returns null rather than throwing on a bad percent-encoding', () => {
        expect(extractObjectPath(`${bucket}%E0%A4%A?alt=media`)).toBeNull();
    });
});
