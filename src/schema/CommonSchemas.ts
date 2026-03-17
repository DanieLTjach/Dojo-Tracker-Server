import z from "zod";

export const dateSchema = z.iso.datetime("Invalid date format. Only ISO-8601 format is supported.")
    .transform((str) => new Date(str));

export const optionalTextFieldSchema = z.string().trim().min(1, 'Field cannot be empty').nullish();

export const clubIdParamSchema = z.coerce.number().int('Club ID must be an integer');