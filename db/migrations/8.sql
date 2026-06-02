-- Remove the deprecated nagashi_mangan_count_as_a_win rule from the EMA 2025 ruleset.
-- 5.sql already ran on the server, so update the details JSON here instead of editing 5.sql.
UPDATE gameRules SET details = '{"preset":"ema_2025","rules":{"call_precedence":"ron_pon","chombo":"mangan","counted_yakuman":true,"double_yakuman":true,"nagashi_mangan":true,"red_fives":"three_one_per_suit","starting_points":30000,"yakuman_stacking":true}}' WHERE id = 2;
