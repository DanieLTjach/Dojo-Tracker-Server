export function parseUma(umaString: string): number[] | number[][] {
    return JSON.parse(umaString) as number[] | number[][];
}
