-- Fix Sanma ruleset (id 3): noten_penalty was erroneously set to yonma 3000
-- instead of sanma 2000, red_fives was set to three_one_per_suit instead of
-- two_red_fives_five_pin_and_five_sou, and chombo is set to baiman.
UPDATE gameRules
SET details = '{"preset":"mahjong_soul_sanma","rules":{"abortive_draw":false,"agari_yame":"no","bankrupt":"none","blessing_of_man":"mangan","chombo":"baiman","continuance_payment_on_multiple_ron":"all","goal":35000,"kan_dora_called_promoted_quad":"before_discard","mangan_rounding_up":true,"noten_penalty":2000,"red_fives":"two_red_fives_five_pin_and_five_sou","riichi_1000_points_min":false,"riichi_without_a_next_draw":true,"tenpai_yame":"no","west_round":false}}'
WHERE id = 3;
