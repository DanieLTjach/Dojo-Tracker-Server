import z from 'zod';
import { SUPPORTED_LOCALES } from '../i18n/index.ts';

export const dateSchema = z.iso.datetime('Invalid date format. Only ISO-8601 format is supported.')
    .transform(str => new Date(str));

export const optionalTextFieldSchema = z.string().trim().min(1, 'Field cannot be empty').nullish();

export const boundedTextSchema = (max: number) =>
    z.string().trim().min(1, 'Field cannot be empty').max(max, `Field cannot exceed ${max} characters`).nullish();

export const imageUrlSchema = z.string()
    .trim()
    .min(1, 'URL cannot be empty')
    .max(2048, 'URL must be 2048 characters or less')
    .refine(
        val => {
            try {
                const parsed = new URL(val);
                return parsed.protocol === 'https:' && parsed.hostname.length > 0;
            } catch {
                return false;
            }
        },
        { message: 'URL must be a valid https URL' }
    );

export const discordHandleSchema = z.string()
    .trim()
    .toLowerCase()
    .regex(
        /^[a-z0-9._]{2,32}$/,
        'Discord handle must be 2-32 characters of lowercase letters, numbers, dots, or underscores'
    );

export const tenhouIdSchema = z.string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,16}$/, 'Tenhou ID must be 1-16 alphanumeric characters, underscores, or dashes');

export const gameAccountSchema = z.string()
    .trim()
    .min(1, 'Account name cannot be empty')
    .max(64, 'Account name must be 64 characters or less')
    .refine(
        val => !/[\x00-\x1F\x7F\u0080-\u009F'"`<>]/.test(val),
        { message: 'Account name cannot contain control characters, quotes, or angle brackets' }
    );

export const clubIdParamSchema = z.coerce.number().int('Club ID must be an integer');
export const countrySchema = z.string().trim().regex(/^[A-Z]{2}$/, 'Country must be an ISO alpha-2 code');
export const localeSchema = z.enum(SUPPORTED_LOCALES);
