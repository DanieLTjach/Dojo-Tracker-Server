import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ImportService } from '../service/ImportService.ts';
import { gameImportSchema } from '../schema/ImportSchemas.ts';
import { CsvParsingError } from '../error/ImportErrors.ts';

export class ImportController {

    private importService: ImportService = new ImportService();

    importGames(req: Request, res: Response) {
        const { body: { eventId } } = gameImportSchema.parse(req);
        const importedBy = req.user!.userId;

        const file = req.file;
        if (!file) {
            throw new CsvParsingError('CSV file is required');
        }

        const csvContent = file.buffer.toString('utf-8');
        const result = this.importService.importGames(eventId, csvContent, importedBy);

        const statusCode = result.errors.length > 0 && result.imported === 0
            ? StatusCodes.BAD_REQUEST
            : StatusCodes.OK;

        return res.status(statusCode).json(result);
    }
}
