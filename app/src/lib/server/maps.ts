import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { uid } from "@/lib/utils";

export type SavedMapRow = {
  id: string;
  title: string;
  source_kind: string;
  duration_ms: number;
  receipt_json: string;
  created_at: string;
};

export const listHearingMaps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<SavedMapRow>`
      select id, title, source_kind, duration_ms, receipt_json, created_at
      from hearing_maps
      where user_id = ${context.userId}
      order by created_at desc
      limit 50
    `;
  });

export const getHearingMap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql<SavedMapRow>`
      select id, title, source_kind, duration_ms, receipt_json, created_at
      from hearing_maps
      where id = ${id} and user_id = ${context.userId}
      limit 1
    `;
    return rows[0] ?? null;
  });

export const saveHearingMap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      title: string;
      sourceKind: string;
      durationMs: number;
      receiptJson: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = uid();
    const title = data.title.trim().slice(0, 120) || "Untitled field";
    await sql`
      insert into hearing_maps (id, user_id, title, source_kind, duration_ms, receipt_json)
      values (${id}, ${context.userId}, ${title}, ${data.sourceKind}, ${data.durationMs}, ${data.receiptJson})
    `;
    return { id };
  });

export const deleteHearingMap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from hearing_maps where id = ${id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });
