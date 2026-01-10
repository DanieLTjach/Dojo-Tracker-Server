import z from 'zod';

export const dateSchema = z.iso
    .datetime('Invalid date format. Only ISO-8601 format is supported.')
    .transform(str => new Date(str));
