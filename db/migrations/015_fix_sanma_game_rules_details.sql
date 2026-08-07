-- Fix Sanma ruleset (id 3): remove incorrect yonma overrides (noten_penalty, red_fives)
-- so they inherit from mahjong_soul_sanma preset, and update chombo to baiman.
UPDATE gameRules
SET details = '{"preset":"mahjong_soul_sanma","rules":{"abortive_draw":false,"agari_yame":"no","bankrupt":"none","blessing_of_man":"mangan","chombo":"baiman","continuance_payment_on_multiple_ron":"all","goal":35000,"kan_dora_called_promoted_quad":"before_discard","mangan_rounding_up":true,"riichi_1000_points_min":false,"riichi_without_a_next_draw":true,"tenpai_yame":"no","west_round":false}}'
WHERE id = 3;
