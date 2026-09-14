/**
 * Storage download URLs look like
 * `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded path>?alt=media&token=...`,
 * so the object path is the URL-decoded segment between `/o/` and the query.
 *
 * Kept separate from the cleanup script so it can be tested without pulling in
 * the Firebase Admin SDK.
 */
export function extractObjectPath(url: string): string | null {
    const marker = '/o/';
    const start = url.indexOf(marker);
    if (start === -1 || !url.includes('firebasestorage')) {
        return null;
    }

    const encoded = url.slice(start + marker.length).split('?')[0];
    if (!encoded) {
        return null;
    }

    try {
        return decodeURIComponent(encoded);
    } catch {
        // A malformed percent-encoding is not a path we can act on. Returning
        // null keeps it out of the referenced set, which is the safe direction:
        // an object we cannot name is simply never considered for deletion.
        return null;
    }
}
