import { query } from "./db";

export async function audit(input: {
  organisationId: string;
  actorUserId: string;
  action: string;
  objectType: string;
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  await query(
    `insert into audit_logs
      (organisation_id, actor_user_id, action, object_type, object_id, before_value, after_value, metadata)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
    [
      input.organisationId,input.actorUserId,input.action,input.objectType,input.objectId ?? null,
      JSON.stringify(input.before ?? null),JSON.stringify(input.after ?? null),JSON.stringify(input.metadata ?? null)
    ]
  );
}
