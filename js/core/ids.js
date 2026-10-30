let counter = 0;

/** Короткий уникальный идентификатор с префиксом типа: wall_lq3k9a1x. */
export function uid(prefix = 'id') {
  counter = (counter + 1) % 46656;
  const time = Date.now().toString(36).slice(-5);
  const rnd = Math.random().toString(36).slice(2, 5);
  return `${prefix}_${time}${rnd}${counter.toString(36)}`;
}
