export type TileCode =
    | 'man_1'
    | 'man_2'
    | 'man_3'
    | 'man_4'
    | 'man_5'
    | 'man_6'
    | 'man_7'
    | 'man_8'
    | 'man_9'
    | 'aka_man_5'
    | 'pin_1'
    | 'pin_2'
    | 'pin_3'
    | 'pin_4'
    | 'pin_5'
    | 'pin_6'
    | 'pin_7'
    | 'pin_8'
    | 'pin_9'
    | 'aka_pin_5'
    | 'sou_1'
    | 'sou_2'
    | 'sou_3'
    | 'sou_4'
    | 'sou_5'
    | 'sou_6'
    | 'sou_7'
    | 'sou_8'
    | 'sou_9'
    | 'aka_sou_5'
    | 'ton'
    | 'nan'
    | 'shaa'
    | 'pei'
    | 'haku'
    | 'hatsu'
    | 'chun';

export type CalledFrom = 'KAMICHA' | 'TOIMEN' | 'SHIMOCHA';

export type Meld =
    | { type: 'CHII', tiles: [TileCode, TileCode, TileCode], calledTileIndex: 0 | 1 | 2, calledFrom: 'KAMICHA' }
    | { type: 'PON', tiles: [TileCode, TileCode, TileCode], calledTileIndex: 0 | 1 | 2, calledFrom: CalledFrom }
    | {
        type: 'DAIMINKAN';
        tiles: [TileCode, TileCode, TileCode, TileCode];
        calledTileIndex: 0 | 1 | 2 | 3;
        calledFrom: CalledFrom;
    }
    | {
        type: 'KAKAN';
        tiles: [TileCode, TileCode, TileCode, TileCode];
        // The first three tiles are the original pon; the fourth is the added tile.
        calledTileIndex: 0 | 1 | 2;
        calledFrom: CalledFrom;
    }
    | { type: 'ANKAN', tiles: [TileCode, TileCode, TileCode, TileCode] };

export interface HandContext {
    doubleRiichi?: boolean | undefined;
    ippatsu?: boolean | undefined;
    haitei?: boolean | undefined;
    houtei?: boolean | undefined;
    rinshanKaihou?: boolean | undefined;
    chankan?: boolean | undefined;
    tenhou?: boolean | undefined;
    chiihou?: boolean | undefined;
    renhou?: boolean | undefined;
    localYaku?: string[] | undefined;
}

export interface HandDetail {
    concealedTiles: TileCode[];
    // Oldest call first. Call order is required to derive pao liability.
    melds: Meld[];
    winningTile: TileCode;
    doraIndicators: TileCode[];
    uraDoraIndicators: TileCode[];
    kitaCount?: number | undefined;
    context?: HandContext | undefined;
}

export type YakuCode =
    | 'menzen_tsumo'
    | 'riichi'
    | 'ippatsu'
    | 'chankan'
    | 'rinshan_kaihou'
    | 'haitei'
    | 'houtei'
    | 'haku'
    | 'hatsu'
    | 'chun'
    | 'bakaze_ton'
    | 'bakaze_nan'
    | 'bakaze_shaa'
    | 'bakaze_pei'
    | 'jikaze_ton'
    | 'jikaze_nan'
    | 'jikaze_shaa'
    | 'jikaze_pei'
    | 'tanyao'
    | 'pinfu'
    | 'iipeikou'
    | 'sanshoku_doujun'
    | 'ittsuu'
    | 'chanta'
    | 'chiitoitsu'
    | 'toitoi'
    | 'sanankou'
    | 'sanshoku_doukou'
    | 'sankantsu'
    | 'shousangen'
    | 'honroutou'
    | 'junchan'
    | 'ryanpeikou'
    | 'honitsu'
    | 'chinitsu'
    | 'double_riichi'
    | 'tenhou'
    | 'chiihou'
    | 'renhou'
    | 'kita'
    | 'daisangen'
    | 'suuankou'
    | 'suuankou_tanki'
    | 'tsuisou'
    | 'ryuisou'
    | 'chinroutou'
    | 'chuuren_poutou'
    | 'junsei_chuuren_poutou'
    | 'kokushi_musou'
    | 'kokushi_musou_13'
    | 'daisuushi'
    | 'shousuushi'
    | 'suukantsu'
    | 'dora'
    | 'aka_dora'
    | 'ura_dora'
    | 'yakuhai'
    | 'tsubame_gaeshi'
    | 'oopun_riichi'
    | 'sanrenkou'
    | 'suurenkou'
    | 'iishoku_sanjun'
    | 'iishoku_yonjun'
    | 'reversible_tiles'
    | 'uumensai'
    | 'shousharin'
    | 'paarenchan'
    | 'shiisan_puutaa'
    | 'shiisuu_puutaa'
    | 'daichisei'
    | 'daisharin'
    | 'daichikurin'
    | 'daisuurin'
    | 'beni_kujaku';

export type HandYaku =
    | { code: YakuCode, han: number }
    | { code: YakuCode, yakumanCount: number };

export interface ScoreHandInput {
    handDetail: HandDetail;
    winType: 'TSUMO' | 'RON';
    winnerSeat: number; // 0..3 (0 is East at start of round)
    dealerSeat: number; // 0..3
    roundWindSeat: number; // 0: East, 1: South, 2: West, 3: North
    dealInSeat?: number | undefined; // 0..3 (for RON)
    riichiPlayerSeats?: Set<number> | undefined;
    rules?: Record<string, any> | undefined;
    customRules?:
        | readonly {
            category: string;
            value: boolean | number | string;
            name?: string | undefined;
            presetId?: string | undefined;
        }[]
        | undefined;
}

export interface DerivedHandScore {
    han?: number | undefined;
    fu?: number | undefined;
    yakumanCount: number;
    yaku: HandYaku[];
    paoSeat?: number | undefined;
}
