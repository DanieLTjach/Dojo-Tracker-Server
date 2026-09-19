import Majiang from 'majiang-core';
import { getBaseTileCode, majiangToTileCode, tileCodeToMajiang } from './notation.ts';
import type { TileCode } from './types.ts';

// The single majiang-core touchpoint for dora resolution: the indicator tile's
// next tile up the sequence, honouring sanma's missing 2-8 man. Returns the
// base (non-aka) tile code, so aka indicators resolve to their plain dora.
export function resolveDoraTile(indicator: TileCode, isSanma: boolean): TileCode {
    const dora = Majiang.Shan.zhenbaopai(tileCodeToMajiang(indicator), isSanma);
    return getBaseTileCode(majiangToTileCode(dora));
}
