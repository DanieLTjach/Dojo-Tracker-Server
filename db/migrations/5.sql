ALTER TABLE clubTelegramTopics ADD COLUMN clubLogs TEXT;
ALTER TABLE clubTelegramTopics ADD COLUMN main TEXT;

CREATE TABLE clubPollConfig (
    clubId INTEGER PRIMARY KEY REFERENCES club(id),
    pollTitle TEXT NOT NULL,
    eventDays TEXT NOT NULL,
    sendDay INTEGER NOT NULL,
    sendTime TEXT NOT NULL,
    extraOptions TEXT,
    isActive BOOL NOT NULL DEFAULT true,
    createdAt TIMESTAMP NOT NULL,
    modifiedAt TIMESTAMP NOT NULL,
    modifiedBy INTEGER NOT NULL REFERENCES user(id)
);
UPDATE gameRules SET uma = '[15,5,-5,-15]' WHERE numberOfPlayers = 4;
UPDATE gameRules SET uma = '[15,0,-15]' WHERE numberOfPlayers = 3;
UPDATE gameRules SET uma = '[[24,-2,-6,-16],[16,8,-8,-16],[16,6,2,-24]]' WHERE name = 'Сезон 6 йонма';

ALTER TABLE gameRules ADD COLUMN details TEXT;

UPDATE gameRules
SET name = 'Сезон 3-4 йонма'
WHERE id = 1
  AND name = 'Сезон 3-5 йонма';

INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, clubId, umaTieBreak)
VALUES (10, 'Сезон 5 йонма', 4, '[15,5,-5,-15]', 30000, NULL, 1, 'DIVIDE');

UPDATE event
SET gameRules = 10
WHERE gameRules = 1
  AND clubId = 1
  AND name = 'Сезон 5';

UPDATE gameRules SET details = '{"preset":"ema_2025","rules":{"counted_yakuman":true,"double_yakuman":true,"nagashi_mangan":true,"nagashi_mangan_count_as_a_win":false,"call_precedence":"ron_pon","red_fives":"three_one_per_suit","riichi_1000_points_min":false,"starting_points":30000,"yakuman_stacking":true}}' WHERE id = 1;
UPDATE gameRules SET details = '{"preset":"ema_2025","rules":{"counted_yakuman":true,"double_yakuman":true,"nagashi_mangan":true,"nagashi_mangan_count_as_a_win":false,"call_precedence":"ron_pon","red_fives":"three_one_per_suit","riichi_1000_points_min":false,"starting_points":30000,"yakuman_stacking":true}}' WHERE id = 2;
UPDATE gameRules SET details = '{"preset":"mahjong_soul_sanma","rules":{"abortive_draw":false,"agari_yame":"no","bankrupt":"none","blessing_of_man":"mangan","continuance_payment":"all","goal":30000,"kan_dora_called_promoted_quad":"before_discard","mangan_rounding_up":true,"noten_penalty":3000,"red_fives":"three_one_per_suit","riichi_1000_points_min":false,"riichi_without_a_next_draw":true,"tenpai_yame":"no","uma_tie_break":"equal_split","west_round":false}}' WHERE id = 3;
UPDATE gameRules SET details = '{"preset":"ema_2025","rules":{},"links":[{"url":"http://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf","label":"Riichi Rules 2025 (PDF)"}]}' WHERE id = 4;
UPDATE gameRules SET details = '{"preset":"mahjong_soul","rules":{},"links":[{"url":"https://riichi.wiki/Mahjong_Soul","label":"Mahjong Soul"}]}' WHERE id = 5;
UPDATE gameRules SET details = '{"preset":"mahjong_soul_sanma","rules":{},"links":[{"url":"https://riichi.wiki/Mahjong_Soul#3P-Mahjong","label":"Mahjong Soul - 3P Mahjong"}]}' WHERE id = 6;
UPDATE gameRules SET details = '{"preset":"mahjong_soul","rules":{"abortive_draw":false,"blessing_of_man":"yakuman","kan_dora_called_promoted_quad":"before_discard","mangan_rounding_up":true,"call_precedence":"ron_first","riichi_without_a_next_draw":true,"uma_tie_break":"equal_split","west_round":false}}' WHERE id = 7;
UPDATE gameRules SET details = '{"preset":"mahjong_soul_sanma","rules":{"abortive_draw":false,"blessing_of_man":"yakuman","mangan_rounding_up":true,"riichi_without_a_next_draw":true,"uma_tie_break":"equal_split"}}' WHERE id = 8;
UPDATE gameRules SET details = '{"preset":"mahjong_soul","rules":{"abortive_draw":false,"blessing_of_man":"yakuman","continuation":"agari","kan_dora_called_promoted_quad":"before_discard","mangan_rounding_up":true,"call_precedence":"ron_first","riichi_without_a_next_draw":true,"triple_ron":"cancel","uma_tie_break":"equal_split"}}' WHERE id = 9;
UPDATE gameRules SET details = '{"preset":"mahjong_soul","rules":{"abortive_draw":false,"bankrupt":"zero_or_less","blessing_of_man":"mangan","continuance_payment":"all","honba":"3x500","kan_dora_called_promoted_quad":"before_discard","red_fives":"three_one_per_suit","starting_points":30000,"uma_tie_break":"equal_split","west_round":false}}' WHERE id = 10;
