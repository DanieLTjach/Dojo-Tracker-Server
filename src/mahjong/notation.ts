import type { CalledFrom, Meld, TileCode } from './types.ts';

const TILE_CODE_TO_MAJIANG: Record<TileCode, string> = {
    man_1: 'm1',
    man_2: 'm2',
    man_3: 'm3',
    man_4: 'm4',
    man_5: 'm5',
    man_6: 'm6',
    man_7: 'm7',
    man_8: 'm8',
    man_9: 'm9',
    aka_man_5: 'm0',
    pin_1: 'p1',
    pin_2: 'p2',
    pin_3: 'p3',
    pin_4: 'p4',
    pin_5: 'p5',
    pin_6: 'p6',
    pin_7: 'p7',
    pin_8: 'p8',
    pin_9: 'p9',
    aka_pin_5: 'p0',
    sou_1: 's1',
    sou_2: 's2',
    sou_3: 's3',
    sou_4: 's4',
    sou_5: 's5',
    sou_6: 's6',
    sou_7: 's7',
    sou_8: 's8',
    sou_9: 's9',
    aka_sou_5: 's0',
    ton: 'z1',
    nan: 'z2',
    shaa: 'z3',
    pei: 'z4',
    haku: 'z5',
    hatsu: 'z6',
    chun: 'z7',
};

const MAJIANG_TO_TILE_CODE: Record<string, TileCode> = Object.fromEntries(
    Object.entries(TILE_CODE_TO_MAJIANG).map(([k, v]) => [v, k as TileCode])
);

export function tileCodeToMajiang(tile: TileCode): string {
    return TILE_CODE_TO_MAJIANG[tile];
}

export function majiangToTileCode(str: string): TileCode {
    const tile = MAJIANG_TO_TILE_CODE[str];
    if (!tile) {
        throw new Error(`Unknown majiang tile notation: ${str}`);
    }
    return tile;
}

export function getBaseTileCode(tile: TileCode): TileCode {
    if (tile === 'aka_man_5') return 'man_5';
    if (tile === 'aka_pin_5') return 'pin_5';
    if (tile === 'aka_sou_5') return 'sou_5';
    return tile;
}

export function calledFromToSymbol(calledFrom: CalledFrom): '-' | '=' | '+' {
    if (calledFrom === 'KAMICHA') return '-';
    if (calledFrom === 'TOIMEN') return '=';
    if (calledFrom === 'SHIMOCHA') return '+';
    throw new Error(`Unknown calledFrom value: ${calledFrom}`);
}

export function getRelativeDirectionSymbol(
    winnerSeat: number,
    targetSeat: number,
    numberOfPlayers: number = 4
): '-' | '=' | '+' {
    if (numberOfPlayers === 3) {
        const diff = (targetSeat - winnerSeat + 3) % 3;
        if (diff === 2) return '-';
        if (diff === 1) return '+';
        throw new Error(`Invalid target seat relative to winner seat: winner ${winnerSeat}, target ${targetSeat}`);
    }
    const diff = (targetSeat - winnerSeat + 4) % 4;
    if (diff === 3) return '-';
    if (diff === 2) return '=';
    if (diff === 1) return '+';
    throw new Error(`Invalid target seat relative to winner seat: winner ${winnerSeat}, target ${targetSeat}`);
}

export function meldToMajiang(meld: Meld): string {
    if (meld.type === 'CHII') {
        const suit = TILE_CODE_TO_MAJIANG[meld.tiles[0]][0];
        const parts = meld.tiles.map((t, idx) => {
            const digit = TILE_CODE_TO_MAJIANG[t][1];
            return idx === meld.calledTileIndex ? digit + '-' : digit;
        });
        return suit + parts.join('');
    }

    if (meld.type === 'PON') {
        const dirSymbol = calledFromToSymbol(meld.calledFrom);
        const suit = TILE_CODE_TO_MAJIANG[meld.tiles[0]][0];
        const calledTile = meld.tiles[meld.calledTileIndex];
        const digits = [
            ...meld.tiles.filter((_, index) => index !== meld.calledTileIndex),
            calledTile,
        ].map(t => TILE_CODE_TO_MAJIANG[t][1]).join('');
        return suit + digits + dirSymbol;
    }

    if (meld.type === 'DAIMINKAN') {
        const dirSymbol = calledFromToSymbol(meld.calledFrom);
        const suit = TILE_CODE_TO_MAJIANG[meld.tiles[0]][0];
        const calledTile = meld.tiles[meld.calledTileIndex];
        const digits = [
            ...meld.tiles.filter((_, index) => index !== meld.calledTileIndex),
            calledTile,
        ].map(t => TILE_CODE_TO_MAJIANG[t][1]).join('');
        return suit + digits + dirSymbol;
    }

    if (meld.type === 'KAKAN') {
        const dirSymbol = calledFromToSymbol(meld.calledFrom);
        const suit = TILE_CODE_TO_MAJIANG[meld.tiles[0]][0];
        const originalPonTiles = meld.tiles.slice(0, 3);
        const calledTile = originalPonTiles[meld.calledTileIndex]!;
        const d0 = [
            ...originalPonTiles.filter((_, index) => index !== meld.calledTileIndex),
            calledTile,
        ].map(t => TILE_CODE_TO_MAJIANG[t][1]).join('');
        const d1 = TILE_CODE_TO_MAJIANG[meld.tiles[3]][1];
        return suit + d0 + dirSymbol + d1;
    }

    if (meld.type === 'ANKAN') {
        const suit = TILE_CODE_TO_MAJIANG[meld.tiles[0]][0];
        const digits = meld.tiles.map(t => TILE_CODE_TO_MAJIANG[t][1]).join('');
        return suit + digits;
    }

    throw new Error(`Unknown meld type: ${(meld as any).type}`);
}
