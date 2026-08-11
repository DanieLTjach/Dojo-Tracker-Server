import { UnmappedYakuError } from '../error/PointCalculationErrors.ts';
import type { YakuCode } from './types.ts';

const JAPANESE_YAKU_TO_CODE: Record<string, YakuCode> = {
    '立直': 'riichi',
    'ダブル立直': 'double_riichi',
    '門前清自摸和': 'menzen_tsumo',
    '一発': 'ippatsu',
    '海底摸月': 'haitei',
    '河底撈魚': 'houtei',
    '嶺上開花': 'rinshan_kaihou',
    '槍槓': 'chankan',
    '天和': 'tenhou',
    '地和': 'chiihou',
    '場風 東': 'bakaze_ton',
    '場風 南': 'bakaze_nan',
    '場風 西': 'bakaze_shaa',
    '場風 北': 'bakaze_pei',
    '自風 東': 'jikaze_ton',
    '自風 南': 'jikaze_nan',
    '自風 西': 'jikaze_shaa',
    '自風 北': 'jikaze_pei',
    '翻牌 白': 'haku',
    '翻牌 發': 'hatsu',
    '翻牌 中': 'chun',
    '平和': 'pinfu',
    '断幺九': 'tanyao',
    '一盃口': 'iipeikou',
    '三色同順': 'sanshoku_doujun',
    '一気通貫': 'ittsuu',
    '混全帯幺九': 'chanta',
    '七対子': 'chiitoitsu',
    '対々和': 'toitoi',
    '三暗刻': 'sanankou',
    '三槓子': 'sankantsu',
    '三色同刻': 'sanshoku_doukou',
    '混老頭': 'honroutou',
    '小三元': 'shousangen',
    '混一色': 'honitsu',
    '純全帯幺九': 'junchan',
    '二盃口': 'ryanpeikou',
    '清一色': 'chinitsu',
    '国士無双十三面': 'kokushi_musou_13',
    '国士無双': 'kokushi_musou',
    '四暗刻単騎': 'suuankou_tanki',
    '四暗刻': 'suuankou',
    '大三元': 'daisangen',
    '大四喜': 'daisuushi',
    '小四喜': 'shousuushi',
    '字一色': 'tsuisou',
    '緑一色': 'ryuisou',
    '清老頭': 'chinroutou',
    '四槓子': 'suukantsu',
    '純正九蓮宝燈': 'junsei_chuuren_poutou',
    '九蓮宝燈': 'chuuren_poutou',
    'ドラ': 'dora',
    '赤ドラ': 'aka_dora',
    '裏ドラ': 'ura_dora',
};

export function mapJapaneseYakuToCode(name: string): YakuCode {
    const code = JAPANESE_YAKU_TO_CODE[name];
    if (!code) {
        throw new UnmappedYakuError(name);
    }
    return code;
}
