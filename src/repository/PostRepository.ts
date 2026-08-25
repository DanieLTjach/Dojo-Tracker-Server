import { dbManager } from '../db/dbInit.ts';
import type { CreatePostDTO, Post, PostGameTag } from '../model/PostModels.ts';

interface PostDBRow {
    id: number;
    authorId: number;
    authorName: string;
    authorAvatarUrl: string | null;
    clubId: number | null;
    gameId: number | null;
    text: string | null;
    createdAt: string;
    likeCount: number;
    likedByMe: number;
    gamePlayedAt: string | null;
    gameScore: number | null;
    gameClubName: string | null;
}

export class PostRepository {
    createPost(authorId: number, dto: CreatePostDTO): number {
        const now = new Date().toISOString();
        const stmt = dbManager.db.prepare(`
            INSERT INTO post (authorId, clubId, gameId, text, createdAt)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(authorId, dto.clubId ?? null, dto.gameId ?? null, dto.text ?? null, now);
        const postId = Number(result.lastInsertRowid);

        if (dto.images && dto.images.length > 0) {
            const imgStmt = dbManager.db.prepare(`
                INSERT INTO post_image (postId, url, width, height, sortOrder)
                VALUES (?, ?, ?, ?, ?)
            `);
            for (let i = 0; i < dto.images.length; i++) {
                const img = dto.images[i]!;
                imgStmt.run(postId, img.url, img.width ?? null, img.height ?? null, i);
            }
        }

        return postId;
    }

    findPostById(id: number, currentUserId?: number): Post | null {
        const row = dbManager.db.prepare(`
            SELECT 
                p.id,
                p.authorId,
                u.name as authorName,
                prof.avatarUrl as authorAvatarUrl,
                p.clubId,
                p.gameId,
                p.text,
                p.createdAt,
                (SELECT COUNT(*) FROM post_like WHERE postId = p.id) as likeCount,
                EXISTS(SELECT 1 FROM post_like WHERE postId = p.id AND userId = ?) as likedByMe,
                g.createdAt as gamePlayedAt,
                utg.points as gameScore,
                c.name as gameClubName
            FROM post p
            JOIN user u ON p.authorId = u.id
            LEFT JOIN profile prof ON u.id = prof.userId
            LEFT JOIN game g ON p.gameId = g.id
            LEFT JOIN event e ON g.eventId = e.id
            LEFT JOIN club c ON e.clubId = c.id
            LEFT JOIN userToGame utg ON p.gameId = utg.gameId AND p.authorId = utg.userId
            WHERE p.id = ?
        `).get(currentUserId ?? -1, id) as PostDBRow | undefined;

        if (!row) return null;
        return this.mapPostRowToPost(row);
    }

    findPostsByAuthorId(authorId: number, currentUserId?: number): Post[] {
        const rows = dbManager.db.prepare(`
            SELECT 
                p.id,
                p.authorId,
                u.name as authorName,
                prof.avatarUrl as authorAvatarUrl,
                p.clubId,
                p.gameId,
                p.text,
                p.createdAt,
                (SELECT COUNT(*) FROM post_like WHERE postId = p.id) as likeCount,
                EXISTS(SELECT 1 FROM post_like WHERE postId = p.id AND userId = ?) as likedByMe,
                g.createdAt as gamePlayedAt,
                utg.points as gameScore,
                c.name as gameClubName
            FROM post p
            JOIN user u ON p.authorId = u.id
            LEFT JOIN profile prof ON u.id = prof.userId
            LEFT JOIN game g ON p.gameId = g.id
            LEFT JOIN event e ON g.eventId = e.id
            LEFT JOIN club c ON e.clubId = c.id
            LEFT JOIN userToGame utg ON p.gameId = utg.gameId AND p.authorId = utg.userId
            WHERE p.authorId = ?
            ORDER BY p.createdAt DESC, p.id DESC
        `).all(currentUserId ?? -1, authorId) as PostDBRow[];

        return this.mapPostRowsToPosts(rows);
    }

    findPostsByClubId(clubId: number, currentUserId?: number): Post[] {
        const rows = dbManager.db.prepare(`
            SELECT 
                p.id,
                p.authorId,
                u.name as authorName,
                prof.avatarUrl as authorAvatarUrl,
                p.clubId,
                p.gameId,
                p.text,
                p.createdAt,
                (SELECT COUNT(*) FROM post_like WHERE postId = p.id) as likeCount,
                EXISTS(SELECT 1 FROM post_like WHERE postId = p.id AND userId = ?) as likedByMe,
                g.createdAt as gamePlayedAt,
                utg.points as gameScore,
                c.name as gameClubName
            FROM post p
            JOIN user u ON p.authorId = u.id
            LEFT JOIN profile prof ON u.id = prof.userId
            LEFT JOIN game g ON p.gameId = g.id
            LEFT JOIN event e ON g.eventId = e.id
            LEFT JOIN club c ON e.clubId = c.id
            LEFT JOIN userToGame utg ON p.gameId = utg.gameId AND p.authorId = utg.userId
            WHERE p.clubId = ?
            ORDER BY p.createdAt DESC, p.id DESC
        `).all(currentUserId ?? -1, clubId) as PostDBRow[];

        return this.mapPostRowsToPosts(rows);
    }

    deletePost(id: number): void {
        dbManager.db.prepare(`DELETE FROM post WHERE id = ?`).run(id);
    }

    addLike(postId: number, userId: number): void {
        const now = new Date().toISOString();
        dbManager.db.prepare(`
            INSERT OR IGNORE INTO post_like (postId, userId, createdAt)
            VALUES (?, ?, ?)
        `).run(postId, userId, now);
    }

    removeLike(postId: number, userId: number): void {
        dbManager.db.prepare(`
            DELETE FROM post_like WHERE postId = ? AND userId = ?
        `).run(postId, userId);
    }

    private mapPostRowToPost(row: PostDBRow): Post {
        const images = dbManager.db.prepare(`
            SELECT id, url, width, height FROM post_image WHERE postId = ? ORDER BY sortOrder ASC, id ASC
        `).all(row.id) as { id: number, url: string, width: number | null, height: number | null }[];

        let game: PostGameTag | null = null;
        if (row.gameId && row.gamePlayedAt) {
            game = {
                id: row.gameId,
                playedAt: row.gamePlayedAt,
                score: row.gameScore ?? undefined,
                clubName: row.gameClubName ?? undefined,
            };
        }

        return {
            id: row.id,
            authorId: row.authorId,
            author: {
                id: row.authorId,
                name: row.authorName,
                avatarUrl: row.authorAvatarUrl,
            },
            clubId: row.clubId,
            gameId: row.gameId,
            game,
            text: row.text,
            images,
            likeCount: row.likeCount,
            commentCount: 0,
            likedByMe: Boolean(row.likedByMe),
            createdAt: row.createdAt,
        };
    }

    private mapPostRowsToPosts(rows: PostDBRow[]): Post[] {
        if (rows.length === 0) return [];
        const postIds = rows.map(r => r.id);
        const images = dbManager.db.prepare(`
            SELECT id, postId, url, width, height FROM post_image
            WHERE postId IN (${postIds.map(() => '?').join(',')})
            ORDER BY sortOrder ASC, id ASC
        `).all(...postIds) as {
            id: number;
            postId: number;
            url: string;
            width: number | null;
            height: number | null;
        }[];

        const imagesByPostId = new Map<
            number,
            { id: number, url: string, width: number | null, height: number | null }[]
        >();
        for (const img of images) {
            let list = imagesByPostId.get(img.postId);
            if (!list) {
                list = [];
                imagesByPostId.set(img.postId, list);
            }
            list.push({ id: img.id, url: img.url, width: img.width, height: img.height });
        }

        return rows.map(row => {
            let game: PostGameTag | null = null;
            if (row.gameId && row.gamePlayedAt) {
                game = {
                    id: row.gameId,
                    playedAt: row.gamePlayedAt,
                    score: row.gameScore ?? undefined,
                    clubName: row.gameClubName ?? undefined,
                };
            }

            return {
                id: row.id,
                authorId: row.authorId,
                author: {
                    id: row.authorId,
                    name: row.authorName,
                    avatarUrl: row.authorAvatarUrl,
                },
                clubId: row.clubId,
                gameId: row.gameId,
                game,
                text: row.text,
                images: imagesByPostId.get(row.id) || [],
                likeCount: row.likeCount,
                commentCount: 0,
                likedByMe: Boolean(row.likedByMe),
                createdAt: row.createdAt,
            };
        });
    }
}
