# API
## Users API
### Register:
URL: /api/user/register
Type: POST
Format: {
  user_name
  user_telegram
  user_telegram_id
  user_id?
}
### Edit:
URL: /api/user/edit
Type: POST
Format: {
  user_telgram_id
  updateField (user_telegram_nickname, user_name)
  updateInfo
  modified_by
}
### Remove User:
URL: /api/user/activate
Type: POST
Format: {
  user_id
  modified_by
}
### Activate User:
URL: /api/user/activate
Type: POST
Format: {
  user_id
  modified_by
}
### Get User:
URL: /api/user/get
Type: POST
Format: {
  user_id
}
## Games API
### Add Game:
URL: /api/game/add
Type: POST
Format: {
  game_type
  players_data: [{user, 
  points, 
  start_place
  }]
  modified_by
  created_at
  club_id
}
### Edit Game:
URL: /api/game/edit
Type: POST
Format: {
  game_id
  update_field
  update_info
  modified_by
}
### Remove Game:
URL: /api/game/remove
Type: POST
Format: {
  game_id
  modified_by
}
### Games List:
URL: /api/game/list
Type: GET
Format: {
  game_type
  date_from
  date_to
  user_id?
  club_id
}
### Get Game:
URL: /api/game/get
Type: GET
Format: {
  game_id
}
## Achievements API
### New Achievement
URL: /api/achievements/new
Type: POST
Format {
  name
  description
  modified_by
}
### Grant Achievement
URL: /api/achievements/grant
Type: POST
Format: {
  user_id
  achievement_id
  modified_by
}
### Achievements List
URL: /api/achievements/list
Type: GET
### User Achievements List
URL: /api/achievements/user_list
Type: GET
Format: {
  user_id
}
## Clubs API
### Add Club
URL: /api/club/add
Type: POST
Format: {
  club_name
  modified_by
}
### Edit Club
URL: /api/club/edit
Type: POST
Format: {
  club_id
  updateField
  updateInfo
  modified_by
}
### Remove Club
URL: /api/club/remove
Format: {
  club_id
  modified_by
}
Type: POST
### Club List
URL: /api/club/list
Type: GET
### Get Club
URL: /api/club/get
Type: GET
Foemat: {
  club_id
}
## Events API
### Add Event
URL: /api/event/add
Type: POST
Format: {
  name
  type
  date_from
  date_to
  modified_by
}
### Edit Event
URL: /api/event/edit
Type: POST
Format: {
  id
  name
  type
  date_from
  date_to
  modified_by
}
### Remove Event
URL: /api/event/remove
Type: POST
Format: {
   id
   modified_by
}
### Event List
URL: /api/event/list
Type: GET
