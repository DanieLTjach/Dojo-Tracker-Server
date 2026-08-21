import { z } from 'zod';
import { AbortiveDrawType } from '../model/GameRoundResultModels.ts';
import { uniqueUserIdsSchema, userIdSchema } from './UserSchemas.ts';

const tileCodeValues = [
    'man_1',
    'man_2',
    'man_3',
    'man_4',
    'man_5',
    'man_6',
    'man_7',
    'man_8',
    'man_9',
    'aka_man_5',
    'pin_1',
    'pin_2',
    'pin_3',
    'pin_4',
    'pin_5',
    'pin_6',
    'pin_7',
    'pin_8',
    'pin_9',
    'aka_pin_5',
    'sou_1',
    'sou_2',
    'sou_3',
    'sou_4',
    'sou_5',
    'sou_6',
    'sou_7',
    'sou_8',
    'sou_9',
    'aka_sou_5',
    'ton',
    'nan',
    'shaa',
    'pei',
    'haku',
    'hatsu',
    'chun',
] as const;

export const tileCodeSchema = z.enum(tileCodeValues);

export const calledFromSchema = z.enum(['KAMICHA', 'TOIMEN', 'SHIMOCHA']);

export const meldSchema = z.union([
    z.object({
        type: z.literal('CHII'),
        tiles: z.tuple([tileCodeSchema, tileCodeSchema, tileCodeSchema]),
        calledTileIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        calledFrom: z.literal('KAMICHA'),
    }),
    z.object({
        type: z.literal('PON'),
        tiles: z.tuple([tileCodeSchema, tileCodeSchema, tileCodeSchema]),
        calledTileIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        calledFrom: calledFromSchema,
    }),
    z.object({
        type: z.literal('DAIMINKAN'),
        tiles: z.tuple([tileCodeSchema, tileCodeSchema, tileCodeSchema, tileCodeSchema]),
        calledTileIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        calledFrom: calledFromSchema,
    }),
    z.object({
        type: z.literal('KAKAN'),
        tiles: z.tuple([tileCodeSchema, tileCodeSchema, tileCodeSchema, tileCodeSchema]),
        calledTileIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        calledFrom: calledFromSchema,
    }),
    z.object({
        type: z.literal('ANKAN'),
        tiles: z.tuple([tileCodeSchema, tileCodeSchema, tileCodeSchema, tileCodeSchema]),
    }),
]);

export const handContextSchema = z.object({
    doubleRiichi: z.boolean().optional(),
    ippatsu: z.boolean().optional(),
    haitei: z.boolean().optional(),
    houtei: z.boolean().optional(),
    rinshanKaihou: z.boolean().optional(),
    chankan: z.boolean().optional(),
    tenhou: z.boolean().optional(),
    chiihou: z.boolean().optional(),
    renhou: z.boolean().optional(),
});

export const handDetailSchema = z.object({
    concealedTiles: z.array(tileCodeSchema),
    melds: z.array(meldSchema),
    winningTile: tileCodeSchema,
    doraIndicators: z.array(tileCodeSchema),
    uraDoraIndicators: z.array(tileCodeSchema),
    kitaCount: z.number().int().min(0).max(4).optional(),
    context: handContextSchema.optional(),
});

const yakuCodeValues = [
    'menzen_tsumo',
    'riichi',
    'ippatsu',
    'chankan',
    'rinshan_kaihou',
    'haitei',
    'houtei',
    'haku',
    'hatsu',
    'chun',
    'bakaze_ton',
    'bakaze_nan',
    'bakaze_shaa',
    'bakaze_pei',
    'jikaze_ton',
    'jikaze_nan',
    'jikaze_shaa',
    'jikaze_pei',
    'tanyao',
    'pinfu',
    'iipeikou',
    'sanshoku_doujun',
    'ittsuu',
    'chanta',
    'chiitoitsu',
    'toitoi',
    'sanankou',
    'sanshoku_doukou',
    'sankantsu',
    'shousangen',
    'honroutou',
    'junchan',
    'ryanpeikou',
    'honitsu',
    'chinitsu',
    'double_riichi',
    'tenhou',
    'chiihou',
    'renhou',
    'kita',
    'daisangen',
    'suuankou',
    'suuankou_tanki',
    'tsuisou',
    'ryuisou',
    'chinroutou',
    'chuuren_poutou',
    'junsei_chuuren_poutou',
    'kokushi_musou',
    'kokushi_musou_13',
    'daisuushi',
    'shousuushi',
    'suukantsu',
    'dora',
    'aka_dora',
    'ura_dora',
] as const;

export const yakuCodeSchema = z.enum(yakuCodeValues);

export const handYakuSchema = z.union([
    z.object({
        code: yakuCodeSchema,
        han: z.number().int().min(1),
    }),
    z.object({
        code: yakuCodeSchema,
        yakumanCount: z.number().int().min(1),
    }),
]);

const winningHandDataSchema = z.object({
    winnerPlayerId: userIdSchema,
    yakumanCount: z.number().int().min(0).max(6),
    yakumanLiabilityPlayerId: userIdSchema.optional(),
    han: z.number().int().min(1).max(100).optional(),
    fu: z.number().int().min(20).max(200).optional().refine(
        fu => fu === undefined || fu % 10 === 0 || fu === 25,
        { error: 'fu must a multiple of 10 or equal to 25' }
    ),
    handDetail: handDetailSchema.optional(),
    // Yaku is present in responses and persisted results, but is always derived
    // server-side when hand detail is supplied. Clients must never submit it.
    yaku: z.never({ error: 'yaku is server-derived' }).optional(),
}).refine(
    winningHandData => winningHandData.yakumanLiabilityPlayerId !== winningHandData.winnerPlayerId,
    { error: 'Yakuman liability player cannot be the same as winner' }
);

const tsumoSchema = z.object({
    type: z.literal('TSUMO'),
    winningHandData: winningHandDataSchema,
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
});

const ronSchema = z.object({
    type: z.literal('RON'),
    dealInPlayerId: userIdSchema,
    winningHandData: z.array(winningHandDataSchema).min(1).max(3).refine(
        winningHandData => {
            const uniquePlayerIds = new Set(winningHandData.map(hand => hand.winnerPlayerId));
            return uniquePlayerIds.size === winningHandData.length;
        },
        { error: 'Each winning player must be unique' }
    ),
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
});

const exhaustiveDrawSchema = z.object({
    type: z.literal('EXHAUSTIVE_DRAW'),
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
    tenpaiPlayerIds: uniqueUserIdsSchema('tenpai'),
    nagashiManganPlayerIds: uniqueUserIdsSchema('nagashi mangan'),
});

const abortiveDrawSchema = z.object({
    type: z.literal('ABORTIVE_DRAW'),
    riichiPlayerIds: uniqueUserIdsSchema('riichi'),
    drawType: z.enum(Object.values(AbortiveDrawType)),
});

const chomboSchema = z.object({
    type: z.literal('CHOMBO'),
    offenderPlayerId: userIdSchema,
});

export const gameRoundResultWithoutPointsSchema = z.union([
    tsumoSchema,
    ronSchema,
    exhaustiveDrawSchema,
    abortiveDrawSchema,
    chomboSchema,
]);
