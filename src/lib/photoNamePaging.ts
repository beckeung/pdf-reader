/** How newly added photos are placed into the report. */
export type PhotoInsertMode = 'continue' | 'newPage' | 'byName';

/** Filename rule: e.g. 1203-01 → room=1203, seq=1 */
export type FilenamePageRule = {
  roomLen: number;
  separator: string;
  seqLen: number;
};

export const DEFAULT_FILENAME_PAGE_RULE: FilenamePageRule = {
  roomLen: 4,
  separator: '-',
  seqLen: 2,
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function fileStem(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || filename;
  return base.replace(/\.[^.]+$/, '');
}

export function parseRoomPhotoName(
  filename: string,
  rule: FilenamePageRule = DEFAULT_FILENAME_PAGE_RULE,
): { room: string; seq: number } | null {
  const roomLen = Math.max(1, Math.min(12, Math.round(rule.roomLen) || 4));
  const seqLen = Math.max(1, Math.min(6, Math.round(rule.seqLen) || 2));
  const sep = rule.separator || '-';
  const stem = fileStem(filename);
  const re = new RegExp(
    `(\\d{${roomLen}})${escapeRegExp(sep)}(\\d{${seqLen}})`,
  );
  const m = stem.match(re);
  if (!m) return null;
  return { room: m[1], seq: Number.parseInt(m[2], 10) };
}

export type RoomFileGroup = {
  room: string;
  files: File[];
  /** true when filenames did not match the rule */
  unmatched?: boolean;
};

/** Group image files by room type; sort rooms and sequences. */
export function groupFilesByRoom(
  files: File[],
  rule: FilenamePageRule = DEFAULT_FILENAME_PAGE_RULE,
): RoomFileGroup[] {
  const map = new Map<string, { file: File; seq: number }[]>();
  const unmatched: File[] = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const parsed = parseRoomPhotoName(file.name, rule);
    if (!parsed) {
      unmatched.push(file);
      continue;
    }
    const list = map.get(parsed.room) ?? [];
    list.push({ file, seq: parsed.seq });
    map.set(parsed.room, list);
  }

  const rooms = [...map.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  const groups: RoomFileGroup[] = rooms.map((room) => {
    const list = map.get(room)!;
    list.sort((a, b) => a.seq - b.seq || a.file.name.localeCompare(b.file.name));
    return { room, files: list.map((x) => x.file) };
  });

  if (unmatched.length) {
    unmatched.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    groups.push({ room: '（未符合命名）', files: unmatched, unmatched: true });
  }

  return groups;
}

export function previewRoomGrouping(
  files: File[],
  rule: FilenamePageRule,
): { room: string; count: number; sample: string; unmatched?: boolean }[] {
  return groupFilesByRoom(files, rule).map((g) => ({
    room: g.room,
    count: g.files.length,
    sample: g.files[0]?.name ?? '',
    unmatched: g.unmatched,
  }));
}

export type PhotoSortDirection = 'asc' | 'desc';

/** Group existing photos by parsed room name for re-layout. */
export function groupPhotosByRoomName(
  photos: { id: string; name: string }[],
  rule: FilenamePageRule = DEFAULT_FILENAME_PAGE_RULE,
  direction: PhotoSortDirection = 'asc',
  customRoomOrder?: string[],
): { room: string; photoIds: string[] }[] {
  const map = new Map<string, { id: string; seq: number; name: string }[]>();
  const unmatched: { id: string; name: string }[] = [];

  for (const photo of photos) {
    const parsed = parseRoomPhotoName(photo.name, rule);
    if (!parsed) {
      unmatched.push(photo);
      continue;
    }
    const list = map.get(parsed.room) ?? [];
    list.push({ id: photo.id, seq: parsed.seq, name: photo.name });
    map.set(parsed.room, list);
  }

  let rooms = [...map.keys()];
  if (customRoomOrder?.length) {
    const order = new Map(customRoomOrder.map((r, i) => [r, i]));
    rooms.sort((a, b) => {
      const ia = order.has(a) ? order.get(a)! : 1e9;
      const ib = order.has(b) ? order.get(b)! : 1e9;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, 'en');
    });
  } else {
    rooms.sort((a, b) => a.localeCompare(b, 'en'));
    if (direction === 'desc') rooms.reverse();
  }

  const groups = rooms.map((room) => {
    const list = map.get(room)!;
    list.sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
    if (direction === 'desc' && !customRoomOrder?.length) {
      list.reverse();
    }
    return { room, photoIds: list.map((x) => x.id) };
  });

  if (unmatched.length) {
    unmatched.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    if (direction === 'desc' && !customRoomOrder?.length) {
      unmatched.reverse();
    }
    groups.push({
      room: '（未符合命名）',
      photoIds: unmatched.map((x) => x.id),
    });
  }

  return groups;
}

/** Unique room codes found in photo names (excluding unmatched). */
export function listRoomCodes(
  photos: { name: string }[],
  rule: FilenamePageRule = DEFAULT_FILENAME_PAGE_RULE,
): string[] {
  const set = new Set<string>();
  for (const photo of photos) {
    const parsed = parseRoomPhotoName(photo.name, rule);
    if (parsed) set.add(parsed.room);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'en'));
}
