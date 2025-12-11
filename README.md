# API
## Users API
### Register:
URL: /api/user/register
Type: POST
Format: {
  name
  telegram
  telegram_id
  id?
}
### Edit:
URL: /api/user/edit
Type: POST
Format: {
  telegram_id
  updateField (telegram_nickname, name)
  updateInfo
  modified_by
}
### Activate User:
URL: /api/user/activate
Type: POST
Format: {
  id
  modified_by
}
### Remove User:
URL: /api/user/remove
Type: POST
Format: {
  id
  modified_by
}
### Get User:
URL: /api/user/get
Type: POST
Format: {
  id
}
## Games API
### Add Game:
URL: /api/game/add
Type: POST
Format: {
  type
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
  id
  update_field
  update_info
  modified_by
}
### Remove Game:
URL: /api/game/remove
Type: POST
Format: {
  id
  modified_by
}
### Games List:
URL: /api/game/list
Type: GET
Format: {
  type
  date_from
  date_to
  user_id?
  club_id
}
### Get Game:
URL: /api/game/get
Type: GET
Format: {
  id
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
  name
  modified_by
}
### Edit Club
URL: /api/club/edit
Type: POST
Format: {
  id
  updateField
  updateInfo
  modified_by
}
### Remove Club
URL: /api/club/remove
Format: {
  id
  modified_by
}
Type: POST
### Club List
URL: /api/club/list
Type: GET
### Get Club
URL: /api/club/get
Type: GET
Format: {
  id
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
