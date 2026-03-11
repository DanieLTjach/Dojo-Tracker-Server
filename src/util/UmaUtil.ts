export function parseUma(umaString: string): number[] | number[][] {
    const parsedUma = umaString.split(';').map(part => part.split(',').map(Number));
    if (parsedUma.length === 1) {
        return parsedUma[0]!;
    }
    return parsedUma;
}
