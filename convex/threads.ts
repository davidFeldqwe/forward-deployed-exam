import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

function document(row: {
  threadId: string;
  ownerEmail: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: unknown[];
}) {
  return {
    id: row.threadId,
    ownerEmail: row.ownerEmail,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messages: row.messages,
  };
}

export const get = queryGeneric({
  args: { threadId: v.string(), ownerEmail: v.string() },
  handler: async (ctx, { threadId, ownerEmail }) => {
    const row = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique();
    if (!row || row.ownerEmail !== ownerEmail) {
      return null;
    }
    return document(row);
  },
});

export const listByOwner = queryGeneric({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_owner_updatedAt", (q) => q.eq("ownerEmail", ownerEmail))
      .order("desc")
      .collect();
    return rows.map(document);
  },
});

export const put = mutationGeneric({
  args: {
    threadId: v.string(),
    ownerEmail: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    messages: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (existing && existing.ownerEmail !== args.ownerEmail) {
      return null;
    }
    const fields = {
      threadId: args.threadId,
      ownerEmail: args.ownerEmail,
      title: args.title,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
      messages: args.messages,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: fields.title,
        updatedAt: fields.updatedAt,
        messages: fields.messages,
      });
    } else {
      await ctx.db.insert("threads", fields);
    }
    return document(fields);
  },
});
