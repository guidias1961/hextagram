// db.js
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
});

const init = async () => {
  await pool.query(`
    create table if not exists users (
      address text primary key,
      username text,
      bio text,
      avatar_url text
    );
  `);

  await pool.query(`
    create table if not exists posts (
      id serial primary key,
      user_address text not null,
      media_url text not null,
      media_type text,
      caption text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists likes (
      id serial primary key,
      post_id integer not null,
      user_address text not null,
      unique (post_id, user_address)
    );
  `);

  await pool.query(`
    create table if not exists comments (
      id serial primary key,
      post_id integer not null,
      user_address text not null,
      content text not null,
      created_at timestamptz default now()
    );
  `);
};

const getUser = async (address) => {
  const r = await pool.query(
    "select address, username, bio, avatar_url from users where address = $1",
    [address]
  );
  return r.rows[0];
};

const upsertUser = async (address, username, bio, avatar_url) => {
  await pool.query(
    `
    insert into users (address, username, bio, avatar_url)
    values ($1, $2, $3, $4)
    on conflict (address) do update set
      username = excluded.username,
      bio = excluded.bio,
      avatar_url = excluded.avatar_url
    `,
    [address, username, bio, avatar_url]
  );
};

const getPosts = async () => {
  const r = await pool.query(`
    select
      p.id,
      p.user_address,
      p.media_url,
      p.media_type,
      p.caption,
      p.created_at,
      u.username,
      u.avatar_url,
      (select count(*) from likes l where l.post_id = p.id) as likes_count,
      (select count(*) from comments c where c.post_id = p.id) as comments_count
    from posts p
    left join users u on u.address = p.user_address
    order by p.created_at desc
  `);
  return r.rows;
};

const createPost = async (address, media_url, media_type, caption) => {
  const r = await pool.query(
    `
    insert into posts (user_address, media_url, media_type, caption)
    values ($1, $2, $3, $4)
    returning *
    `,
    [address, media_url, media_type, caption]
  );
  return r.rows[0];
};

const likePost = async (postId, address) => {
  await pool.query(
    `
    insert into likes (post_id, user_address)
    values ($1, $2)
    on conflict do nothing
    `,
    [postId, address]
  );
};

const getComments = async (postId) => {
  const r = await pool.query(
    `
    select id, post_id, user_address, content, created_at
    from comments
    where post_id = $1
    order by created_at asc
    `,
    [postId]
  );
  return r.rows;
};

const addComment = async (postId, address, content) => {
  await pool.query(
    `
    insert into comments (post_id, user_address, content)
    values ($1, $2, $3)
    `,
    [postId, address, content]
  );
};

export default {
  init,
  getUser,
  upsertUser,
  getPosts,
  createPost,
  likePost,
  getComments,
  addComment
};

