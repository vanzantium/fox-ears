create table if not exists hearing_maps (
  id          text primary key,
  user_id     text not null,
  title       text not null,
  source_kind text not null,
  duration_ms integer not null,
  receipt_json text not null,
  created_at  timestamptz not null default now()
);
create index if not exists hearing_maps_user_id_idx on hearing_maps (user_id);
create index if not exists hearing_maps_created_at_idx on hearing_maps (created_at desc);
