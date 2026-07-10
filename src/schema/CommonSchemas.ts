import z from 'zod';
import { SUPPORTED_LOCALES } from '../i18n/index.ts';

export const dateSchema = z.iso.datetime('Invalid date format. Only ISO-8601 format is supported.')
    .transform(str => new Date(str));

export const optionalTextFieldSchema = z.string().trim().min(1, 'Field cannot be empty').nullish();

export const clubIdParamSchema = z.coerce.number().int('Club ID must be an integer');
export const countrySchema = z.string().trim().regex(/^[A-Z]{2}$/, 'Country must be an ISO alpha-2 code');
export const localeSchema = z.enum(SUPPORTED_LOCALES);
