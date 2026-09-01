import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

export const get = queryGeneric({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const row = await ctx.db
      .query("accounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return row ? { email: row.email, passwordHash: row.passwordHash } : null;
  },
});

export const put = mutationGeneric({
  args: { email: v.string(), passwordHash: v.string() },
  handler: async (ctx, { email, passwordHash }) => {
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { passwordHash });
    } else {
      await ctx.db.insert("accounts", { email, passwordHash });
    }
    return { email, passwordHash };
  },
});
